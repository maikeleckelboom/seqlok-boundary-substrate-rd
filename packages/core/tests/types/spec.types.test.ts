import { describe, it, expectTypeOf } from 'vitest';

import type {
  ArrayMeterKeys,
  ArrayParamKeys,
  MeterKeys,
  ParamKeys,
  ScalarMeterKeys,
  ScalarParamKeys,
  SpecInput,
} from '../../src/types';

describe('key extraction preserves literal keys', () => {
  it('ParamKeys', () => {
    interface S {
      readonly id: 'x';
      readonly params: { readonly peak: { readonly kind: 'f32' } };
    }
    type Keys = ParamKeys<S>;
    expectTypeOf<Keys>().toEqualTypeOf<'peak'>();
  });

  it('MeterKeys', () => {
    interface S {
      readonly id: 'x';
      readonly meters: { readonly rms: { readonly kind: 'f32' } };
    }
    type Keys = MeterKeys<S>;
    expectTypeOf<Keys>().toEqualTypeOf<'rms'>();
  });
});

describe('array/scalar key partitions', () => {
  it('Param keys split correctly', () => {
    interface S extends SpecInput {
      id: 'x';
      params: {
        a: { kind: 'f32' };
        b: { kind: 'f32.array'; length: 8 };
        c: { kind: 'bool' };
      };
    }
    expectTypeOf<ArrayParamKeys<S>>().toEqualTypeOf<'b'>();
    expectTypeOf<ScalarParamKeys<S>>().toEqualTypeOf<'a' | 'c'>();
  });

  it('Meter keys split correctly', () => {
    interface S extends SpecInput {
      id: 'x';
      meters: {
        m1: { kind: 'f32' };
        m2: { kind: 'f32.array'; length: 16 };
        m3: { kind: 'f64' };
      };
    }
    expectTypeOf<ArrayMeterKeys<S>>().toEqualTypeOf<'m2'>();
    expectTypeOf<ScalarMeterKeys<S>>().toEqualTypeOf<'m1' | 'm3'>();
  });
});
