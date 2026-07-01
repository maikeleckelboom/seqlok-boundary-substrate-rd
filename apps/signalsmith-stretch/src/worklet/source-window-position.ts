export interface SignalsmithSourceWindowInput {
  readonly audibleSourceFrame: number;
  readonly bufferLengthFrames: number;
  readonly effectiveRate: number;
  readonly inputLatencyFrames: number;
  readonly outputLatencyFrames: number;
}

export interface SignalsmithSourceWindow {
  readonly audibleSourceFrame: number;
  readonly inputWindowEndFrame: number;
  readonly inputWindowStartFrame: number;
  readonly processingCenterFrame: number;
}

export interface SignalsmithPlayableEndInput {
  readonly effectiveRate: number;
  readonly inputLatencyFrames: number;
  readonly outputLatencyFrames: number;
  readonly sourceFrameCount: number;
}

export function calculateSignalsmithSourceWindow(
  input: SignalsmithSourceWindowInput,
): SignalsmithSourceWindow {
  const audibleSourceFrame = finiteOrZero(input.audibleSourceFrame);
  const effectiveRate = Math.max(0.05, finiteOrZero(input.effectiveRate));
  const inputLatencyFrames = Math.max(
    0,
    Math.floor(finiteOrZero(input.inputLatencyFrames)),
  );
  const outputLatencyFrames = Math.max(
    0,
    Math.floor(finiteOrZero(input.outputLatencyFrames)),
  );
  const bufferLengthFrames = Math.max(
    0,
    Math.floor(finiteOrZero(input.bufferLengthFrames)),
  );

  const processingCenterFrame =
    audibleSourceFrame + outputLatencyFrames * effectiveRate;
  const inputWindowEndFrame = Math.round(
    processingCenterFrame + inputLatencyFrames,
  );

  return {
    audibleSourceFrame,
    inputWindowEndFrame,
    inputWindowStartFrame: inputWindowEndFrame - bufferLengthFrames,
    processingCenterFrame,
  };
}

export function calculateSignalsmithPlayableEndFrame(
  input: SignalsmithPlayableEndInput,
): number {
  const sourceFrameCount = Math.max(
    0,
    Math.floor(finiteOrZero(input.sourceFrameCount)),
  );
  const lookaheadFrames = calculateSignalsmithLookaheadFrames(input);

  return Math.min(
    sourceFrameCount,
    Math.max(0, sourceFrameCount - lookaheadFrames),
  );
}

export function calculateSignalsmithLookaheadFrames(
  input: Pick<
    SignalsmithPlayableEndInput,
    "effectiveRate" | "inputLatencyFrames" | "outputLatencyFrames"
  >,
): number {
  const effectiveRate = Math.max(0.05, finiteOrZero(input.effectiveRate));
  const inputLatencyFrames = Math.max(
    0,
    Math.floor(finiteOrZero(input.inputLatencyFrames)),
  );
  const outputLatencyFrames = Math.max(
    0,
    Math.floor(finiteOrZero(input.outputLatencyFrames)),
  );

  return Math.ceil(inputLatencyFrames + outputLatencyFrames * effectiveRate);
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
