export const RUNTIME_STATES = [
  "unsupported",
  "idle",
  "ready-paused",
  "playing",
  "seeking",
  "flushing",
  "ended",
  "failed-recoverable",
  "failed-terminal",
] as const;

export const PROBE_STATES = [
  "uninitialized",
  "ready",
  "active",
  "no-input",
  "failed",
] as const;

export type RuntimeState = (typeof RUNTIME_STATES)[number];
export type ProbeState = (typeof PROBE_STATES)[number];

export interface DesiredStretchControls {
  readonly desiredSequence: number;
  readonly rate: number;
  readonly pitchSemitones: number;
  readonly tonalityEnabled: boolean;
  readonly tonalityHz: number;
  readonly formantSemitones: number;
  readonly formantCompensation: boolean;
  readonly formantBaseHz: number;
  readonly transitionFrames: number;
}

export interface SimulatedSource {
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly frames: number;
  readonly memoryBytes: number;
  readonly name: string;
  readonly sampleRate: number;
  readonly status: "deterministic" | "file-metadata";
}

export interface RuntimeStatusSnapshot {
  readonly bufferReadyFrames: number;
  readonly commandDroppedTotal: number;
  readonly lastAppliedCommandSequence: number;
  readonly lastAppliedDesiredSequence: number;
  readonly lastErrorCode: number;
  readonly loopEnabled: boolean;
  readonly loopEndFrame: number;
  readonly loopRevision: number;
  readonly loopStartFrame: number;
  readonly maxObservedRenderQuantum: number;
  readonly outputFrame: number;
  readonly processingCenterFrame: number;
  readonly sessionId: number;
  readonly sourceFrame: number;
  readonly staleReadTotal: number;
  readonly state: RuntimeState;
  readonly stateIndex: number;
  readonly underrunTotal: number;
  readonly invalidTransitionTotal: number;
}

export interface ProcessedLevelsSnapshot {
  readonly channelCount: number;
  readonly fullScaleLeftTotal: number;
  readonly fullScaleRightTotal: number;
  readonly historyPeak: Readonly<Float32Array>;
  readonly historyRms: Readonly<Float32Array>;
  readonly invalidSampleTotal: number;
  readonly lastErrorCode: number;
  readonly peakLeft: number;
  readonly peakRight: number;
  readonly probeState: ProbeState;
  readonly probeStateIndex: number;
  readonly rmsLeft: number;
  readonly rmsRight: number;
  readonly silent: boolean;
  readonly unsupportedChannelBlockTotal: number;
  readonly windowEndOutputFrame: number;
  readonly windowFrames: number;
}

export interface LoopPreview {
  readonly enabled: boolean;
  readonly endFrame: number;
  readonly revision: number;
  readonly startFrame: number;
}

export function defaultDesiredControls(): DesiredStretchControls {
  return {
    desiredSequence: 1,
    formantBaseHz: 0,
    formantCompensation: true,
    formantSemitones: 0,
    pitchSemitones: 0,
    rate: 1,
    tonalityEnabled: true,
    tonalityHz: 440,
    transitionFrames: 2_048,
  };
}

export function defaultSimulatedSource(): SimulatedSource {
  const sampleRate = 48_000;
  const durationSeconds = 94;
  const channels = 2;
  const frames = sampleRate * durationSeconds;

  return {
    channels,
    durationSeconds,
    frames,
    memoryBytes: frames * channels * Float32Array.BYTES_PER_ELEMENT,
    name: "Deterministic simulator source",
    sampleRate,
    status: "deterministic",
  };
}

export function enumIndex<const T extends readonly string[]>(
  values: T,
  value: T[number],
): number {
  return values.indexOf(value);
}

export function enumLabel<const T extends readonly string[]>(
  values: T,
  index: number,
  fallback: T[number],
): T[number] {
  return values[index] ?? fallback;
}
