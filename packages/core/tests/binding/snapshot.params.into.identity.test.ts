import { describe, expect, it } from 'vitest';

import { defineSpec, planLayout, allocateShared, bindController } from '../../src';

function createHarness() {
  const spec = defineSpec(({ param }) => ({
    id: 'demo',
    params: {
      curve: param.f32.array(1024),
      steps: param.i32.array(8),
      gain: param.f32({ min: 0, max: 4 }),
    },
    meters: {},
  }));

  const plan = planLayout(spec);
  const backing = allocateShared(plan);
  const ctl = bindController(spec, backing);
  return { ctl };
}

describe('params.snapshot into identity', () => {
  it('returns provided into buffers by identity for array params', () => {
    const { ctl } = createHarness();

    ctl.params.stage(
      'curve' /* <- TS2345: Argument of type "curve" is not assignable to parameter of type never */,
      (v) => {
        for (let i = 0; i < v.length; i++) {
          v[i] = i;
        }
      },
    );
    ctl.params.stage('steps', (v) => {
      v.set([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    ctl.params.update({
      gain: 2,
    });

    const buf = new Float32Array(1024);
    const sub = ctl.params.snapshot({
      keys: ['curve'],
      into: {
        curve: buf,
      },
    });

    expect(sub.curve).toBe(buf);
    expect(buf[10]).toBe(10);
  });

  it('allocates fresh arrays when into is omitted for that key', () => {
    const { ctl } = createHarness();

    ctl.params.stage(
      'steps' /* <- TS2345: Argument of type "steps" is not assignable to parameter of type never */,
      (v) => v.fill(9) /* <-
ESLint: Unsafe call of a(n) `error` type typed value. (@typescript-eslint/no-unsafe-call)
ESLint: Unsafe return of a value of type error. (@typescript-eslint/no-unsafe-return)
TS2339: Property fill does not exist on type never */,
    );

    const sub = ctl.params.snapshot({ keys: ['steps'] });
    expect(sub.steps).toBeInstanceOf(Int32Array);
    // Fresh copy, so it should not be any external buffer identity
  });

  //   it('snapshotWithStatus preserves into identity', () => {
  //     const { ctl } = createHarness();
  //
  //     ctl.params.stage(
  //       'curve' /* <- S2345: Argument of type "curve" is not assignable to parameter of type never */,
  //       (v) => v.fill(123) /*
  // ESLint: Unsafe call of a(n) `error` type typed value. (@typescript-eslint/no-unsafe-call)
  // ESLint: Unsafe return of a value of type error. (@typescript-eslint/no-unsafe-return) */,
  //     );
  //
  //     const into = new Float32Array(1024);
  //     const [sub, status] = ctl.params.snapshotWithStatus({
  //       keys: ['curve'],
  //       into: {
  //         curve:
  //           /* <- TS2322: Type Float32Array<ArrayBuffer> is not assignable to type undefined */ into,
  //       },
  //     });
  //
  //     expect(sub.curve).toBe(into);
  //     expect(into[0]).toBe(123);
  //     expect(status.fallback).toBe(false);
  //   });
});
