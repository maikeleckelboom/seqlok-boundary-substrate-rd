/**
 * @packageDocumentation
 * Error type primitives: shared scopes, shapes, and zero-cost helpers.
 *
 * This module defines:
 * - {@link SeqlokErrorScope}: stable error domains.
 * - {@link TypedArrayName}: constructor names used in buffer/type errors.
 * - {@link ErrorDef}, {@link ErrorSpecMap}: strongly-typed registry shapes.
 * - {@link defineErrors}, {@link fieldsOf}: literal-preserving helpers with no runtime cost.
 *
 * @remarks
 * - Use these types to author the canonical error registry (`ERROR_SPEC`) in `registry.ts`.
 * - Messages belong at call sites; registry payloads stay minimal and machine-readable.
 * - `fieldsOf<T>()` is a phantom builder—returns `{}` but locks the generic `T` for typing.
 *
 * @example
 * ```ts
 * // registry.ts
 * import { defineErrors, fieldsOf, type ErrorSpecMap } from './error-types';
 *
 * export const ERROR_SPEC = defineErrors({
 *   'params.outOfRange': {
 *     scope: 'params',
 *     fields: fieldsOf<{ key: string; min: number; max: number; received: number }>(),
 *   },
 * } as const);
 * ```
 */

export type SeqlokErrorScope =
  | 'spec'
  | 'handoff'
  | 'params'
  | 'meters'
  | 'backing'
  | 'env'
  | 'bind'
  | 'meta';

/** TypedArray constructor names referenced in buffer/type mismatch errors. */
export type TypedArrayName = 'Float32Array' | 'Float64Array' | 'Uint32Array';

/**
 * Per-code definition within the registry.
 *
 * @typeParam S - Error scope for this code.
 * @typeParam F - Structured payload fields for this code.
 */
export interface ErrorDef<S extends SeqlokErrorScope, F extends Record<string, unknown>> {
  /** Logical domain/category for the error code. */
  readonly scope: S;
  /** Structured, machine-readable fields carried by this error code. */
  readonly fields: F;
}

/**
 * Registry map type: error code → definition.
 *
 * @remarks
 * - Kept `Readonly` to encourage immutable, literal registries.
 * - Codes are commonly namespaced as `"scope.identifier"`.
 */
export type ErrorSpecMap = Readonly<
  Record<string, Readonly<ErrorDef<SeqlokErrorScope, Record<string, unknown>>>>
>;

/**
 * Preserve literal keys and per-entry field types (zero runtime cost).
 *
 * @example
 * ```ts
 * const SPEC = defineErrors({
 *   'env.unsupported': { scope: 'env', fields: fieldsOf<{ feature: string; reason: string }>() },
 * } as const);
 * ```
 *
 * @param m A literal registry object.
 * @returns The same object with preserved literal key/field typing.
 */
export function defineErrors<const M extends ErrorSpecMap>(m: M): M {
  return m;
}

/**
 * Phantom builder for the `fields` payload shape.
 *
 * @remarks
 * - Returns `{}` but captures the generic `T` so each registry entry’s
 *   `fields` is precisely typed without allocations.
 *
 * @example
 * ```ts
 * fields: fieldsOf<{ key: string; expectedLength: number; receivedLength: number }>()
 * ```
 *
 * @param _ Optional placeholder to satisfy lint rules about “unused” type params.
 * @returns An empty object typed as `T`.
 */
export function fieldsOf<T extends Record<string, unknown>>(_?: T): T {
  return {} as T;
}
