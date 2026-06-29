import {
  acceptHandoff,
  allocateShared,
  buildHandoff,
  planLayout,
  verifyHandoff,
} from "@exclave/boundary";
import { describe, expect, it } from "vitest";

import {
  createStretchBoundarySession,
  disposeStretchBoundarySession,
  initializeDesiredControls,
  writeDesiredControls,
} from "../src/boundary/session";
import {
  desiredStretchSpec,
  processedOutputLevelsSpec,
  runtimeStatusSpec,
  sourceStatusSpec,
} from "../src/boundary/specs";
import { defaultDesiredControls } from "../src/types";

const APP_SPECS = [
  desiredStretchSpec,
  runtimeStatusSpec,
  sourceStatusSpec,
  processedOutputLevelsSpec,
] as const;

describe("Stage B boundary specs", () => {
  it("defines exact app-private spec ids", () => {
    expect(desiredStretchSpec.id).toBe(
      "signalsmith-stretch-lab/desired-stretch",
    );
    expect(runtimeStatusSpec.id).toBe("signalsmith-stretch-lab/runtime-status");
    expect(sourceStatusSpec.id).toBe("signalsmith-stretch-lab/source-status");
    expect(processedOutputLevelsSpec.id).toBe(
      "signalsmith-stretch-lab/processed-output-levels",
    );
  });

  it("defines the required canonical keys", () => {
    expect(Object.keys(desiredStretchSpec.params).sort()).toEqual([
      "config.blockMs",
      "config.configSequence",
      "config.intervalMs",
      "config.preset",
      "config.splitComputation",
      "control.active",
      "control.desiredSequence",
      "control.formantBaseHz",
      "control.formantCompensation",
      "control.formantSemitones",
      "control.pitchSemitones",
      "control.rate",
      "control.tonalityEnabled",
      "control.tonalityHz",
      "control.transitionFrames",
    ]);

    expect(Object.keys(runtimeStatusSpec.meters).sort()).toEqual([
      "runtime.adapterMode",
      "runtime.audioWorkletFrameHi",
      "runtime.audioWorkletFrameLo",
      "runtime.audioWorkletTimeSeconds",
      "runtime.blockSamples",
      "runtime.bufferLengthFrames",
      "runtime.bufferReadyFrames",
      "runtime.commandDroppedTotal",
      "runtime.durationFrames",
      "runtime.durationSeconds",
      "runtime.effectiveRate",
      "runtime.heapGeneration",
      "runtime.inputLatencyFrames",
      "runtime.inputLatencySeconds",
      "runtime.intervalSamples",
      "runtime.invalidSampleTotal",
      "runtime.invalidTransitionTotal",
      "runtime.lastAppliedCommandSequence",
      "runtime.lastAppliedConfigSequence",
      "runtime.lastAppliedDesiredSequence",
      "runtime.lastErrorCode",
      "runtime.loopEnabled",
      "runtime.loopEndFrame",
      "runtime.loopRevision",
      "runtime.loopStartFrame",
      "runtime.maxObservedRenderQuantum",
      "runtime.outputFrame",
      "runtime.outputLatencyFrames",
      "runtime.outputLatencySeconds",
      "runtime.processingCenterFrame",
      "runtime.sessionId",
      "runtime.sourceFrame",
      "runtime.staleReadTotal",
      "runtime.state",
      "runtime.underrunTotal",
      "runtime.workletGeneration",
    ]);

    expect(Object.keys(sourceStatusSpec.meters).sort()).toEqual([
      "source.appliedLoadSequence",
      "source.bufferEndFrame",
      "source.bufferStartFrame",
      "source.channelCount",
      "source.decodeErrorCode",
      "source.droppedBufferTotal",
      "source.durationFrames",
      "source.durationSeconds",
      "source.loadSequence",
      "source.memoryBytes",
      "source.sampleRate",
      "source.sourceRevision",
      "source.state",
    ]);

    expect(Object.keys(processedOutputLevelsSpec.meters).sort()).toEqual([
      "levels.channelCount",
      "levels.clipLatched",
      "levels.fullScaleLeftTotal",
      "levels.fullScaleRightTotal",
      "levels.historyPeak",
      "levels.historyRms",
      "levels.invalidSampleTotal",
      "levels.lastErrorCode",
      "levels.maxAbsWindow",
      "levels.outputBranchActive",
      "levels.peakLeft",
      "levels.peakRight",
      "levels.probeState",
      "levels.referenceBranchActive",
      "levels.rmsLeft",
      "levels.rmsRight",
      "levels.silent",
      "levels.unsupportedChannelBlockTotal",
      "levels.windowEndOutputFrame",
      "levels.windowFrames",
    ]);
  });

  it("maps the official web demo controls without f64 params", () => {
    expect(desiredStretchSpec.params["control.rate"]).toMatchObject({
      kind: "f32",
      max: 8,
      min: 0.05,
    });
    expect(desiredStretchSpec.params["control.pitchSemitones"]).toMatchObject({
      kind: "f32",
      max: 48,
      min: -48,
    });
    expect(desiredStretchSpec.params["control.tonalityHz"]).toMatchObject({
      kind: "f32",
      max: 24_000,
      min: 0,
    });
    expect(desiredStretchSpec.params["control.formantBaseHz"]).toMatchObject({
      kind: "f32",
      max: 24_000,
      min: 0,
    });
    expect(desiredStretchSpec.params["config.preset"]).toMatchObject({
      kind: "enum",
      values: ["custom", "default", "cheaper"],
    });

    expect(Object.keys(desiredStretchSpec.params)).not.toEqual(
      expect.arrayContaining([
        "control.input",
        "control.output",
        "control.loopStart",
        "control.loopEnd",
      ]),
    );

    for (const def of Object.values(desiredStretchSpec.params)) {
      expect(def.kind).not.toBe("f64");
    }
  });

  it("plans non-zero backing and plane metadata for all specs", () => {
    for (const spec of APP_SPECS) {
      const plan = planLayout(spec);

      expect(plan.bytesTotal).toBeGreaterThan(0);
      expect(plan.lockStrideBytes).toBeGreaterThan(0);
      expect(plan.planes.PU).toBeGreaterThan(0);
      expect(plan.planes.MU).toBeGreaterThan(0);
      expect(Object.values(plan.planes).some((bytes) => bytes > 0)).toBe(true);
    }
  });

  it("builds, verifies, and accepts handoff metadata", () => {
    for (const spec of APP_SPECS) {
      const plan = planLayout(spec);
      const backing = allocateShared(plan);
      const handoff = buildHandoff(plan, backing);
      const accepted = acceptHandoff(handoff);

      expect(handoff.version).toBe(1);
      expect(handoff.packing).toBe("shared");
      expect(accepted.plan.id).toBe(spec.id);
      expect(() => {
        verifyHandoff(plan, accepted.plan);
      }).not.toThrow();
    }
  });

  it("lets the controller write desired params and the processor read them", () => {
    const session = createStretchBoundarySession();

    try {
      initializeDesiredControls(session);
      writeDesiredControls(session, {
        ...defaultDesiredControls(),
        active: true,
        configSequence: 2,
        intervalMs: 15,
        desiredSequence: 2,
        pitchSemitones: -3,
        preset: "cheaper",
        rate: 1.5,
      });

      let observedActive = false;
      let observedConfigSequence = 0;
      let observedIntervalMs = 0;
      let observedPreset = 0;
      let observedRate = 0;
      let observedPitch = 0;
      let observedSequence = 0;

      session.desired.processor.params.within((params) => {
        observedActive = params.control.active;
        observedConfigSequence = params.config.configSequence;
        observedIntervalMs = params.config.intervalMs;
        observedPreset = params.config.preset;
        observedRate = params.control.rate;
        observedPitch = params.control.pitchSemitones;
        observedSequence = params.control.desiredSequence;
      });

      expect(observedActive).toBe(true);
      expect(observedConfigSequence).toBe(2);
      expect(observedIntervalMs).toBeCloseTo(15);
      expect(observedPreset).toBe(2);
      expect(observedSequence).toBe(2);
      expect(observedRate).toBeCloseTo(1.5);
      expect(observedPitch).toBeCloseTo(-3);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });
});
