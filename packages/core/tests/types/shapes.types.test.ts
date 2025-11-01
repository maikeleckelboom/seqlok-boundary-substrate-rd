import { describe, expectTypeOf, it } from 'vitest';

import type { MeterShape, ParamShape, SpecInput } from '../../src/types';

describe('param shapes', () => {
  it('bool → boolean', () => {
    interface S extends SpecInput {
      id: 'x';
      params: { enabled: { kind: 'bool' } };
    }

    expectTypeOf<ParamShape<S>['enabled']>().toEqualTypeOf<boolean>();
  });

  it('enum → typed indices', () => {
    interface S {
      id: 'x';
      params: { mode: { kind: 'enum'; values: readonly ['a', 'b', 'c'] } };
    }

    expectTypeOf<ParamShape<S>['mode']>().toEqualTypeOf<0 | 1 | 2>();
  });

  it('arrays → correct typed arrays', () => {
    interface S extends SpecInput {
      id: 'x';
      params: {
        coeffsF: { kind: 'f32.array'; length: 8 };
        coeffsI: { kind: 'i32.array'; length: 4 };
      };
    }

    expectTypeOf<ParamShape<S>['coeffsF']>().toEqualTypeOf<Float32Array>();
    expectTypeOf<ParamShape<S>['coeffsI']>().toEqualTypeOf<Int32Array>();
  });
});

describe('meter shapes', () => {
  it('scalar + array', () => {
    interface S extends SpecInput {
      id: 'x';
      meters: {
        peak: { kind: 'f32' };
        spectrum: { kind: 'f32.array'; length: 512 };
      };
    }

    expectTypeOf<MeterShape<S>['peak']>().toEqualTypeOf<number>();
    expectTypeOf<MeterShape<S>['spectrum']>().toEqualTypeOf<Float32Array>();
  });
});
