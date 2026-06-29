import { generateAnonymousSpecId } from "./canonical-hash";
import { compilePlane, isLeafDef } from "./collapse";
import { normalizeSpecAst } from "./normalize";
import { createError } from "../errors/error";

import type { CanonicalSpec, MeterDef, ParamDef, SpecAstInput } from "./types";

const F32_MAX = 3.4028234663852886e38;
const DEFAULT_F32_RANGE = { min: -F32_MAX, max: F32_MAX } as const;
const DEFAULT_I32_RANGE = { min: -2147483648, max: 2147483647 } as const;
const DEFAULT_U32_RANGE = { min: 0, max: 4294967295 } as const;

function validateScalarRange(
  key: string,
  range: { readonly min: number; readonly max: number },
  options: { readonly integer?: boolean; readonly unsigned?: boolean } = {},
): void {
  const { min, max } = range;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw createError("spec.rangeInvalid", "Range must be finite", {
      key,
      min,
      max,
      reason: "infinite",
    });
  }
  if (Number.isNaN(min) || Number.isNaN(max)) {
    throw createError("spec.rangeInvalid", "Range cannot contain NaN", {
      key,
      min,
      max,
      reason: "nan",
    });
  }
  if (!(min < max)) {
    throw createError("spec.rangeInvalid", "Range must satisfy min < max", {
      key,
      min,
      max,
      reason: "inverted",
    });
  }
  if (
    options.integer === true &&
    (!Number.isInteger(min) || !Number.isInteger(max))
  ) {
    throw createError("spec.rangeInvalid", "Range must use integers", {
      key,
      min,
      max,
      reason: "inverted",
    });
  }
  if (options.unsigned === true && (min < 0 || max < 0)) {
    throw createError("spec.rangeInvalid", "Range must be unsigned", {
      key,
      min,
      max,
      reason: "inverted",
    });
  }
}

function normalizeRange(
  key: string,
  input: { readonly min?: number; readonly max?: number },
  defaults: { readonly min: number; readonly max: number },
  options: { readonly integer?: boolean; readonly unsigned?: boolean } = {},
): { readonly min: number; readonly max: number } {
  const range = {
    min: input.min ?? defaults.min,
    max: input.max ?? defaults.max,
  };
  validateScalarRange(key, range, options);
  return range;
}

function cloneParamDef(def: ParamDef): ParamDef {
  const base: Record<string, unknown> = { kind: def.kind };
  if ("length" in def) {
    base.length = def.length;
  }
  if ("values" in def) {
    base.values = [...def.values];
  }
  if ("min" in def) {
    base.min = def.min;
  }
  if ("max" in def) {
    base.max = def.max;
  }
  return base as ParamDef;
}

function cloneMeterDef(def: MeterDef): MeterDef {
  const base: Record<string, unknown> = { kind: def.kind };
  if ("length" in def) {
    base.length = def.length;
  }
  if ("values" in def) {
    base.values = [...def.values];
  }
  return base as MeterDef;
}

function normalizeParamDef(key: string, def: ParamDef): ParamDef {
  switch (def.kind) {
    case "f32":
      return {
        kind: "f32",
        ...normalizeRange(key, def, DEFAULT_F32_RANGE),
      };
    case "i32":
      return {
        kind: "i32",
        ...normalizeRange(key, def, DEFAULT_I32_RANGE, { integer: true }),
      };
    case "u32":
      return {
        kind: "u32",
        ...normalizeRange(key, def, DEFAULT_U32_RANGE, {
          integer: true,
          unsigned: true,
        }),
      };
    default:
      return cloneParamDef(def);
  }
}

function normalizeMeterDef(_key: string, def: MeterDef): MeterDef {
  return cloneMeterDef(def);
}

export function canonicalizeSpecAst(ast: SpecAstInput): CanonicalSpec {
  const normalizedAst = normalizeSpecAst(ast);
  const compiledParams = compilePlane(
    "params",
    normalizedAst.params,
    isLeafDef as (value: unknown) => value is ParamDef,
    normalizeParamDef,
  );
  const compiledMeters = compilePlane(
    "meters",
    normalizedAst.meters,
    isLeafDef as (value: unknown) => value is MeterDef,
    normalizeMeterDef,
  );

  const params = compiledParams.byCanonicalKey;
  const meters = compiledMeters.byCanonicalKey;
  const result: {
    id: string;
    params?: Record<string, ParamDef>;
    meters?: Record<string, MeterDef>;
  } = {
    id: normalizedAst.id ?? generateAnonymousSpecId(params, meters),
  };

  if (Object.keys(params).length > 0) {
    result.params = params;
  }
  if (Object.keys(meters).length > 0) {
    result.meters = meters;
  }

  return result as CanonicalSpec;
}
