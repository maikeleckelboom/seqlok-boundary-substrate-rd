import { describe, it, expectTypeOf } from 'vitest';

import type {
  IntoForMeters,
  IntoForParams,
  MeterValueFor,
  ParamValueFor,
  SnapshotMetersObject,
  SnapshotParamsObject,
} from '../../src/binding/types';
import type { ArrayParamKeys, ScalarParamKeys, SpecInput } from '../../src/spec/types';

describe('Advanced type inference: edge cases', () => {
  interface ComplexSpec extends SpecInput {
    readonly id: 'complex';
    readonly params: {
      gain: { kind: 'f32'; min: 0; max: 4 };
      offset: { kind: 'i32'; min: -100; max: 100 };
      enabled: { kind: 'bool' };
      mode: { kind: 'enum'; values: ['a', 'b', 'c'] };
      curve: { kind: 'f32.array'; length: 128 };
      steps: { kind: 'i32.array'; length: 16 };
      flags: { kind: 'bool.array'; length: 8 };
      states: {
        kind: 'enum.array';
        values: ['idle', 'active'];
        length: 4;
      };
    };
    readonly meters: {
      rms: { kind: 'f32' };
      counter: { kind: 'u32' };
      precise: { kind: 'f64' };
      spectrum: { kind: 'f32.array'; length: 512 };
      bins: { kind: 'u32.array'; length: 64 };
      samples: { kind: 'f64.array'; length: 256 };
    };
  }

  it('splits scalar vs array param keys correctly', () => {
    type Scalars = ScalarParamKeys<ComplexSpec>;
    type Arrays = ArrayParamKeys<ComplexSpec>;

    expectTypeOf<Scalars>().toEqualTypeOf<'gain' | 'offset' | 'enabled' | 'mode'>();
    expectTypeOf<Arrays>().toEqualTypeOf<'curve' | 'steps' | 'flags' | 'states'>();
  });

  it('maps enum params to string unions (public API)', () => {
    type ModeValue = ParamValueFor<ComplexSpec, 'mode'>;
    expectTypeOf<ModeValue>().toExtend<'a' | 'b' | 'c'>();
  });

  it('maps enum arrays to Readonly<Int32Array> (indices)', () => {
    type StatesValue = ParamValueFor<ComplexSpec, 'states'>;
    expectTypeOf<StatesValue>().toExtend<Readonly<Int32Array>>();
  });

  it('narrows IntoForParams to only array keys (subset, optional entries)', () => {
    type Into = IntoForParams<ComplexSpec, readonly ['gain', 'curve', 'steps']>;

    // Only array keys ('curve' | 'steps') can appear; they are optional and readonly
    expectTypeOf<Into>().toMatchObjectType<{
      readonly curve?: Float32Array;
      readonly steps?: Int32Array;
    }>();

    // 'gain' is scalar → must not appear
    expectTypeOf<Into>().not.toMatchObjectType<{
      readonly gain?: unknown;
    }>();
  });

  it('narrows IntoForMeters to only array keys (subset, optional entries)', () => {
    type Into = IntoForMeters<ComplexSpec, ['rms', 'spectrum', 'bins']>;

    expectTypeOf<Into>().toMatchObjectType<{
      readonly spectrum?: Float32Array;
      readonly bins?: Uint32Array;
    }>();

    // 'rms' is scalar → must not appear
    expectTypeOf<Into>().not.toMatchObjectType<{
      readonly rms?: unknown;
    }>();
  });

  it('preserves literal tuple types in snapshot keys', () => {
    type Keys = readonly ['gain', 'mode'];
    type Snap = SnapshotParamsObject<ComplexSpec, Keys>;

    interface Expected {
      readonly gain: number;
      readonly mode: 'a' | 'b' | 'c';
    }

    expectTypeOf<Snap>().toEqualTypeOf<Expected>();
  });

  it('handles mixed scalar/array meter snapshots', () => {
    type Keys = readonly ['rms', 'spectrum', 'counter'];
    type Snap = SnapshotMetersObject<ComplexSpec, Keys>;

    expectTypeOf<Snap>().toMatchObjectType<{
      readonly rms: number;
      readonly spectrum: Readonly<Float32Array>;
      readonly counter: number;
    }>();
  });

  it('distinguishes f32 vs f64 meter types (both numbers at API level)', () => {
    type F32Value = MeterValueFor<ComplexSpec, 'rms'>;
    type F64Value = MeterValueFor<ComplexSpec, 'precise'>;

    expectTypeOf<F32Value>().toEqualTypeOf<number>();
    expectTypeOf<F64Value>().toEqualTypeOf<number>();
  });

  it('handles empty key tuples', () => {
    type EmptyParams = SnapshotParamsObject<ComplexSpec, readonly []>;
    type EmptyMeters = SnapshotMetersObject<ComplexSpec, readonly []>;

    expectTypeOf<EmptyParams>().toEqualTypeOf<Record<never, never>>();
    expectTypeOf<EmptyMeters>().toEqualTypeOf<Record<never, never>>();
  });

  it('validates mutable buffer types for into (arrays only)', () => {
    type ParamInto = IntoForParams<ComplexSpec, readonly ['curve']>;

    // The entry is optional and must be a mutable Float32Array
    expectTypeOf<ParamInto>().toMatchObjectType<{
      readonly curve?: Float32Array;
    }>();
    // Reject readonly buffer type
    expectTypeOf<ParamInto>().not.toMatchObjectType<{
      readonly curve?: Readonly<Float32Array>;
    }>();
  });

  it('handles specs with no params', () => {
    interface NoParams extends SpecInput {
      readonly id: 'no-params';
      readonly params: Record<never, never>;
      readonly meters: {
        peak: { kind: 'f32' };
      };
    }

    type Keys = ScalarParamKeys<NoParams>;
    expectTypeOf<Keys>().toEqualTypeOf<never>();
  });

  it('handles specs with no meters', () => {
    interface NoMeters extends SpecInput {
      readonly id: 'no-meters';
      readonly params: {
        gain: { kind: 'f32'; min: 0; max: 1 };
      };
      readonly meters: Record<never, never>;
    }

    type Keys = keyof NoMeters['meters'];
    expectTypeOf<Keys>().toEqualTypeOf<never>();
  });

  it('preserves bool meter type (stored on MU32 but reads as boolean)', () => {
    interface BoolMeter extends SpecInput {
      readonly id: 'bool-meter';
      readonly params: Record<string, never>;
      readonly meters: {
        active: { kind: 'bool' };
      };
    }

    type Value = MeterValueFor<BoolMeter, 'active'>;
    expectTypeOf<Value>().toEqualTypeOf<boolean>();
  });
});
