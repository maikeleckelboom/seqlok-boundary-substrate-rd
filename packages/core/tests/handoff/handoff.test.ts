import { describe, expect, it } from "vitest";

import { allocatePacked } from "../../src/backing/allocate-packed";
import { allocatePartitioned } from "../../src/backing/allocate-partitioned";
import { bindController } from "../../src/binding/controller";
import { bindObserver } from "../../src/binding/observer";
import { bindProcessor } from "../../src/binding/processor";
import { isBoundaryError } from "../../src/errors/error";
import {
  buildHandoff,
  acceptHandoff,
  verifyHandoff,
} from "../../src/handoff/handoff";
import { planLayout } from "../../src/plan/layout";
import { defineSpec } from "../../src/spec/define";

import type { PartitionedBacking, WasmBacking } from "../../src/backing/types";

function expectBoundaryError(
  action: () => void,
  code: string,
  detail?: string,
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(isBoundaryError(thrown)).toBe(true);
  if (isBoundaryError(thrown)) {
    expect(thrown.code).toBe(code);
    if (detail !== undefined) {
      expect(thrown.details.detail).toBe(detail);
    }
  }
}

describe("Handoff Mechanisms (packed backing)", () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: "handoff",
    params: {
      rate: param.f32({ min: 0.25, max: 4 }),
      mode: param.enum({ values: ["a", "b", "c"] }),
    },
    meters: {
      peak: meter.f32(),
      frames: meter.u32(),
    },
  }));

  it("successfully completes the build -> receive -> verify lifecycle", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);

    const env = buildHandoff(plan, backing);
    const accepted = acceptHandoff(env);

    expect(env.packing).toBe("packed");
    expect(accepted.packing).toBe("packed");

    // Verify metadata integrity through the plan source of truth
    expect(accepted.plan.id).toBe("handoff");
    expect(accepted.plan.hash).toBe(plan.hash);
    expect(accepted.plan.bytesTotal).toBe(plan.bytesTotal);

    // Verify compatibility between the local plan and the accepted plan
    expect(() => {
      verifyHandoff(plan, accepted.plan);
    }).not.toThrow();
  });

  it("throws specifically on spec hash mismatch during verification", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const env = buildHandoff(plan, backing);
    const accepted = acceptHandoff(env);

    // Define a different local spec (hash mismatch)
    const spec2 = defineSpec(({ param, meter }) => ({
      params: { rate: param.f32({ min: 0.5, max: 2 }) },
      meters: { peak: meter.f32() },
    }));
    const plan2 = planLayout(spec2);

    try {
      // Compare the incompatible local plan against the accepted plan
      verifyHandoff(plan2, accepted.plan);
      expect.unreachable("verifyHandoff should throw on hash mismatch");
    } catch (error: unknown) {
      if (!isBoundaryError(error)) {
        throw error;
      }
      expect(error.code).toBe("handoff.specHashMismatch");
    }
  });

  it("rejects non-SharedArrayBuffer instances via shape guards", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const env = buildHandoff(plan, backing);

    // Poison the sab field with a standard ArrayBuffer to test type enforcement
    const badEnv = { ...env, sab: new ArrayBuffer(8) };

    expect(() => acceptHandoff(badEnv)).toThrow();
  });

  it("rejects old and unknown handoff packing strings", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const env = buildHandoff(plan, backing);

    const oldPackedPacking = "sh" + "ared";
    const oldPartitionedPacking = oldPackedPacking + "-" + "partitioned";

    for (const packing of [
      oldPackedPacking,
      oldPartitionedPacking,
      "mystery",
    ]) {
      let thrown: unknown;
      try {
        acceptHandoff({ ...env, packing });
      } catch (error) {
        thrown = error;
      }

      expect(isBoundaryError(thrown)).toBe(true);
      if (isBoundaryError(thrown)) {
        expect(thrown.code).toBe("handoff.invalidArtifact");
        expect(thrown.details.detail).toBe(`packing=${packing}`);
      }
    }
  });

  it("provides comprehensive metadata via the accepted plan object", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const env = buildHandoff(plan, backing);
    const accepted = acceptHandoff(env);

    // Verify all plane offsets and layout details are preserved
    expect(accepted.plan.id).toBe("handoff");
    expect(accepted.plan.hash).toBe(plan.hash);
    expect(accepted.plan.bytesTotal).toBe(plan.bytesTotal);
    expect(accepted.plan.planes.PF32).toBe(plan.planes.PF32);
    expect(accepted.plan.planes.PI32).toBe(plan.planes.PI32);
    expect(accepted.plan.planes.PB).toBe(plan.planes.PB);
    expect(accepted.plan.planes.PU).toBe(plan.planes.PU);
    expect(accepted.plan.planes.MF32).toBe(plan.planes.MF32);
    expect(accepted.plan.planes.MF64).toBe(plan.planes.MF64);
    expect(accepted.plan.planes.MU32).toBe(plan.planes.MU32);
    expect(accepted.plan.planes.MU).toBe(plan.planes.MU);

    // Ensure no legacy or duplicated fields exist on the envelope or result
    expect("hash" in env).toBe(false);
    expect("bytesTotal" in env).toBe(false);
    expect("planes" in env).toBe(false);
    expect("meta" in accepted).toBe(false);
  });

  it("binds processor and observer directly from a handoff", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const handoff = buildHandoff(plan, backing);

    const processor = bindProcessor(handoff);
    const observer = bindObserver(handoff);

    expect(processor.params.version()).toBe(0);
    expect(observer.params.version()).toBe(0);

    observer.dispose();
    processor.dispose();
  });

  it("brands accepted handoffs as processor and observer capabilities", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const handoff = buildHandoff(plan, backing);
    const accepted = acceptHandoff(handoff);

    const processor = bindProcessor(accepted);
    const observer = bindObserver(accepted);

    expect(processor.params.version()).toBe(0);
    expect(observer.params.version()).toBe(0);

    observer.dispose();
    processor.dispose();
  });

  it("rejects unbranded accepted-shaped runtime objects in bindings", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const acceptedShape = {
      packing: "packed",
      plan,
      sab: backing.sab,
    };

    expectBoundaryError(() => {
      Reflect.apply(bindProcessor, undefined, [acceptedShape]);
    }, "binding.invalidArgs");
    expectBoundaryError(() => {
      Reflect.apply(bindObserver, undefined, [acceptedShape]);
    }, "binding.invalidArgs");
  });

  it("decodes enum labels for observer handoff sources", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const controller = bindController(spec, plan, backing);
    const handoff = buildHandoff(plan, backing);
    const accepted = acceptHandoff(handoff);

    controller.params.set("mode", "b");

    const handoffObserver = bindObserver(handoff);
    const acceptedObserver = bindObserver(accepted);

    const handoffParams = handoffObserver.params.snapshot(["mode"]);
    const acceptedParams = acceptedObserver.params.snapshot(["mode"]);

    expect(handoffParams.mode).toBe("b");
    expect(acceptedParams.mode).toBe("b");

    acceptedObserver.dispose();
    handoffObserver.dispose();
    controller.dispose();
  });

  it("rejects malformed accepted plan metadata before binding", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const handoff = buildHandoff(plan, backing);

    const planesWithoutPf32 = {
      PI32: plan.planes.PI32,
      PB: plan.planes.PB,
      PU: plan.planes.PU,
      MF32: plan.planes.MF32,
      MF64: plan.planes.MF64,
      MU32: plan.planes.MU32,
      MU: plan.planes.MU,
    };

    expectBoundaryError(
      () => {
        acceptHandoff({
          ...handoff,
          plan: {
            ...plan,
            planes: planesWithoutPf32,
          },
        });
      },
      "handoff.invalidArtifact",
      "plan.planes.PF32",
    );

    expectBoundaryError(
      () => {
        acceptHandoff({
          ...handoff,
          plan: {
            ...plan,
            locks: undefined,
          },
        });
      },
      "handoff.invalidArtifact",
      "plan.locks",
    );

    expectBoundaryError(
      () => {
        acceptHandoff({
          ...handoff,
          plan: {
            ...plan,
            params: undefined,
          },
        });
      },
      "handoff.invalidArtifact",
      "plan.params",
    );

    expectBoundaryError(
      () => {
        acceptHandoff({
          ...handoff,
          plan: {
            ...plan,
            meters: undefined,
          },
        });
      },
      "handoff.invalidArtifact",
      "plan.meters",
    );

    expectBoundaryError(
      () => {
        acceptHandoff({
          ...handoff,
          plan: {
            ...plan,
            bytesTotal: plan.bytesTotal + 0.5,
          },
        });
      },
      "handoff.invalidArtifact",
      "plan.bytesTotal",
    );
  });
});

describe("Handoff Mechanisms (partitioned backing)", () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: "handoff-partitioned",
    params: {
      rate: param.f32({ min: 0.5, max: 2 }),
      mode: param.enum({ values: ["a", "b"] }),
    },
    meters: {
      peak: meter.f32(),
      frames: meter.u32(),
    },
  }));

  it("supports the build -> receive lifecycle for partitioned backing", () => {
    const plan = planLayout(spec);
    const backing = allocatePartitioned(plan);

    const env = buildHandoff(plan, backing);
    const accepted = acceptHandoff(env);

    if (accepted.packing !== "partitioned") {
      throw new Error('Expected packing "partitioned" for partitioned backing');
    }

    expect(accepted.plan.id).toBe("handoff-partitioned");
    expect(accepted.plan.hash).toBe(plan.hash);
    expect(accepted.plan.bytesTotal).toBe(plan.bytesTotal);

    const receivedPlaneKeys = Object.keys(accepted.planes).sort();
    const plannedPlaneKeys = Object.keys(accepted.plan.planes).sort();

    expect(receivedPlaneKeys).toEqual(plannedPlaneKeys);
  });

  it("throws when a plane backing is undersized", () => {
    const plan = planLayout(spec);
    const backing = allocatePartitioned(plan);

    const pf32Bytes = plan.planes.PF32;
    const undersizedBytes = pf32Bytes > 0 ? pf32Bytes - 4 : 0;

    const badBacking: PartitionedBacking = {
      kind: "partitioned",
      planes: {
        ...backing.planes,
        PF32: new SharedArrayBuffer(undersizedBytes),
      },
    };

    try {
      buildHandoff(plan, badBacking);
      expect.unreachable(
        "buildHandoff should throw on undersized plane backing",
      );
    } catch (error: unknown) {
      if (!isBoundaryError(error)) {
        throw error;
      }
      expect(error.code).toBe("handoff.invalidArtifact");
      expect(error.details.detail).toBe("plane=PF32");
    }
  });
});

describe("Handoff Mechanisms (wasm backing)", () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: "handoff-wasm",
    params: {
      rate: param.f32({ min: 0.25, max: 4 }),
    },
    meters: {
      peak: meter.f32(),
    },
  }));

  it("rejects wasm backings at build time", () => {
    const plan = planLayout(spec);

    const wasmBacking: WasmBacking = {
      kind: "wasm",
      memory: new WebAssembly.Memory({ initial: 1 }),
    };

    try {
      buildHandoff(plan, wasmBacking);
      expect.unreachable("buildHandoff should throw for wasm backing");
    } catch (error: unknown) {
      if (!isBoundaryError(error)) {
        throw error;
      }
      expect(error.code).toBe("handoff.invalidArtifact");
      expect(error.details.detail).toBe("kind=wasm");
    }
  });

  it("reports malformed backing kind distinctly from wasm", () => {
    const plan = planLayout(spec);
    const malformedBacking = {
      kind: "mystery",
    };

    expectBoundaryError(
      () => {
        Reflect.apply(buildHandoff, undefined, [plan, malformedBacking]);
      },
      "handoff.invalidArtifact",
      "kind=mystery",
    );
  });
});
