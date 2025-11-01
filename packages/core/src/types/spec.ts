/**
 * @packageDocumentation
 * Core spec definition types (pure types, zero runtime).
 *
 * Range-only DSL (no step/origin/defaults). These types describe the shape of
 * user-authored specs for params/meters and the derived helper unions for keys.
 *
 * **Conventions**
 * - Params support numeric ranges for numeric kinds only.
 * - Enums require a **non-empty tuple** of string literals.
 * - Bool arrays are supported (PB plane, 1 byte per element).
 * - Meters do **not** support enums in v1.
 */

/** Scalar param kind tags. */
export type ScalarParamKind = 'f32' | 'i32' | 'bool' | 'enum';

/** Array param kind tags. */
export type ArrayParamKind = 'f32.array' | 'i32.array' | 'bool.array' | 'enum.array';

/**
 * Policy for **scalar** param writes on the controller.
 * - `'reject'`: throw on out-of-range writes (default at binding time).
 * - `'clamp'` : bound values to `[min, max]`.
 */
export type RangePolicy = 'clamp' | 'reject';

/** 32-bit float param (optional numeric range). */
export interface F32ParamDef {
  readonly kind: 'f32';
  /** Inclusive minimum (if provided). */
  readonly min?: number;
  /** Inclusive maximum (if provided). */
  readonly max?: number;
}

/** 32-bit signed integer param (optional numeric range). */
export interface I32ParamDef {
  readonly kind: 'i32';
  /** Inclusive minimum (if provided). */
  readonly min?: number;
  /** Inclusive maximum (if provided). */
  readonly max?: number;
}

/** Boolean param. */
export interface BoolParamDef {
  readonly kind: 'bool';
}

/**
 * Enum param.
 * @remarks `values` must be a **non-empty tuple** of string literals to preserve literal indices.
 */
export interface EnumParamDef {
  readonly kind: 'enum';
  /** Non-empty tuple of enum labels. */
  readonly values: readonly [string, ...string[]];
}

/** Union of all scalar param definitions. */
export type ScalarParamDef = F32ParamDef | I32ParamDef | BoolParamDef | EnumParamDef;

/** Float32 array param (fixed length, optional numeric range). */
export interface F32ArrayParamDef {
  readonly kind: 'f32.array';
  /** Element count (fixed). */
  readonly length: number;
  /** Inclusive minimum per element (if provided). */
  readonly min?: number;
  /** Inclusive maximum per element (if provided). */
  readonly max?: number;
}

/** Int32 array param (fixed length, optional numeric range). */
export interface I32ArrayParamDef {
  readonly kind: 'i32.array';
  /** Element count (fixed). */
  readonly length: number;
  /** Inclusive minimum per element (if provided). */
  readonly min?: number;
  /** Inclusive maximum per element (if provided). */
  readonly max?: number;
}

/** Boolean array param (fixed length). */
export interface BoolArrayParamDef {
  readonly kind: 'bool.array';
  /** Element count (fixed). */
  readonly length: number;
}

/**
 * Enum array param (fixed length).
 * @remarks `values` must be a **non-empty tuple** of string literals.
 */
export interface EnumArrayParamDef {
  readonly kind: 'enum.array';
  /** Element count (fixed). */
  readonly length: number;
  /** Non-empty tuple of enum labels. */
  readonly values: readonly [string, ...string[]];
}

/** Union of all array param definitions. */
export type ArrayParamDef =
  | F32ArrayParamDef
  | I32ArrayParamDef
  | BoolArrayParamDef
  | EnumArrayParamDef;

/** Union of all param definitions (scalar or array). */
export type ParamDef = ScalarParamDef | ArrayParamDef;

/** Scalar meter kind tags. */
export type ScalarMeterKind = 'f32' | 'u32' | 'f64';

/** Array meter kind tags. */
export type ArrayMeterKind = 'f32.array' | 'u32.array' | 'f64.array';

/** Scalar meter definition. */
export interface ScalarMeterDef {
  readonly kind: ScalarMeterKind;
}

/** Array meter definition (fixed length). */
export interface ArrayMeterDef {
  readonly kind: ArrayMeterKind;
  /** Element count (fixed). */
  readonly length: number;
}

/** Union of all meter definitions (scalar or array). */
export type MeterDef = ScalarMeterDef | ArrayMeterDef;

/**
 * Authoring shape for a spec (inputs provided by the user).
 *
 * @example
 * ```ts
 * const spec: SpecInput = {
 *   id: 'deck',
 *   params: {
 *     rate: { kind: 'f32', min: 0.25, max: 4 },
 *     mode: { kind: 'enum', values: ['normal','granular'] },
 *     flags: { kind: 'bool.array', length: 4 },
 *   },
 *   meters: {
 *     timeRatioEffective: { kind: 'f32' },
 *     engineLatencyMs:   { kind: 'f64' },
 *   },
 *   meta: { title: 'Example' },
 * };
 * ```
 */
export interface SpecInput {
  /** Stable identifier for this spec. */
  readonly id: string;
  /** Param definitions keyed by id (optional). */
  readonly params?: Readonly<Record<string, ParamDef>>;
  /** Meter definitions keyed by id (optional). */
  readonly meters?: Readonly<Record<string, MeterDef>>;
  /** Optional metadata (opaque to the core). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Unique brand used to distinguish normalized `Spec` at the type level. @internal */
declare const SPEC_BRAND: unique symbol;

/**
 * Normalized, branded spec view preserving key inference from `S`.
 *
 * @typeParam S - The authoring input the normalized spec is derived from.
 * @remarks
 * - Ensures `params`, `meters`, and `meta` are present (empty records if absent).
 * - Carries a brand to avoid accidental structural equivalence with plain inputs.
 */
export interface Spec<S extends SpecInput> extends SpecInput {
  readonly id: S['id'];
  readonly params: S['params'] extends Record<string, ParamDef>
    ? S['params']
    : Record<never, never>;
  readonly meters: S['meters'] extends Record<string, MeterDef>
    ? S['meters']
    : Record<never, never>;
  readonly meta: S['meta'] extends Record<string, unknown>
    ? S['meta']
    : Record<never, never>;
  readonly [SPEC_BRAND]: 0;
}

/** @internal Extract only literal string keys (exclude index signatures). */
type LiteralStringKeys<T> = {
  [K in keyof T]: string extends K ? never : K;
}[keyof T];

/** Param keys (literal-only) from a spec. */
export type ParamKeys<S extends SpecInput> =
  S['params'] extends Record<string, ParamDef> ? LiteralStringKeys<S['params']> : never;

/** Meter keys (literal-only) from a spec. */
export type MeterKeys<S extends SpecInput> =
  S['meters'] extends Record<string, MeterDef> ? LiteralStringKeys<S['meters']> : never;

/** Array param keys from a spec. */
export type ArrayParamKeys<S extends SpecInput> =
  S['params'] extends Record<string, ParamDef>
    ? {
        [K in ParamKeys<S>]: S['params'][K] extends ArrayParamDef ? K : never;
      }[ParamKeys<S>]
    : never;

/** Scalar param keys from a spec. */
export type ScalarParamKeys<S extends SpecInput> =
  S['params'] extends Record<string, ParamDef>
    ? {
        [K in ParamKeys<S>]: S['params'][K] extends ScalarParamDef ? K : never;
      }[ParamKeys<S>]
    : never;

/** Array meter keys from a spec. */
export type ArrayMeterKeys<S extends SpecInput> =
  S['meters'] extends Record<string, MeterDef>
    ? {
        [K in MeterKeys<S>]: S['meters'][K] extends ArrayMeterDef ? K : never;
      }[MeterKeys<S>]
    : never;

/** Scalar meter keys from a spec. */
export type ScalarMeterKeys<S extends SpecInput> =
  S['meters'] extends Record<string, MeterDef>
    ? {
        [K in MeterKeys<S>]: S['meters'][K] extends ScalarMeterDef ? K : never;
      }[MeterKeys<S>]
    : never;

/**
 * Recompute a type to a canonical, readable object shape in editor hovers.
 * @example
 * ```ts
 * type Pretty = Prettify<{ a: 1 } & { b: 2 }>; // { a: 1; b: 2 }
 * ```
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Remove `readonly` from all properties (shallow).
 * @example
 * ```ts
 * type W = { readonly x: number };
 * type M = Mutable<W>; // { x: number }
 * ```
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Enum label union for a specific param key (scalar or array enum).
 *
 * @typeParam S - Spec input.
 * @typeParam K - Param key within `S`.
 * @example
 * ```ts
 * type Mode = EnumValues<typeof spec, 'mode'>; // 'normal' | 'granular'
 * ```
 */
export type EnumValues<S extends SpecInput, K extends ParamKeys<S>> =
  S['params'] extends Record<string, ParamDef>
    ? S['params'][K] extends {
        kind: 'enum' | 'enum.array';
        values: readonly [string, ...string[]];
      }
      ? S['params'][K]['values'][number]
      : never
    : never;
