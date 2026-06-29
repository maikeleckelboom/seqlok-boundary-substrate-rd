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
  defaultDesiredControls,
  enumLabel,
  PROBE_STATES,
  RUNTIME_STATES,
  type DesiredStretchControls,
  type ProcessedLevelsSnapshot,
  type RuntimeStatusSnapshot,
} from "../types";
import {
  desiredStretchSpec,
  processedOutputLevelsSpec,
  runtimeStatusSpec,
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
    "control.desiredSequence": controls.desiredSequence,
    "control.formantBaseHz": controls.formantBaseHz,
    "control.formantCompensation": controls.formantCompensation,
    "control.formantSemitones": controls.formantSemitones,
    "control.pitchSemitones": controls.pitchSemitones,
    "control.rate": controls.rate,
    "control.tonalityEnabled": controls.tonalityEnabled,
    "control.tonalityHz": controls.tonalityHz,
    "control.transitionFrames": controls.transitionFrames,
  });
}

export function readDesiredControls(
  session: StretchBoundarySession,
): DesiredStretchControls {
  const snapshot = session.desired.observer.params.snapshot();

  return {
    desiredSequence: snapshot["control.desiredSequence"],
    formantBaseHz: snapshot["control.formantBaseHz"],
    formantCompensation: snapshot["control.formantCompensation"],
    formantSemitones: snapshot["control.formantSemitones"],
    pitchSemitones: snapshot["control.pitchSemitones"],
    rate: snapshot["control.rate"],
    tonalityEnabled: snapshot["control.tonalityEnabled"],
    tonalityHz: snapshot["control.tonalityHz"],
    transitionFrames: snapshot["control.transitionFrames"],
  };
}

export function readRuntimeStatus(
  session: StretchBoundarySession,
): RuntimeStatusSnapshot {
  const snapshot = session.runtime.observer.meters.snapshot();
  const stateIndex = snapshot["runtime.state"];

  return {
    bufferReadyFrames: snapshot["runtime.bufferReadyFrames"],
    commandDroppedTotal: snapshot["runtime.commandDroppedTotal"],
    invalidTransitionTotal: snapshot["runtime.invalidTransitionTotal"],
    lastAppliedCommandSequence: snapshot["runtime.lastAppliedCommandSequence"],
    lastAppliedDesiredSequence: snapshot["runtime.lastAppliedDesiredSequence"],
    lastErrorCode: snapshot["runtime.lastErrorCode"],
    loopEnabled: snapshot["runtime.loopEnabled"],
    loopEndFrame: snapshot["runtime.loopEndFrame"],
    loopRevision: snapshot["runtime.loopRevision"],
    loopStartFrame: snapshot["runtime.loopStartFrame"],
    maxObservedRenderQuantum: snapshot["runtime.maxObservedRenderQuantum"],
    outputFrame: snapshot["runtime.outputFrame"],
    processingCenterFrame: snapshot["runtime.processingCenterFrame"],
    sessionId: snapshot["runtime.sessionId"],
    sourceFrame: snapshot["runtime.sourceFrame"],
    staleReadTotal: snapshot["runtime.staleReadTotal"],
    state: enumLabel(RUNTIME_STATES, stateIndex, "idle"),
    stateIndex,
    underrunTotal: snapshot["runtime.underrunTotal"],
  };
}

export function readProcessedLevels(
  session: StretchBoundarySession,
): ProcessedLevelsSnapshot {
  const snapshot = session.levels.observer.meters.snapshot();
  const probeStateIndex = snapshot["levels.probeState"];

  return {
    channelCount: snapshot["levels.channelCount"],
    fullScaleLeftTotal: snapshot["levels.fullScaleLeftTotal"],
    fullScaleRightTotal: snapshot["levels.fullScaleRightTotal"],
    historyPeak: snapshot["levels.historyPeak"],
    historyRms: snapshot["levels.historyRms"],
    invalidSampleTotal: snapshot["levels.invalidSampleTotal"],
    lastErrorCode: snapshot["levels.lastErrorCode"],
    peakLeft: snapshot["levels.peakLeft"],
    peakRight: snapshot["levels.peakRight"],
    probeState: enumLabel(PROBE_STATES, probeStateIndex, "uninitialized"),
    probeStateIndex,
    rmsLeft: snapshot["levels.rmsLeft"],
    rmsRight: snapshot["levels.rmsRight"],
    silent: snapshot["levels.silent"],
    unsupportedChannelBlockTotal:
      snapshot["levels.unsupportedChannelBlockTotal"],
    windowEndOutputFrame: snapshot["levels.windowEndOutputFrame"],
    windowFrames: snapshot["levels.windowFrames"],
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
): Readonly<Record<"desired" | "levels" | "runtime", BoundaryPlanSummary>> {
  return {
    desired: summarizePlan(session.desired),
    levels: summarizePlan(session.levels),
    runtime: summarizePlan(session.runtime),
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
