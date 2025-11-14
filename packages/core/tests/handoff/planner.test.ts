import { describe, expect, it } from 'vitest';

import { planLayout } from '../../src/plan/layout';
import { defineSpec } from '../../src/spec/define';

describe('planner (runtime)', () => {
  it('assigns planes and lengths correctly for scalar + array kinds', () => {
    const spec = defineSpec(({ param, meter }) => ({
      id: 'layout',
      params: {
        f: param.f32({ min: -1, max: 1 }),
        i: param.i32({ min: -5, max: 5 }),
        b: param.bool(),
        e: param.enum(['a', 'b', 'c']),
        fa: param.f32.array(4),
        ia: param.i32.array(3),
        ba: param.bool.array(2),
        ea: param.enum.array({ values: ['x', 'y'], length: 5 }),
      },
      meters: {
        m32: meter.f32(),
        m64: meter.f64(),
        mu32: meter.u32(),
        m32a: meter.f32.array(7),
        m64a: meter.f64.array(2),
        mu32a: meter.u32.array(9),
      },
    }));

    const plan = planLayout(spec);

    /* Params plane tags */
    expect(plan.params.f.plane).toBe('PF32');
    expect(plan.params.i.plane).toBe('PI32');
    expect(plan.params.b.plane).toBe('PB');
    expect(plan.params.e.plane).toBe('PI32');

    expect(plan.params.fa.plane).toBe('PF32');
    expect(plan.params.ia.plane).toBe('PI32');
    expect(plan.params.ba.plane).toBe('PB');
    expect(plan.params.ea.plane).toBe('PI32');

    /* Array lengths (not ranges) preserved */
    expect(plan.params.fa.length).toBe(4);
    expect(plan.params.ia.length).toBe(3);
    expect(plan.params.ba.length).toBe(2);
    expect(plan.params.ea.length).toBe(5);

    /* Meters plane tags */
    expect(plan.meters.m32.plane).toBe('MF32');
    expect(plan.meters.m64.plane).toBe('MF64');
    expect(plan.meters.mu32.plane).toBe('MU32');

    expect(plan.meters.m32a.plane).toBe('MF32');
    expect(plan.meters.m64a.plane).toBe('MF64');
    expect(plan.meters.mu32a.plane).toBe('MU32');

    /* Seqlock reservations exist */
    expect(plan.locks.PU.lock).toBe(0);
    expect(plan.locks.PU.seq).toBe(1);
    expect(plan.locks.MU.lock).toBe(0);
    expect(plan.locks.MU.seq).toBe(1);
  });
});
