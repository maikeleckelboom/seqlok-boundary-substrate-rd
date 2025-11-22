import { describe, expect, it } from 'vitest';

import { allocateShared } from '../../src/backing/allocate-shared';
import { growSharedBacking } from '../../src/backing/grow-shared-backing';
import { BACKING_PLANE_PACK_ORDER_V1 } from '../../src/backing/map-views';
import { planLayout } from '../../src/plan/layout';

import type { PlaneByteLengths } from '../../src/plan/types';
import type { SpecInput } from '../../src/spec/types';

type PlaneKeyConst = (typeof BACKING_PLANE_PACK_ORDER_V1)[number];

/**
 * Calculates the byte offset (base) for each plane within a contiguous backing buffer,
 * following the strict V1 packing order.
 */
function computeBases(planes: PlaneByteLengths): Record<PlaneKeyConst, number> {
  const bases = {} as Record<PlaneKeyConst, number>;
  let cursor = 0;
  for (const k of BACKING_PLANE_PACK_ORDER_V1) {
    bases[k] = cursor;
    cursor += planes[k];
  }
  return bases;
}

/**
 * Calculates the total byte size required for a set of plane lengths.
 */
function sumPlanes(p: PlaneByteLengths): number {
  return BACKING_PLANE_PACK_ORDER_V1.reduce((acc, k) => acc + p[k], 0);
}

const spec: SpecInput = {
  id: 'growth-test-spec',
  params: {
    gain: { kind: 'f32' },
    steps: { kind: 'i32.array', length: 16 },
    flags: { kind: 'bool.array', length: 8 },
  },
  meters: {
    peak: { kind: 'f32' },
    counter: { kind: 'u32' },
  },
};

describe('Grow Shared Backing: Dynamic Memory Expansion', () => {
  it('expands backing memory monotonically while preserving existing data content', () => {
    const plan = planLayout(spec);
    const backing = allocateShared(plan);
    const { sab } = backing;

    // Write a "canary" pattern at the end of the current PF32 plane to verify copy integrity
    const pf32Bases = computeBases(plan.planes);
    const pf32EndOffset = plan.planes.PF32 - 4;
    new Uint8Array(sab, pf32Bases.PF32 + pf32EndOffset, 4).set([1, 2, 3, 4]);

    // Request growth for PF32
    const targetPF32Size = plan.planes.PF32 + 1024;
    const res = growSharedBacking(plan, backing, { PF32: targetPF32Size });

    // Verify plane dimensions updated correctly
    expect(res.planes.PF32).toBe(targetPF32Size);
    expect(res.planes.PI32).toBe(plan.planes.PI32);
    expect(res.planes.PB).toBe(plan.planes.PB);

    // Verify total buffer size matches the new sum of planes
    expect(res.backing.sab.byteLength).toBe(sumPlanes(res.planes));

    // Verify content preservation: Canary must exist at the same relative offset within the plane
    const newBases = computeBases(res.planes);
    const preservedData = new Uint8Array(
      res.backing.sab,
      newBases.PF32 + pf32EndOffset,
      4,
    );
    expect([...preservedData]).toEqual([1, 2, 3, 4]);
  });

  it('ignores growth requests that target sizes smaller than the current capacity (monotonicity enforcement)', () => {
    const plan = planLayout(spec);
    const backing = allocateShared(plan);

    // Attempt to shrink PF32
    const res = growSharedBacking(plan, backing, { PF32: plan.planes.PF32 - 64 });

    // Dimensions should remain unchanged
    expect(res.planes.PF32).toBe(plan.planes.PF32);
  });

  it('guarantees zero-initialization for newly allocated memory regions', () => {
    const plan = planLayout(spec);
    const backing = allocateShared(plan);

    // Grow PI32 plane by 128 bytes
    const extensionSize = 128;
    const res = growSharedBacking(plan, backing, {
      PI32: plan.planes.PI32 + extensionSize,
    });

    const bases = computeBases(res.planes);

    // Inspect the newly added tail region of PI32
    const tailRegion = new Uint8Array(
      res.backing.sab,
      bases.PI32 + plan.planes.PI32, // Start at old end
      extensionSize,
    );

    // Verify strictly zeroed
    expect([...tailRegion]).toEqual(Array(extensionSize).fill(0));
  });
});
