// File: packages/core/tests/backing/computePlaneBases.test.ts

import { PLANE_PACK_ORDER } from "@seqlok/primitives";
import { describe, expect, it } from "vitest";

import { computeBackingPlaneBases } from "../../src/backing/map-views";

import type { PlaneByteLengths } from "../../src/plan/types";

describe("Backing Plane Layout Calculation", () => {
  it("calculates contiguous base offsets matching the canonical packing order and total size", () => {
    const planes: PlaneByteLengths = {
      PF32: 16,
      PI32: 8,
      PB: 3,
      PU: 8,
      MF32: 12,
      MF64: 16,
      MU32: 4,
      MU: 8,
    };

    const bases = computeBackingPlaneBases(planes);

    let accumulatedOffset = 0;

    for (const plane of PLANE_PACK_ORDER) {
      const actualBase = bases[plane];
      expect(actualBase).toBe(accumulatedOffset);
      accumulatedOffset += planes[plane];
    }

    // total size is the end of the last plane
    expect(accumulatedOffset).toBe(
      planes.PF32 +
        planes.PI32 +
        planes.PB +
        planes.PU +
        planes.MF32 +
        planes.MF64 +
        planes.MU32 +
        planes.MU,
    );
  });
});
