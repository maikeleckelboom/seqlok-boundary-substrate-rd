import { describe, expect, it } from 'vitest';

import {
  allocateShared,
  bindController,
  bindProcessor,
  defineSpec,
  planLayout,
} from '../../src';

describe('ProcessorMeters.set (runtime)', () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: 'set-runtime',
    params: {
      gain: param.f32({ min: 0, max: 2 }),
    },
    meters: {
      peak: meter.f32(),
      count: meter.u32(),
      spectrum: meter.f32.array({ length: 8 }),
    },
  }));

  it('writes scalar and array via set()', () => {
    const plan = planLayout(spec);
    const backing = allocateShared(plan);

    const ctl = bindController(spec, backing);
    const proc = bindProcessor(spec, backing);

    // 1) write scalars + arrays via set()
    proc.meters.publish((writer) => {
      writer.set('peak', 0.5);
      writer.set('count', 42);
      writer.set('spectrum', (dst) => {
        for (let i = 0; i < dst.length; i++) {
          dst[i] = 7;
        }
      });
    });

    const meters = ctl.meters.snapshot(['peak', 'count', 'spectrum'], {});

    // ✅ Good Example: Extract to improve readability
    // const buffers = { spectrum: mySpectrumBuffer };
    // const meters = ctl.meters.snapshot(['peak', 'spectrum'], { into: buffers });

    expect(meters.peak).toBeCloseTo(0.5);
    expect(meters.count >>> 0).toBe(42);

    const into = new Float32Array(8);
    const { spectrum } = ctl.meters.snapshot({
      keys: ['spectrum'] as const,
      into: { spectrum: into },
    });
    for (const value of spectrum) {
      expect(value).toBe(7);
    }
  });

  it('throws on unknown meter key at runtime (type escape for test)', () => {
    const plan = planLayout(spec);
    const backing = allocateShared(plan);

    bindController(spec, backing);
    const proc = bindProcessor(spec, backing);

    expect(() => {
      proc.meters.publish((w) => {
        // @ts-expect-error escape the type system intentionally to hit runtime guard
        w.set('nope', 1);
      });
    }).toThrow(/unknown/i);
  });
});
