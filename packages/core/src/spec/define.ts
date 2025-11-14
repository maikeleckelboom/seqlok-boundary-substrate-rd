import {
  asNonEmpty,
  createRangeInput,
  isPlainObject,
  parseArrayLen,
  assertValidateScalarRange,
} from './validate';

import type { SpecInput } from './types';
import type { ScalarRangeInput } from './validate';

interface F32Builder {
  (range?: ScalarRangeInput): {
    readonly kind: 'f32';
    readonly min?: number;
    readonly max?: number;
  };

  array(length: number | { readonly length: number }): {
    readonly kind: 'f32.array';
    readonly length: number;
  };
}

interface I32Builder {
  (range?: ScalarRangeInput): {
    readonly kind: 'i32';
    readonly min?: number;
    readonly max?: number;
  };

  array(length: number | { readonly length: number }): {
    readonly kind: 'i32.array';
    readonly length: number;
  };
}

interface BoolBuilder {
  (): { readonly kind: 'bool' };

  array(length: number | { readonly length: number }): {
    readonly kind: 'bool.array';
    readonly length: number;
  };
}

interface EnumBuilder {
  <const V extends readonly string[]>(
    valuesOrConfig: V | { readonly values: V },
  ): {
    readonly kind: 'enum';
    readonly values: V;
  };

  array<const V extends readonly string[], N extends number>(opts: {
    readonly values: V;
    readonly length: N;
  }): {
    readonly kind: 'enum.array';
    readonly values: V;
    readonly length: N;
  };
}

interface MeterF32Builder {
  (): { readonly kind: 'f32' };

  array(length: number | { readonly length: number }): {
    readonly kind: 'f32.array';
    readonly length: number;
  };
}

interface MeterF64Builder {
  (): { readonly kind: 'f64' };

  array(length: number | { readonly length: number }): {
    readonly kind: 'f64.array';
    readonly length: number;
  };
}

interface MeterU32Builder {
  (): { readonly kind: 'u32' };

  array(length: number | { readonly length: number }): {
    readonly kind: 'u32.array';
    readonly length: number;
  };
}

type MeterBoolBuilder = () => { readonly kind: 'bool' };

export interface ParamBuilders {
  readonly f32: F32Builder;
  readonly i32: I32Builder;
  readonly bool: BoolBuilder;
  readonly enum: EnumBuilder;
}

export interface MeterBuilders {
  readonly f32: MeterF32Builder;
  readonly f64: MeterF64Builder;
  readonly u32: MeterU32Builder;
  readonly bool: MeterBoolBuilder;
}

/**
 * Create a spec either from a plain object or via builders.
 */
export function defineSpec<S extends SpecInput>(
  arg: S | ((api: { readonly param: ParamBuilders; readonly meter: MeterBuilders }) => S),
): S {
  if (typeof arg !== 'function') {
    return arg;
  }

  const f32: F32Builder = (() => {
    const fn = (r?: ScalarRangeInput) => {
      const min = r?.min;
      const max = r?.max;

      if (min !== undefined || max !== undefined) {
        assertValidateScalarRange('param.f32', createRangeInput(min, max));
      }

      if (min !== undefined && max !== undefined) {
        return { kind: 'f32' as const, min, max };
      }
      if (min !== undefined) {
        return { kind: 'f32' as const, min };
      }
      if (max !== undefined) {
        return { kind: 'f32' as const, max };
      }
      return { kind: 'f32' as const };
    };

    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'f32.array' as const,
      length: parseArrayLen(length),
    });

    return fn;
  })();

  const i32: I32Builder = (() => {
    const fn = (r?: ScalarRangeInput) => {
      const min = r?.min;
      const max = r?.max;

      if (min !== undefined || max !== undefined) {
        assertValidateScalarRange('param.i32', createRangeInput(min, max), {
          integer: true,
        });
      }

      if (min !== undefined && max !== undefined) {
        return { kind: 'i32' as const, min, max };
      }
      if (min !== undefined) {
        return { kind: 'i32' as const, min };
      }
      if (max !== undefined) {
        return { kind: 'i32' as const, max };
      }
      return { kind: 'i32' as const };
    };

    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'i32.array' as const,
      length: parseArrayLen(length),
    });

    return fn;
  })();

  const bool: BoolBuilder = (() => {
    const fn = () => ({ kind: 'bool' as const });
    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'bool.array' as const,
      length: parseArrayLen(length),
    });
    return fn;
  })();

  const enumBuilder: EnumBuilder = (() => {
    const scalar = <const V extends readonly string[]>(
      arg: V | { readonly values: V },
    ) => {
      const raw: V = isPlainObject(arg) ? (arg as { readonly values: V }).values : arg;
      return { kind: 'enum' as const, values: asNonEmpty(raw) };
    };

    const array = <const V extends readonly string[], N extends number>(opts: {
      readonly values: V;
      readonly length: N;
    }) => ({
      kind: 'enum.array' as const,
      values: asNonEmpty(opts.values),
      length: parseArrayLen(opts.length) as N,
    });

    const fn = scalar as EnumBuilder;
    fn.array = array;
    return fn;
  })();

  const meterF32: MeterF32Builder = (() => {
    const fn = () => ({ kind: 'f32' as const });
    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'f32.array' as const,
      length: parseArrayLen(length),
    });
    return fn;
  })();

  const meterF64: MeterF64Builder = (() => {
    const fn = () => ({ kind: 'f64' as const });
    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'f64.array' as const,
      length: parseArrayLen(length),
    });
    return fn;
  })();

  const meterU32: MeterU32Builder = (() => {
    const fn = () => ({ kind: 'u32' as const });
    fn.array = (length: number | { readonly length: number }) => ({
      kind: 'u32.array' as const,
      length: parseArrayLen(length),
    });
    return fn;
  })();

  const meterBool: MeterBoolBuilder = () => ({ kind: 'bool' as const });

  const param = {
    f32,
    i32,
    bool,
    enum: enumBuilder,
  } as const;

  const meter = {
    f32: meterF32,
    f64: meterF64,
    u32: meterU32,
    bool: meterBool,
  } as const;

  const build = arg as (api: {
    readonly param: ParamBuilders;
    readonly meter: MeterBuilders;
  }) => S;

  return build({ param, meter });
}
