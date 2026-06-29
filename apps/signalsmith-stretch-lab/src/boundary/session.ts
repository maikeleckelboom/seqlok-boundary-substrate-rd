import {
  acceptHandoff,
  allocateShared,
  bindController,
  bindObserver,
  bindProcessor,
  BoundaryError,
  buildHandoff,
  isBoundaryError,
  planLayout,
  verifyHandoff,
  type ControllerBinding,
  type Handoff,
  type ObserverBinding,
  type ProcessorBinding,
  type SpecInput,
} from "@exclave/boundary";

import {
  ADAPTER_MODES,
  defaultDesiredControls,
  enumLabel,
  PROBE_STATES,
  RUNTIME_STATES,
  SOURCE_STATES,
  type DesiredStretchControls,
  type ProcessedLevelsSnapshot,
  type RuntimeStatusSnapshot,
  type SourceStatusSnapshot,
} from "../types";
import {
  desiredStretchSpec,
  processedOutputLevelsSpec,
  runtimeStatusSpec,
  sourceStatusSpec,
} from "./specs";

export interface BoundaryPlanSummary {
  readonly bytesTotal: number;
  readonly handoffPacking: "shared" | "shared-partitioned";
  readonly handoffVersion: number;
  readonly hash: string;
  readonly id: string;
  readonly lockStrideBytes: number;
  readonly meterVersion: number;
  readonly paramVersion: number;
  readonly planes: BoundaryPlaneByteLengths;
}

export interface BoundaryPlaneByteLengths {
  readonly MF32: number;
  readonly MF64: number;
  readonly MU: number;
  readonly MU32: number;
  readonly PB: number;
  readonly PF32: number;
  readonly PI32: number;
  readonly PU: number;
}

interface AppBoundarySession<S extends SpecInput> {
  readonly controller: ControllerBinding<S>;
  readonly handoff: Handoff<S>;
  readonly observer: ObserverBinding<S>;
  readonly plan: ReturnType<typeof planLayout<S>>;
  readonly processor: ProcessorBinding<S>;
}

export interface StretchBoundarySession {
  readonly desired: AppBoundarySession<typeof desiredStretchSpec>;
  readonly levels: AppBoundarySession<typeof processedOutputLevelsSpec>;
  readonly runtime: AppBoundarySession<typeof runtimeStatusSpec>;
  readonly source: AppBoundarySession<typeof sourceStatusSpec>;
}

function createAppBoundarySession<const S extends SpecInput>(
  spec: S,
): AppBoundarySession<S> {
  const plan = planLayout(spec);
  const backing = allocateShared(plan);
  const controller = bindController(spec, plan, backing, {
    params: { rangePolicy: "clamp" },
  });
  const handoff = buildHandoff(plan, backing);
  const accepted = acceptHandoff(handoff);

  verifyHandoff(plan, accepted.plan);

  const processor = bindProcessor(accepted);
  const observer = bindObserver(accepted);

  return { controller, handoff, observer, plan, processor };
}

export function createStretchBoundarySession(): StretchBoundarySession {
  return {
    desired: createAppBoundarySession(desiredStretchSpec),
    levels: createAppBoundarySession(processedOutputLevelsSpec),
    runtime: createAppBoundarySession(runtimeStatusSpec),
    source: createAppBoundarySession(sourceStatusSpec),
  };
}

export function disposeStretchBoundarySession(
  session: StretchBoundarySession,
): void {
  session.desired.controller.dispose();
  session.desired.processor.dispose();
  session.desired.observer.dispose();
  session.runtime.controller.dispose();
  session.runtime.processor.dispose();
  session.runtime.observer.dispose();
  session.source.controller.dispose();
  session.source.processor.dispose();
  session.source.observer.dispose();
  session.levels.controller.dispose();
  session.levels.processor.dispose();
  session.levels.observer.dispose();
}

export function initializeDesiredControls(
  session: StretchBoundarySession,
  controls: DesiredStretchControls = defaultDesiredControls(),
): void {
  writeDesiredControls(session, controls);
}

export function writeDesiredControls(
  session: StretchBoundarySession,
  controls: DesiredStretchControls,
): void {
  session.desired.controller.params.update({
    active: controls.active,
    blockMs: controls.blockMs,
    configSequence: controls.configSequence,
    desiredSequence: controls.desiredSequence,
    formantBaseHz: controls.formantBaseHz,
    formantCompensation: controls.formantCompensation,
    formantSemitones: controls.formantSemitones,
    intervalMs: controls.intervalMs,
    pitchSemitones: controls.pitchSemitones,
    preset: controls.preset,
    rate: controls.rate,
    splitComputation: controls.splitComputation,
    tonalityEnabled: controls.tonalityEnabled,
    tonalityHz: controls.tonalityHz,
    transitionFrames: controls.transitionFrames,
  });
}

export function readDesiredControls(
  session: StretchBoundarySession,
): DesiredStretchControls {
  const snapshot = session.desired.observer.params.snapshot();

  return {
    active: snapshot.active,
    blockMs: snapshot.blockMs,
    configSequence: snapshot.configSequence,
    desiredSequence: snapshot.desiredSequence,
    formantBaseHz: snapshot.formantBaseHz,
    formantCompensation: snapshot.formantCompensation,
    formantSemitones: snapshot.formantSemitones,
    intervalMs: snapshot.intervalMs,
    pitchSemitones: snapshot.pitchSemitones,
    preset: snapshot.preset,
    rate: snapshot.rate,
    splitComputation: snapshot.splitComputation,
    tonalityEnabled: snapshot.tonalityEnabled,
    tonalityHz: snapshot.tonalityHz,
    transitionFrames: snapshot.transitionFrames,
  };
}

export function readRuntimeStatus(
  session: StretchBoundarySession,
): RuntimeStatusSnapshot {
  const snapshot = session.runtime.observer.meters.snapshot();
  const stateIndex = snapshot.state;
  const adapterModeIndex = snapshot.adapterMode;

  return {
    adapterMode: enumLabel(ADAPTER_MODES, adapterModeIndex, "fallback"),
    adapterModeIndex,
    audioWorkletFrameHi: snapshot.audioWorkletFrameHi,
    audioWorkletFrameLo: snapshot.audioWorkletFrameLo,
    audioWorkletTimeSeconds: snapshot.audioWorkletTimeSeconds,
    blockSamples: snapshot.blockSamples,
    bufferReadyFrames: snapshot.bufferReadyFrames,
    bufferLengthFrames: snapshot.bufferLengthFrames,
    commandDroppedTotal: snapshot.commandDroppedTotal,
    durationFrames: snapshot.durationFrames,
    durationSeconds: snapshot.durationSeconds,
    effectiveRate: snapshot.effectiveRate,
    heapGeneration: snapshot.heapGeneration,
    inputLatencyFrames: snapshot.inputLatencyFrames,
    inputLatencySeconds: snapshot.inputLatencySeconds,
    intervalSamples: snapshot.intervalSamples,
    invalidSampleTotal: snapshot.invalidSampleTotal,
    invalidTransitionTotal: snapshot.invalidTransitionTotal,
    lastAppliedConfigSequence: snapshot.lastAppliedConfigSequence,
    lastAppliedCommandSequence: snapshot.lastAppliedCommandSequence,
    lastAppliedDesiredSequence: snapshot.lastAppliedDesiredSequence,
    lastErrorCode: snapshot.lastErrorCode,
    loopEnabled: snapshot.loopEnabled,
    loopEndFrame: snapshot.loopEndFrame,
    loopRevision: snapshot.loopRevision,
    loopStartFrame: snapshot.loopStartFrame,
    maxObservedRenderQuantum: snapshot.maxObservedRenderQuantum,
    outputLatencyFrames: snapshot.outputLatencyFrames,
    outputLatencySeconds: snapshot.outputLatencySeconds,
    outputFrame: snapshot.outputFrame,
    processingCenterFrame: snapshot.processingCenterFrame,
    sessionId: snapshot.sessionId,
    sourceFrame: snapshot.sourceFrame,
    staleReadTotal: snapshot.staleReadTotal,
    state: enumLabel(RUNTIME_STATES, stateIndex, "idle"),
    stateIndex,
    underrunTotal: snapshot.underrunTotal,
    workletGeneration: snapshot.workletGeneration,
  };
}

export function readSourceStatus(
  session: StretchBoundarySession,
): SourceStatusSnapshot {
  const snapshot = session.source.observer.meters.snapshot();
  const stateIndex = snapshot.state;

  return {
    appliedLoadSequence: snapshot.appliedLoadSequence,
    bufferEndFrame: snapshot.bufferEndFrame,
    bufferStartFrame: snapshot.bufferStartFrame,
    channelCount: snapshot.channelCount,
    decodeErrorCode: snapshot.decodeErrorCode,
    droppedBufferTotal: snapshot.droppedBufferTotal,
    durationFrames: snapshot.durationFrames,
    durationSeconds: snapshot.durationSeconds,
    loadSequence: snapshot.loadSequence,
    memoryBytes: snapshot.memoryBytes,
    sampleRate: snapshot.sampleRate,
    sourceRevision: snapshot.sourceRevision,
    state: enumLabel(SOURCE_STATES, stateIndex, "none"),
    stateIndex,
  };
}

export function readProcessedLevels(
  session: StretchBoundarySession,
): ProcessedLevelsSnapshot {
  const snapshot = session.levels.observer.meters.snapshot();
  const probeStateIndex = snapshot.probeState;

  return {
    channelCount: snapshot.channelCount,
    clipLatched: snapshot.clipLatched,
    fullScaleLeftTotal: snapshot.fullScaleLeftTotal,
    fullScaleRightTotal: snapshot.fullScaleRightTotal,
    historyPeak: snapshot.historyPeak,
    historyRms: snapshot.historyRms,
    invalidSampleTotal: snapshot.invalidSampleTotal,
    lastErrorCode: snapshot.lastErrorCode,
    maxAbsWindow: snapshot.maxAbsWindow,
    outputBranchActive: snapshot.outputBranchActive,
    peakLeft: snapshot.peakLeft,
    peakRight: snapshot.peakRight,
    probeState: enumLabel(PROBE_STATES, probeStateIndex, "uninitialized"),
    probeStateIndex,
    referenceBranchActive: snapshot.referenceBranchActive,
    rmsLeft: snapshot.rmsLeft,
    rmsRight: snapshot.rmsRight,
    silent: snapshot.silent,
    unsupportedChannelBlockTotal: snapshot.unsupportedChannelBlockTotal,
    windowEndOutputFrame: snapshot.windowEndOutputFrame,
    windowFrames: snapshot.windowFrames,
  };
}

function summarizePlan<S extends SpecInput>(
  session: AppBoundarySession<S>,
): BoundaryPlanSummary {
  return {
    bytesTotal: session.plan.bytesTotal,
    handoffPacking: session.handoff.packing,
    handoffVersion: session.handoff.version,
    hash: session.plan.hash,
    id: session.plan.id,
    lockStrideBytes: session.plan.lockStrideBytes,
    meterVersion: session.observer.meters.version(),
    paramVersion: session.observer.params.version(),
    planes: {
      MF32: session.plan.planes.MF32,
      MF64: session.plan.planes.MF64,
      MU: session.plan.planes.MU,
      MU32: session.plan.planes.MU32,
      PB: session.plan.planes.PB,
      PF32: session.plan.planes.PF32,
      PI32: session.plan.planes.PI32,
      PU: session.plan.planes.PU,
    },
  };
}

export function readPlanSummaries(
  session: StretchBoundarySession,
): Readonly<
  Record<"desired" | "levels" | "runtime" | "source", BoundaryPlanSummary>
> {
  return {
    desired: summarizePlan(session.desired),
    levels: summarizePlan(session.levels),
    runtime: summarizePlan(session.runtime),
    source: summarizePlan(session.source),
  };
}

export function describeBoundaryError(error: unknown): string {
  if (error instanceof BoundaryError || isBoundaryError(error)) {
    return `${String(error.code)}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
