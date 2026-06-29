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
} from "../src/boundary/specs";
import { defaultDesiredControls } from "../src/types";

describe("Stage B boundary specs", () => {
  it("defines exact app-private spec ids", () => {
    expect(desiredStretchSpec.id).toBe(
      "signalsmith-stretch-lab/desired-stretch",
    );
    expect(runtimeStatusSpec.id).toBe("signalsmith-stretch-lab/runtime-status");
    expect(processedOutputLevelsSpec.id).toBe(
      "signalsmith-stretch-lab/processed-output-levels",
    );
  });

  it("defines the required canonical keys", () => {
    expect(Object.keys(desiredStretchSpec.params).sort()).toEqual([
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
      "runtime.bufferReadyFrames",
      "runtime.commandDroppedTotal",
      "runtime.invalidTransitionTotal",
      "runtime.lastAppliedCommandSequence",
      "runtime.lastAppliedDesiredSequence",
      "runtime.lastErrorCode",
      "runtime.loopEnabled",
      "runtime.loopEndFrame",
      "runtime.loopRevision",
      "runtime.loopStartFrame",
      "runtime.maxObservedRenderQuantum",
      "runtime.outputFrame",
      "runtime.processingCenterFrame",
      "runtime.sessionId",
      "runtime.sourceFrame",
      "runtime.staleReadTotal",
      "runtime.state",
      "runtime.underrunTotal",
    ]);

    expect(Object.keys(processedOutputLevelsSpec.meters).sort()).toEqual([
      "levels.channelCount",
      "levels.fullScaleLeftTotal",
      "levels.fullScaleRightTotal",
      "levels.historyPeak",
      "levels.historyRms",
      "levels.invalidSampleTotal",
      "levels.lastErrorCode",
      "levels.peakLeft",
      "levels.peakRight",
      "levels.probeState",
      "levels.rmsLeft",
      "levels.rmsRight",
      "levels.silent",
      "levels.unsupportedChannelBlockTotal",
      "levels.windowEndOutputFrame",
      "levels.windowFrames",
    ]);
  });

  it("plans non-zero backing and plane metadata for all specs", () => {
    for (const spec of [
      desiredStretchSpec,
      runtimeStatusSpec,
      processedOutputLevelsSpec,
    ]) {
      const plan = planLayout(spec);

      expect(plan.bytesTotal).toBeGreaterThan(0);
      expect(plan.lockStrideBytes).toBeGreaterThan(0);
      expect(plan.planes.PU).toBeGreaterThan(0);
      expect(plan.planes.MU).toBeGreaterThan(0);
      expect(Object.values(plan.planes).some((bytes) => bytes > 0)).toBe(true);
    }
  });

  it("builds, verifies, and accepts handoff metadata", () => {
    const plan = planLayout(runtimeStatusSpec);
    const backing = allocateShared(plan);
    const handoff = buildHandoff(plan, backing);
    const accepted = acceptHandoff(handoff);

    expect(handoff.version).toBe(1);
    expect(handoff.packing).toBe("shared");
    expect(accepted.plan.id).toBe(runtimeStatusSpec.id);
    expect(() => {
      verifyHandoff(plan, accepted.plan);
    }).not.toThrow();
  });

  it("lets the controller write desired params and the processor read them", () => {
    const session = createStretchBoundarySession();

    try {
      initializeDesiredControls(session);
      writeDesiredControls(session, {
        ...defaultDesiredControls(),
        desiredSequence: 2,
        pitchSemitones: -3,
        rate: 1.5,
      });

      let observedRate = 0;
      let observedPitch = 0;
      let observedSequence = 0;

      session.desired.processor.params.within((params) => {
        observedRate = params.control.rate;
        observedPitch = params.control.pitchSemitones;
        observedSequence = params.control.desiredSequence;
      });

      expect(observedSequence).toBe(2);
      expect(observedRate).toBeCloseTo(1.5);
      expect(observedPitch).toBeCloseTo(-3);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });
});
