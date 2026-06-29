import { defineSpec } from "@exclave/boundary";

import { PROBE_STATES, RUNTIME_STATES } from "../types";

export const desiredStretchSpec = defineSpec(({ param }) => ({
  id: "signalsmith-stretch-lab/desired-stretch" as const,
  params: {
    control: {
      desiredSequence: param.u32(),
      rate: param.f32({ min: 0.125, max: 8 }),
      pitchSemitones: param.f32({ min: -48, max: 48 }),
      tonalityEnabled: param.bool(),
      tonalityHz: param.f32({ min: 0, max: 20_000 }),
      formantSemitones: param.f32({ min: -48, max: 48 }),
      formantCompensation: param.bool(),
      formantBaseHz: param.f32({ min: 0, max: 20_000 }),
      transitionFrames: param.u32({ min: 0, max: 48_000 }),
    },
  },
}));

export const runtimeStatusSpec = defineSpec(({ meter }) => ({
  id: "signalsmith-stretch-lab/runtime-status" as const,
  meters: {
    runtime: {
      state: meter.enum(RUNTIME_STATES),
      sessionId: meter.u32(),
      lastErrorCode: meter.u32(),
      lastAppliedDesiredSequence: meter.u32(),
      lastAppliedCommandSequence: meter.u32(),
      outputFrame: meter.f64(),
      sourceFrame: meter.f64(),
      processingCenterFrame: meter.f64(),
      loopEnabled: meter.bool(),
      loopStartFrame: meter.f64(),
      loopEndFrame: meter.f64(),
      loopRevision: meter.u32(),
      bufferReadyFrames: meter.u32(),
      commandDroppedTotal: meter.f64(),
      underrunTotal: meter.f64(),
      staleReadTotal: meter.f64(),
      invalidTransitionTotal: meter.f64(),
      maxObservedRenderQuantum: meter.u32(),
    },
  },
}));

export const processedOutputLevelsSpec = defineSpec(({ meter }) => ({
  id: "signalsmith-stretch-lab/processed-output-levels" as const,
  meters: {
    levels: {
      windowEndOutputFrame: meter.f64(),
      windowFrames: meter.u32(),
      channelCount: meter.u32(),
      rmsLeft: meter.f32(),
      rmsRight: meter.f32(),
      peakLeft: meter.f32(),
      peakRight: meter.f32(),
      fullScaleLeftTotal: meter.f64(),
      fullScaleRightTotal: meter.f64(),
      invalidSampleTotal: meter.f64(),
      unsupportedChannelBlockTotal: meter.f64(),
      silent: meter.bool(),
      probeState: meter.enum(PROBE_STATES),
      lastErrorCode: meter.u32(),
      historyRms: meter.f32.array(64),
      historyPeak: meter.f32.array(64),
    },
  },
}));
