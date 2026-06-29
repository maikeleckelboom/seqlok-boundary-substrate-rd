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

const APP_PRIVATE_PREFIXES = [
  "control.",
  "config.",
  "runtime.",
  "source.",
  "levels.",
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
      "active",
      "blockMs",
      "configSequence",
      "desiredSequence",
      "formantBaseHz",
      "formantCompensation",
      "formantSemitones",
      "intervalMs",
      "pitchSemitones",
      "preset",
      "rate",
      "splitComputation",
      "tonalityEnabled",
      "tonalityHz",
      "transitionFrames",
    ]);

    expect(Object.keys(runtimeStatusSpec.meters).sort()).toEqual([
      "adapterMode",
      "audioWorkletFrameHi",
      "audioWorkletFrameLo",
      "audioWorkletTimeSeconds",
      "blockSamples",
      "bufferLengthFrames",
      "bufferReadyFrames",
      "commandDroppedTotal",
      "durationFrames",
      "durationSeconds",
      "effectiveRate",
      "heapGeneration",
      "inputLatencyFrames",
      "inputLatencySeconds",
      "intervalSamples",
      "invalidSampleTotal",
      "invalidTransitionTotal",
      "lastAppliedCommandSequence",
      "lastAppliedConfigSequence",
      "lastAppliedDesiredSequence",
      "lastErrorCode",
      "loopEnabled",
      "loopEndFrame",
      "loopRevision",
      "loopStartFrame",
      "maxObservedRenderQuantum",
      "outputFrame",
      "outputLatencyFrames",
      "outputLatencySeconds",
      "processingCenterFrame",
      "sessionId",
      "sourceFrame",
      "staleReadTotal",
      "state",
      "underrunTotal",
      "workletGeneration",
    ]);

    expect(Object.keys(sourceStatusSpec.meters).sort()).toEqual([
      "appliedLoadSequence",
      "bufferEndFrame",
      "bufferStartFrame",
      "channelCount",
      "decodeErrorCode",
      "droppedBufferTotal",
      "durationFrames",
      "durationSeconds",
      "loadSequence",
      "memoryBytes",
      "sampleRate",
      "sourceRevision",
      "state",
    ]);

    expect(Object.keys(processedOutputLevelsSpec.meters).sort()).toEqual([
      "channelCount",
      "clipLatched",
      "fullScaleLeftTotal",
      "fullScaleRightTotal",
      "historyPeak",
      "historyRms",
      "invalidSampleTotal",
      "lastErrorCode",
      "maxAbsWindow",
      "outputBranchActive",
      "peakLeft",
      "peakRight",
      "probeState",
      "referenceBranchActive",
      "rmsLeft",
      "rmsRight",
      "silent",
      "unsupportedChannelBlockTotal",
      "windowEndOutputFrame",
      "windowFrames",
    ]);
  });

  it("does not keep the old nested key prefixes inside app-private specs", () => {
    const appPrivateKeys = [
      ...Object.keys(desiredStretchSpec.params),
      ...Object.keys(runtimeStatusSpec.meters),
      ...Object.keys(sourceStatusSpec.meters),
      ...Object.keys(processedOutputLevelsSpec.meters),
    ];

    expect(
      appPrivateKeys.filter((key) =>
        APP_PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix)),
      ),
    ).toEqual([]);
  });

  it("maps the official web demo controls without f64 params", () => {
    expect(desiredStretchSpec.params.rate).toMatchObject({
      kind: "f32",
      max: 8,
      min: 0.05,
    });
    expect(desiredStretchSpec.params.pitchSemitones).toMatchObject({
      kind: "f32",
      max: 48,
      min: -48,
    });
    expect(desiredStretchSpec.params.tonalityHz).toMatchObject({
      kind: "f32",
      max: 24_000,
      min: 0,
    });
    expect(desiredStretchSpec.params.formantBaseHz).toMatchObject({
      kind: "f32",
      max: 24_000,
      min: 0,
    });
    expect(desiredStretchSpec.params.preset).toMatchObject({
      kind: "enum",
      values: ["custom", "default", "cheaper"],
    });

    expect(Object.keys(desiredStretchSpec.params)).not.toEqual(
      expect.arrayContaining(["input", "output", "loopStart", "loopEnd"]),
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
        observedActive = params.active;
        observedConfigSequence = params.configSequence;
        observedIntervalMs = params.intervalMs;
        observedPreset = params.preset;
        observedRate = params.rate;
        observedPitch = params.pitchSemitones;
        observedSequence = params.desiredSequence;
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
