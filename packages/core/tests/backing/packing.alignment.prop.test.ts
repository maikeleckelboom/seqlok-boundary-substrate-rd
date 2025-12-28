// File: packages/core/tests/backing/packing.alignment.prop.test.ts

import {
  BYTES_PER_ELEM,
  PLANE_PACK_ORDER,
  type PlaneKey,
} from "@seqlok/primitives";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeBackingPlaneBases } from "../../src/backing/map-views";

import type { PlaneByteLengths } from "../../src/plan/types";

function lastOfNonEmpty<T>(xs: readonly T[], where: string): T {
  const last = xs[xs.length - 1];
  if (last === undefined) {
    throw new Error(`${where}: expected non-empty array`);
  }
  return last;
}

describe("Backing Plane Layout: Alignment & Contiguity Invariants", () => {
  it("maintains natural alignment and strictly contiguous packing order across random layouts", () => {
    const arb: fc.Arbitrary<PlaneByteLengths> = fc.record({
      // Generate byte lengths as multiples of each plane’s natural alignment.
      PF32: fc.nat(256).map((n) => n * BYTES_PER_ELEM.PF32),
      PI32: fc.nat(256).map((n) => n * BYTES_PER_ELEM.PI32),
      PB: fc.nat(1024).map((n) => n * BYTES_PER_ELEM.PB),
      PU: fc.nat(256).map((n) => n * BYTES_PER_ELEM.PU),

      MF32: fc.nat(256).map((n) => n * BYTES_PER_ELEM.MF32),
      MF64: fc.nat(128).map((n) => n * BYTES_PER_ELEM.MF64),
      MU32: fc.nat(256).map((n) => n * BYTES_PER_ELEM.MU32),
      MU: fc.nat(256).map((n) => n * BYTES_PER_ELEM.MU),
    });

    fc.assert(
      fc.property(arb, (lens) => {
        const bases = computeBackingPlaneBases(lens);

        // Each base must satisfy the plane’s natural alignment.
        for (const plane of PLANE_PACK_ORDER) {
          expect(bases[plane] % BYTES_PER_ELEM[plane]).toBe(0);
        }

        // Contiguity in canonical pack order:
        // base(curr) == base(prev) + len(prev)
        let prev: PlaneKey | null = null;
        for (const curr of PLANE_PACK_ORDER) {
          if (prev !== null) {
            expect(bases[curr]).toBe(bases[prev] + lens[prev]);
          }
          prev = curr;
        }

        // End of last plane equals total bytes.
        const last = lastOfNonEmpty(
          PLANE_PACK_ORDER,
          "packing.alignment.prop.test",
        );
        const endLast = bases[last] + lens[last];

        let total = 0;
        for (const plane of PLANE_PACK_ORDER) {
          total += lens[plane];
        }

        expect(endLast).toBe(total);
      }),
      { endOnFailure: true },
    );
  });
});
