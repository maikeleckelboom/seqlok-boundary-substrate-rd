import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { defineSpec } from '../../src/spec/define';

import type { MeterBuilders, ParamBuilders } from '../../src/spec/define';
import type { SpecInput } from '../../src/spec/types';

type SpecBuilder = (api: {
  readonly param: ParamBuilders;
  readonly meter: MeterBuilders;
}) => {
  id: string;
  params?: unknown;
  meters?: unknown;
};

function runSpec(builder: SpecBuilder): () => unknown {
  return () => defineSpec(builder as unknown as SpecInput);
}

describe('defineSpec scalar ranges – fast-check', () => {
  it('accepts finite f32 ranges with min < max', () => {
    const finite = fc.double({
      min: -1e6,
      max: 1e6,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(finite, finite, (min, max) => {
        fc.pre(min < max);

        const run = runSpec(({ param }) => ({
          id: 'f32-valid-full',
          params: {
            p: param.f32({ min, max }),
          },
          meters: {},
        }));

        expect(run).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('rejects f32 ranges where min >= max', () => {
    const finite = fc.double({
      min: -1e6,
      max: 1e6,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(finite, finite, (a, b) => {
        fc.pre(a >= b);

        const run = runSpec(({ param }) => ({
          id: 'f32-invalid-inverted',
          params: {
            p: param.f32({ min: a, max: b }),
          },
          meters: {},
        }));

        expect(run).toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('accepts f32 with min-only for any finite value', () => {
    const finite = fc.double({
      min: -1e9,
      max: 1e9,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(finite, (min) => {
        const run = runSpec(({ param }) => ({
          id: 'f32-min-only',
          params: {
            p: param.f32({ min }),
          },
          meters: {},
        }));

        expect(run).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('accepts f32 with max-only for any finite value', () => {
    const finite = fc.double({
      min: -1e9,
      max: 1e9,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(finite, (max) => {
        const run = runSpec(({ param }) => ({
          id: 'f32-max-only',
          params: {
            p: param.f32({ max }),
          },
          meters: {},
        }));

        expect(run).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('accepts unbounded f32 (no range object)', () => {
    const run = runSpec(({ param }) => ({
      id: 'f32-unbounded',
      params: {
        p: param.f32(),
      },
      meters: {},
    }));

    expect(run).not.toThrow();
  });

  it('rejects f32 ranges with NaN or Infinity on either bound', () => {
    const weird = fc.oneof(
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
      fc.constant(Number.NEGATIVE_INFINITY),
    );

    const finite = fc.double({
      min: -1e3,
      max: 1e3,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(weird, finite, (bad, other) => {
        const builders: readonly (() => unknown)[] = [
          runSpec(({ param }) => ({
            id: 'f32-bad-min',
            params: {
              p: param.f32({ min: bad, max: other }),
            },
            meters: {},
          })),
          runSpec(({ param }) => ({
            id: 'f32-bad-max',
            params: {
              p: param.f32({ min: other, max: bad }),
            },
            meters: {},
          })),
          runSpec(({ param }) => ({
            id: 'f32-bad-min-only',
            params: {
              p: param.f32({ min: bad }),
            },
            meters: {},
          })),
          runSpec(({ param }) => ({
            id: 'f32-bad-max-only',
            params: {
              p: param.f32({ max: bad }),
            },
            meters: {},
          })),
        ];

        for (const build of builders) {
          expect(build).toThrow();
        }
      }),
      { numRuns: 200 },
    );
  });
});
