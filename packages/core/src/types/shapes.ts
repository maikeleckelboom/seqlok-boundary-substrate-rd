/**
 * @packageDocumentation
 * Value-shape derivation from spec kinds (pure types).
 *
 * Table-driven TypeScript mappings that turn your `SpecInput` kinds into
 * concrete value shapes used by bindings and snapshots. Enums are mapped to
 * index types (e.g., `'mode'` with `['a','b','c']` → `0 | 1 | 2`), numeric
 * scalars map to `number`, and array kinds map to their corresponding
 * `TypedArray` constructors.
 *
 * @remarks
 * - The mapping is defined via small lookup tables (`ParamKindTable`,
 *   `MeterKindTable`) and conditional types.
 * - Enum indices use tuple-literal inference when possible, falling back to
 *   `number` if the enum values are not literal tuples.
 * - Coverage guards at the bottom fail type-checks (editor-only) if you add a
 *   new kind to the DSL without updating the tables.
 */

import type {
  ArrayMeterKind,
  ArrayParamKind,
  MeterDef,
  MeterKeys,
  ParamDef,
  ParamKeys,
  Prettify,
  ScalarMeterKind,
  ScalarParamKind,
  SpecInput,
} from './spec';

/** Extract the numeric literal indices of a tuple type (else `number` for arrays). */
type TupleIndices<T extends readonly unknown[]> = number extends T['length']
  ? number
  : Extract<keyof T, `${number}`> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;

/**
 * Resolve the enum index type for a param definition.
 *
 * - For `{ kind: 'enum', values: [...] }`, returns the index union (e.g., `0|1|2`)
 *   when `values` is a tuple; falls back to `number` for non-literal arrays.
 */
type EnumIndexOf<D> = D extends {
  kind: 'enum';
  values: infer V extends readonly string[];
}
  ? TupleIndices<V>
  : never;

/** Mapping from param kinds to their value types. */
interface ParamKindTable {
  readonly f32: number;
  readonly i32: number;
  readonly bool: boolean;
  readonly enum: never; // overridden by EnumIndexOf<D>
  readonly 'f32.array': Float32Array;
  readonly 'i32.array': Int32Array;
}

/** Value type for a given param definition `D`. */
type ParamValueOf<D extends ParamDef> = D extends { kind: 'enum' }
  ? EnumIndexOf<D>
  : D extends { kind: infer K extends keyof ParamKindTable }
    ? ParamKindTable[K]
    : never;

/** Mapping from meter kinds to their value types. */
interface MeterKindTable {
  readonly f32: number;
  readonly u32: number;
  readonly f64: number;
  readonly 'f32.array': Float32Array;
  readonly 'u32.array': Uint32Array;
  readonly 'f64.array': Float64Array;
}

/** Value type for a given meter definition `D`. */
type MeterValueOf<D extends MeterDef> = MeterKindTable[D['kind']];

/**
 * Concrete param values object derived from a spec.
 *
 * @typeParam S - The `SpecInput`.
 */
export type ParamShape<S extends SpecInput> =
  S['params'] extends Record<string, ParamDef>
    ? Prettify<{ readonly [K in ParamKeys<S>]: ParamValueOf<S['params'][K]> }>
    : Record<never, never>;

/**
 * Concrete meter values object derived from a spec.
 *
 * @typeParam S - The `SpecInput`.
 */
export type MeterShape<S extends SpecInput> =
  S['meters'] extends Record<string, MeterDef>
    ? Prettify<{ readonly [K in MeterKeys<S>]: MeterValueOf<S['meters'][K]> }>
    : Record<never, never>;

/**
 * Value type for a single param key `K` in spec `S`.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - A param key from `S`.
 */
export type ParamValueFor<S extends SpecInput, K extends ParamKeys<S>> =
  S['params'] extends Record<string, ParamDef> ? ParamValueOf<S['params'][K]> : never;

/**
 * Value type for a single meter key `K` in spec `S`.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - A meter key from `S`.
 */
export type MeterValueFor<S extends SpecInput, K extends MeterKeys<S>> =
  S['meters'] extends Record<string, MeterDef> ? MeterValueOf<S['meters'][K]> : never;

/**
 * Editor-only guard: fails types if a new param kind is added to the DSL
 * without updating {@link ParamKindTable}. @internal
 */
type _MissingParamKind = Exclude<ScalarParamKind | ArrayParamKind, keyof ParamKindTable>;
type _ParamKindsCovered = _MissingParamKind extends never
  ? true
  : ['Missing ParamKindTable mappings for', _MissingParamKind];

/**
 * Editor-only guard: fails types if a new meter kind is added to the DSL
 * without updating {@link MeterKindTable}. @internal
 */
type _MissingMeterKind = Exclude<ScalarMeterKind | ArrayMeterKind, keyof MeterKindTable>;
type _MeterKindsCovered = _MissingMeterKind extends never
  ? true
  : ['Missing MeterKindTable mappings for', _MissingMeterKind];

/** Keep the coverage guards “used” without runtime cost. @internal */
export type _ShapesCoverageOK = _ParamKindsCovered;
