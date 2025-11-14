import { describe, expect, it } from 'vitest';

import { allocateShared, planLayout } from '../../src';

import type { SpecInput } from '../../src/spec/types';

function makeSpec(bytesPB: number, bytesPF32: number): SpecInput {
  return {
    id: 'demo',
    params: {
      flags: { kind: 'bool.array', length: bytesPB },
      table: { kind: 'f32.array', length: Math.ceil(bytesPF32 / 4) },
    },
    meters: {},
  };
}

function expectBackingMatchesPlan(spec: SpecInput) {
  const plan = planLayout(spec);
  const backing = allocateShared(plan);

  expect(backing.kind).toBe('shared');
  expect(backing.sab).toBeInstanceOf(SharedArrayBuffer);
  expect(backing.sab.byteLength).toBe(plan.bytesTotal);

  return { plan, backing };
}

describe('allocateShared (contiguous plan)', () => {
  it('allocates a SAB whose byteLength equals plan.bytesTotal (small spec)', () => {
    expectBackingMatchesPlan(makeSpec(4, 4));
  });

  it('handles non-zero planes and preserves exact total bytes', () => {
    // 7 bools in PB, 64 bytes worth of f32 entries in PF32
    expectBackingMatchesPlan(makeSpec(7, 64));
  });

  it('works at larger sizes (sanity at multiple pages total)', () => {
    expectBackingMatchesPlan(makeSpec(32 * 1024, 128 * 1024));
  });

  it('produces SAB sizes that grow monotonically with plane usage', () => {
    const smallSpec = makeSpec(4, 16);
    const midSpec = makeSpec(128, 4 * 1024);
    const largeSpec = makeSpec(4 * 1024, 64 * 1024);

    const smallPlan = planLayout(smallSpec);
    const midPlan = planLayout(midSpec);
    const largePlan = planLayout(largeSpec);

    expect(midPlan.bytesTotal).toBeGreaterThan(smallPlan.bytesTotal);
    expect(largePlan.bytesTotal).toBeGreaterThan(midPlan.bytesTotal);

    const smallBacking = allocateShared(smallPlan);
    const midBacking = allocateShared(midPlan);
    const largeBacking = allocateShared(largePlan);

    expect(smallBacking.sab.byteLength).toBe(smallPlan.bytesTotal);
    expect(midBacking.sab.byteLength).toBe(midPlan.bytesTotal);
    expect(largeBacking.sab.byteLength).toBe(largePlan.bytesTotal);
  });
});
