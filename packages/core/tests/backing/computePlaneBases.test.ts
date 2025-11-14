import { describe, it, expect } from 'vitest';

import { computePlaneBases, PACK_ORDER_V1 } from '../../src/backing/map-views';
import { planLayout } from '../../src/plan/layout';
import { specFromPlaneBytes } from '../__helpers__/spec-from-bytes';

const B4 = 4;
const B8 = 8;

describe('computePlaneBases + contiguous coverage equals planned total', () => {
  it('bases are contiguous in PACK_ORDER_V1 and end matches plan.bytesTotal', () => {
    // Mixed non-zero planes to exercise contiguity
    const bytes = {
      PF32: 8 * B4, // 8 f32
      PI32: 5 * B4, // 5 i32
      PB: 13, // 13 u8
      PU: 2 * B4, // 2 u32
      MF32: 10 * B4, // 10 f32
      MF64: 3 * B8, // 3 f64
      MU32: 4 * B4, // 4 u32
      MU: 2 * B4, // 2 u32 (locks)
    };

    const plan = planLayout(specFromPlaneBytes(bytes));
    const bases = computePlaneBases(plan.planes);

    // contiguity: base[k] === sum(bytes of all previous planes in order)
    let acc = 0;
    for (const k of PACK_ORDER_V1) {
      expect(bases[k]).toBe(acc);
      acc += plan.planes[k];
    }

    // end coverage: last base + last size === total
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const last = PACK_ORDER_V1[PACK_ORDER_V1.length - 1]!;
    const end = bases[last] + plan.planes[last];
    expect(end).toBe(plan.bytesTotal);
  });
});
