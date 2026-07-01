/**
 * Integration test: environment detection → backing allocation.
 *
 * Verifies that:
 * - `assertSabSupportFromSummary` reports `env.unsupported` when SAB is unavailable.
 * - `allocatePacked` also reports `env.unsupported` when SAB is unavailable.
 * - `allocatePacked` succeeds when SAB is present.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { allocatePacked } from "../../src/backing/allocate-packed";
import {
  assertSabSupportFromSummary,
  summarizeEnv,
  type EnvGlobal,
} from "../../src/diagnostics/env";
import { planLayout } from "../../src/plan/layout";
import { defineSpec } from "../../src/spec/define";

import type { BoundaryError } from "../../src/errors/error";

describe("allocate-packed.env-guard", () => {
  let originalSharedArrayBuffer: typeof SharedArrayBuffer | undefined;

  beforeEach(() => {
    originalSharedArrayBuffer = (
      globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer }
    ).SharedArrayBuffer;
  });

  afterEach(() => {
    if (originalSharedArrayBuffer) {
      (
        globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer }
      ).SharedArrayBuffer = originalSharedArrayBuffer;
    } else {
      delete (globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer })
        .SharedArrayBuffer;
    }
  });

  it("assertSabSupportFromSummary fails gracefully when SAB is missing", () => {
    const fakeEnv = {
      document: {},
      crossOriginIsolated: false,
    } as EnvGlobal;

    const summary = summarizeEnv(fakeEnv);

    expect(summary.hasSharedArrayBuffer).toBe(false);

    expect(() => {
      assertSabSupportFromSummary("allocate-packed.env-guard.test", summary);
    }).toThrow();

    try {
      assertSabSupportFromSummary("allocate-packed.env-guard.test", summary);
    } catch (error) {
      const boundaryError = error as BoundaryError<"env.unsupported">;
      expect(boundaryError.code).toBe("env.unsupported");
      expect(boundaryError.message).toContain("SharedArrayBuffer");
      expect(boundaryError.details).toBeDefined();
      expect(boundaryError.details).toHaveProperty(
        "where",
        "allocate-packed.env-guard.test",
      );
    }
  });

  it("throws env.unsupported when allocatePacked is called without SharedArrayBuffer", () => {
    delete (globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer })
      .SharedArrayBuffer;

    const spec = defineSpec(({ param }) => ({
      id: "env-guard-test",
      params: {
        gain: param.f32({ min: 0, max: 1 }),
      },
      meters: {},
    }));

    const plan = planLayout(spec);

    expect(() => {
      allocatePacked(plan);
    }).toThrow();

    try {
      allocatePacked(plan);
    } catch (error) {
      const boundaryError = error as BoundaryError<"env.unsupported">;
      expect(boundaryError.code).toBe("env.unsupported");
      expect(boundaryError.message).toContain("SharedArrayBuffer");
      expect(boundaryError.details).toBeDefined();
      expect(boundaryError.details).toHaveProperty(
        "feature",
        "SharedArrayBuffer",
      );
      if ("reason" in boundaryError.details) {
        expect(boundaryError.details.reason).not.toHaveLength(0);
      }
    }
  });

  it("succeeds when SharedArrayBuffer is available", () => {
    const spec = defineSpec(({ param }) => ({
      id: "env-guard-success",
      params: {
        gain: param.f32({ min: 0, max: 1 }),
      },
      meters: {},
    }));

    const plan = planLayout(spec);
    const backing = allocatePacked(plan);

    expect(backing).toBeDefined();
    expect(backing.kind).toBe("packed");
    expect(backing.sab).toBeInstanceOf(SharedArrayBuffer);
    expect(backing.sab.byteLength).toBeGreaterThan(0);
  });

  it("detects missing SAB even if host forgets to call assertSabSupport", () => {
    delete (globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer })
      .SharedArrayBuffer;

    const spec = defineSpec(({ param }) => ({
      id: "env-guard-missing-sab",
      params: {
        gain: param.f32({ min: 0, max: 1 }),
      },
      meters: {},
    }));

    const plan = planLayout(spec);

    expect(() => {
      allocatePacked(plan);
    }).toThrow();

    try {
      allocatePacked(plan);
    } catch (error) {
      const boundaryError = error as BoundaryError<"env.unsupported">;
      expect(boundaryError.code).toBe("env.unsupported");
      expect(boundaryError.details).toBeDefined();
      expect(boundaryError.details).toHaveProperty(
        "feature",
        "SharedArrayBuffer",
      );
      if ("reason" in boundaryError.details) {
        expect(boundaryError.details.reason).not.toHaveLength(0);
      }
      expect(boundaryError.message).toBeDefined();
    }
  });
});
