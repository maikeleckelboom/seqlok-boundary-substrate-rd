import { describe, expectTypeOf, it } from 'vitest';

import type {
  IntoForMeters,
  Snapshot,
  SnapshotMetersObject,
} from '../../src/binding/types';
import type { SpecInput } from '../../src/spec/types';

interface S extends SpecInput {
  id: 'snap-meters';
  meters: {
    rms: { kind: 'f32' };
    flags: { kind: 'u32.array'; length: 4 };
    spectrum: { kind: 'f32.array'; length: 512 };
  };
}

describe('ControllerMeters.snapshot typing', () => {
  it('mapping: all meters', () => {
    type R = Snapshot<SnapshotMetersObject<S, readonly ['rms', 'flags', 'spectrum']>>;
    type Expected = Snapshot<{
      readonly rms: number;
      readonly flags: Readonly<Uint32Array>;
      readonly spectrum: Readonly<Float32Array>;
    }>;
    expectTypeOf<R>().toExtend<Expected>();
    expectTypeOf<Expected>().toExtend<R>();
  });

  it('mapping: single-key subset stays scalar without array pollution', () => {
    type R = Snapshot<SnapshotMetersObject<S, readonly ['rms']>>;
    type Expected = Snapshot<{ readonly rms: number }>;
    expectTypeOf<R>().toExtend<Expected>();
    expectTypeOf<Expected>().toExtend<R>();
  });

  it('mapping: mixed subset remains precise per property', () => {
    type R = Snapshot<SnapshotMetersObject<S, readonly ['rms', 'spectrum']>>;
    type Expected = Snapshot<{
      readonly rms: number;
      readonly spectrum: Readonly<Float32Array>;
    }>;
    expectTypeOf<R>().toExtend<Expected>();
    expectTypeOf<Expected>().toExtend<R>();
  });

  it('into typing only allows array keys and enforces constructors', () => {
    type Good = IntoForMeters<S, readonly ['flags', 'spectrum']>;
    type GoodExpected = Readonly<{
      flags?: Uint32Array;
      spectrum?: Float32Array;
    }>;
    expectTypeOf<Good>().toExtend<GoodExpected>();
    expectTypeOf<GoodExpected>().toExtend<Good>();

    // Prove scalar keys produce no properties in into.
    type BadScalar = IntoForMeters<S, readonly ['rms']>;
    expectTypeOf<BadScalar>().toExtend<Readonly<Record<never, never>>>();
    expectTypeOf<Readonly<Record<never, never>>>().toExtend<BadScalar>();
  });
});
