import { describe, it, expectTypeOf } from 'vitest';

import type {
  SpecInput,
  ControllerParams,
  ProcessorParams,
  MeterWriter,
} from '../../src/types';

describe('bindings types', () => {
  it('controller.update patch only contains scalar keys', () => {
    interface S extends SpecInput {
      id: 'x';
      params: { rate: { kind: 'f32' }; coeffs: { kind: 'f32.array'; length: 8 } };
    }

    type Update = ControllerParams<S>['update'];
    type Patch = Parameters<Update>[0];

    // Only scalar key `rate` is allowed in the patch; array key `coeffs` is excluded.
    expectTypeOf<Patch>().toMatchObjectType<Readonly<Partial<{ rate: number }>>>();
  });

  it('processor.within view shapes are correct (pure type extraction)', () => {
    interface S extends SpecInput {
      id: 'x';
      params: {
        rate: { kind: 'f32' };
        enabled: { kind: 'bool' };
        coeffs: { kind: 'f32.array'; length: 8 };
      };
    }

    type P = ProcessorParams<S>;
    type Within = P['within'];
    type View = Parameters<Within>[0] extends (v: infer V) => unknown ? V : never;

    // Scalar → number
    expectTypeOf<View['rate']>().toEqualTypeOf<number>();
    // Bool → boolean (public surface)
    expectTypeOf<View['enabled']>().toEqualTypeOf<boolean>();
    // Array param → correct typed array class
    expectTypeOf<View['coeffs']>().toEqualTypeOf<Float32Array>();
  });

  it('meter writer has scalar setters and array stage', () => {
    interface S extends SpecInput {
      id: 'x';
      meters: { peak: { kind: 'f32' }; spectrum: { kind: 'f32.array'; length: 512 } };
    }
    type W = MeterWriter<S>;

    // Scalar meter is a setter function
    expectTypeOf<W['peak']>().toEqualTypeOf<(value: number) => void>();

    // Array meter uses writer.stage - it's a generic method, not a concrete type
    expectTypeOf<W>().toHaveProperty('stage');

    // Test that stage can be called with the correct signature
    type StageMethod = W['stage'];
    expectTypeOf<StageMethod>().toBeCallableWith('spectrum', (_: Float32Array) => {
      /* empty */
    });

    // Object subset check: writer has peak setter and stage method
    expectTypeOf<W>().toMatchObjectType<{
      peak: (value: number) => void;
    }>();
  });
});
