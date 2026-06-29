import {
  readProcessedLevels,
  readRuntimeStatus,
  type StretchBoundarySession,
} from "../boundary/session";
import {
  defaultDesiredControls,
  defaultSimulatedSource,
  enumIndex,
  PROBE_STATES,
  RUNTIME_STATES,
  type DesiredStretchControls,
  type ProcessedLevelsSnapshot,
  type RuntimeState,
  type RuntimeStatusSnapshot,
  type SimulatedSource,
} from "../types";

import type {
  StretchCommand,
  StretchCommandTransport,
} from "../boundary/commands";

export interface FakeStretchEngineOptions {
  readonly applyDelayTicks?: number;
  readonly sessionId?: number;
  readonly source?: SimulatedSource;
}

export interface TickOptions {
  readonly renderQuantum?: number;
}

export interface FakeStretchTickResult {
  readonly levels: ProcessedLevelsSnapshot;
  readonly pendingDesiredSequence: number | null;
  readonly runtime: RuntimeStatusSnapshot;
}

export class FakeStretchEngine {
  private readonly applyDelayTicks: number;
  private readonly historyPeak = new Float32Array(64);
  private readonly historyRms = new Float32Array(64);
  private readonly session: StretchBoundarySession;
  private readonly sessionId: number;
  private readonly transport: StretchCommandTransport;

  private appliedControls: DesiredStretchControls = defaultDesiredControls();
  private fullScaleLeftTotal = 0;
  private fullScaleRightTotal = 0;
  private historyCursor = 0;
  private invalidSampleTotal = 0;
  private invalidTransitionTotal = 0;
  private lastAppliedCommandSequence = 0;
  private lastErrorCode = 0;
  private loopEnabled = false;
  private loopEndFrame = 0;
  private loopRevision = 0;
  private loopStartFrame = 0;
  private maxObservedRenderQuantum = 0;
  private outputFrame = 0;
  private pendingControls: DesiredStretchControls | null = null;
  private pendingTicks = 0;
  private runtimeState: RuntimeState = "ready-paused";
  private seekStateTicks = 0;
  private source: SimulatedSource;
  private sourceFrame = 0;
  private staleReadBursts = 0;
  private staleReadTotal = 0;
  private underrunTotal = 0;
  private unsupportedChannelBlockTotal = 0;

  constructor(
    session: StretchBoundarySession,
    transport: StretchCommandTransport,
    options: FakeStretchEngineOptions = {},
  ) {
    this.session = session;
    this.transport = transport;
    this.applyDelayTicks = options.applyDelayTicks ?? 2;
    this.sessionId = options.sessionId ?? 1;
    this.source = options.source ?? defaultSimulatedSource();
  }

  get currentSource(): SimulatedSource {
    return this.source;
  }

  get lastAppliedDesiredSequence(): number {
    return this.appliedControls.desiredSequence;
  }

  get pendingDesiredSequence(): number | null {
    return this.pendingControls?.desiredSequence ?? null;
  }

  loadSource(source: SimulatedSource): void {
    this.source = source;
    this.outputFrame = 0;
    this.sourceFrame = 0;
    this.loopEnabled = false;
    this.loopStartFrame = 0;
    this.loopEndFrame = 0;
    this.loopRevision = 0;
    this.runtimeState = "ready-paused";
    this.lastErrorCode = 0;
    this.historyPeak.fill(0);
    this.historyRms.fill(0);
  }

  resetTransportPosition(): void {
    this.outputFrame = 0;
    this.sourceFrame = 0;
    this.runtimeState = "ready-paused";
    this.seekStateTicks = 0;
  }

  simulateStaleRead(count = 1): void {
    this.staleReadBursts += Math.max(1, Math.floor(count));
  }

  setFault(errorCode = 9_001): void {
    this.lastErrorCode = errorCode >>> 0;
    this.runtimeState = "failed-recoverable";
  }

  tick(options: TickOptions = {}): FakeStretchTickResult {
    const renderQuantum = Math.max(1, Math.floor(options.renderQuantum ?? 256));
    this.maxObservedRenderQuantum = Math.max(
      this.maxObservedRenderQuantum,
      renderQuantum,
    );

    this.drainCommands();

    if (this.runtimeState !== "failed-recoverable") {
      this.readDesiredControls();
      this.applyPendingDesired();
      this.advanceTransport(renderQuantum);
    }

    this.publishRuntime(renderQuantum);
    this.publishLevels(renderQuantum);

    return {
      levels: readProcessedLevels(this.session),
      pendingDesiredSequence: this.pendingDesiredSequence,
      runtime: readRuntimeStatus(this.session),
    };
  }

  private readDesiredControls(): void {
    if (this.staleReadBursts > 0) {
      this.staleReadBursts -= 1;
      this.staleReadTotal += 1;
      return;
    }

    let nextControls = this.appliedControls;

    this.session.desired.processor.params.within((params) => {
      nextControls = {
        desiredSequence: params.control.desiredSequence,
        formantBaseHz: params.control.formantBaseHz,
        formantCompensation: params.control.formantCompensation,
        formantSemitones: params.control.formantSemitones,
        pitchSemitones: params.control.pitchSemitones,
        rate: params.control.rate,
        tonalityEnabled: params.control.tonalityEnabled,
        tonalityHz: params.control.tonalityHz,
        transitionFrames: params.control.transitionFrames,
      };
    });

    if (
      nextControls.desiredSequence !== this.appliedControls.desiredSequence &&
      nextControls.desiredSequence !== this.pendingControls?.desiredSequence
    ) {
      this.pendingControls = nextControls;
      this.pendingTicks = this.applyDelayTicks;
    }
  }

  private applyPendingDesired(): void {
    if (!this.pendingControls) {
      return;
    }

    this.pendingTicks -= 1;
    if (this.pendingTicks > 0) {
      return;
    }

    this.appliedControls = this.pendingControls;
    this.pendingControls = null;
    this.pendingTicks = 0;
  }

  private drainCommands(): void {
    this.transport.drain((command) => {
      this.applyCommand(command);
    });
  }

  private applyCommand(command: StretchCommand): void {
    this.lastAppliedCommandSequence = command.sequence;

    if (this.runtimeState === "failed-recoverable") {
      if (command.name === "resetFault") {
        this.lastErrorCode = 0;
        this.runtimeState = "ready-paused";
      }
      return;
    }

    switch (command.name) {
      case "clearLoop":
        this.loopEnabled = false;
        this.loopRevision += 1;
        break;
      case "pause":
        this.runtimeState = "ready-paused";
        break;
      case "play":
        this.runtimeState = "playing";
        break;
      case "resetFault":
        this.lastErrorCode = 0;
        this.runtimeState = "ready-paused";
        break;
      case "seek":
        this.seekToFrame(command.arg0);
        break;
      case "setLoop":
        this.setLoop(command.arg0, command.arg1, command.arg2);
        break;
      case "stop":
        this.resetTransportPosition();
        break;
    }
  }

  private seekToFrame(frame: number): void {
    const target = clamp(frame, 0, this.source.frames);
    this.sourceFrame = target;
    this.outputFrame = target / Math.max(0.125, this.appliedControls.rate);
    this.seekStateTicks = 2;
  }

  private setLoop(
    startFrame: number,
    endFrame: number,
    revision: number,
  ): void {
    const start = clamp(startFrame, 0, this.source.frames);
    const end = clamp(endFrame, 0, this.source.frames);

    if (end <= start) {
      this.invalidTransitionTotal += 1;
      return;
    }

    this.loopEnabled = true;
    this.loopStartFrame = start;
    this.loopEndFrame = end;
    this.loopRevision = revision >>> 0;
  }

  private advanceTransport(renderQuantum: number): void {
    if (this.seekStateTicks > 0) {
      this.seekStateTicks -= 1;
      return;
    }

    if (this.runtimeState !== "playing") {
      return;
    }

    this.outputFrame += renderQuantum;
    this.sourceFrame +=
      renderQuantum * Math.max(0.125, this.appliedControls.rate);

    if (this.loopEnabled && this.sourceFrame >= this.loopEndFrame) {
      const loopLength = Math.max(1, this.loopEndFrame - this.loopStartFrame);
      const loopOffset = (this.sourceFrame - this.loopStartFrame) % loopLength;
      this.sourceFrame = this.loopStartFrame + loopOffset;
    }

    if (!this.loopEnabled && this.sourceFrame >= this.source.frames) {
      this.sourceFrame = this.source.frames;
      this.runtimeState = "ended";
    }
  }

  private publishRuntime(renderQuantum: number): void {
    const state = this.stateForPublish();
    const bufferReadyFrames = clamp(
      this.source.frames - Math.floor(this.sourceFrame),
      0,
      0xffffffff,
    );

    this.session.runtime.processor.meters.publish((writer) => {
      writer.set("runtime.bufferReadyFrames", bufferReadyFrames);
      writer.set("runtime.commandDroppedTotal", this.transport.stats().dropped);
      writer.set("runtime.invalidTransitionTotal", this.invalidTransitionTotal);
      writer.set(
        "runtime.lastAppliedCommandSequence",
        this.lastAppliedCommandSequence,
      );
      writer.set(
        "runtime.lastAppliedDesiredSequence",
        this.appliedControls.desiredSequence,
      );
      writer.set("runtime.lastErrorCode", this.lastErrorCode);
      writer.set("runtime.loopEnabled", this.loopEnabled);
      writer.set("runtime.loopEndFrame", this.loopEndFrame);
      writer.set("runtime.loopRevision", this.loopRevision);
      writer.set("runtime.loopStartFrame", this.loopStartFrame);
      writer.set(
        "runtime.maxObservedRenderQuantum",
        this.maxObservedRenderQuantum,
      );
      writer.set("runtime.outputFrame", this.outputFrame);
      writer.set(
        "runtime.processingCenterFrame",
        this.sourceFrame + (renderQuantum * this.appliedControls.rate) / 2,
      );
      writer.set("runtime.sessionId", this.sessionId);
      writer.set("runtime.sourceFrame", this.sourceFrame);
      writer.set("runtime.staleReadTotal", this.staleReadTotal);
      writer.set("runtime.state", enumIndex(RUNTIME_STATES, state));
      writer.set("runtime.underrunTotal", this.underrunTotal);
    });
  }

  private publishLevels(renderQuantum: number): void {
    const state = this.stateForPublish();
    const active = state === "playing" || state === "seeking";
    const failed =
      state === "failed-recoverable" || state === "failed-terminal";
    const phase = (this.sourceFrame / this.source.sampleRate) * Math.PI * 2;
    const motion = Math.abs(Math.sin(phase * 0.77));
    const pitchLift = Math.min(
      0.18,
      Math.abs(this.appliedControls.pitchSemitones) / 48,
    );
    const formantLift = Math.min(
      0.1,
      Math.abs(this.appliedControls.formantSemitones) / 96,
    );
    const clipNow =
      active &&
      this.outputFrame > 0 &&
      Math.floor(this.outputFrame / 4_096) % 17 === 8;
    const peakLeft = active
      ? Math.min(clipNow ? 1.04 : 0.98, 0.18 + motion * 0.62 + pitchLift)
      : 0;
    const peakRight =
      this.source.channels === 2
        ? Math.min(clipNow ? 1.02 : 0.95, peakLeft * 0.92 + formantLift)
        : 0;
    const rmsLeft = active ? peakLeft * 0.58 : 0;
    const rmsRight = this.source.channels === 2 ? peakRight * 0.56 : 0;

    if (clipNow) {
      this.fullScaleLeftTotal += 1;
      if (this.source.channels === 2) {
        this.fullScaleRightTotal += 1;
      }
    }

    this.historyRms[this.historyCursor] = rmsLeft;
    this.historyPeak[this.historyCursor] = Math.max(peakLeft, peakRight);
    this.historyCursor = (this.historyCursor + 1) % this.historyRms.length;

    this.session.levels.processor.meters.publish((writer) => {
      writer.set("levels.channelCount", this.source.channels);
      writer.set("levels.fullScaleLeftTotal", this.fullScaleLeftTotal);
      writer.set("levels.fullScaleRightTotal", this.fullScaleRightTotal);
      writer.set("levels.invalidSampleTotal", this.invalidSampleTotal);
      writer.set("levels.lastErrorCode", failed ? this.lastErrorCode : 0);
      writer.set("levels.peakLeft", peakLeft);
      writer.set("levels.peakRight", peakRight);
      writer.set(
        "levels.probeState",
        enumIndex(
          PROBE_STATES,
          failed ? "failed" : active ? "active" : "ready",
        ),
      );
      writer.set("levels.rmsLeft", rmsLeft);
      writer.set("levels.rmsRight", rmsRight);
      writer.set("levels.silent", !active || rmsLeft < 0.001);
      writer.set(
        "levels.unsupportedChannelBlockTotal",
        this.unsupportedChannelBlockTotal,
      );
      writer.set("levels.windowEndOutputFrame", this.outputFrame);
      writer.set("levels.windowFrames", renderQuantum);
      writer.stage("levels.historyPeak", (history) => {
        history.set(this.historyPeak);
      });
      writer.stage("levels.historyRms", (history) => {
        history.set(this.historyRms);
      });
    });
  }

  private stateForPublish(): RuntimeState {
    if (this.runtimeState === "failed-recoverable") {
      return "failed-recoverable";
    }

    if (this.seekStateTicks > 0) {
      return "seeking";
    }

    return this.runtimeState;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
