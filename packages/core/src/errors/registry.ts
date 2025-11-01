/**
 * @packageDocumentation
 * Error Registry: canonical error codes, scopes, and payload shapes.
 *
 * This module defines:
 * - {@link SeqlokErrorScope}: stable domains (spec, handoff, params, meters, backing, env, bind, meta).
 * - {@link ERROR_SPEC}: a literal, zero-cost registry mapping codes → { scope, fields }.
 * - {@link ErrorCode}: union of all error codes (keys of the registry).
 * - {@link ErrorPayload}: typed payload shape for a given {@link ErrorCode} (plus optional `cause`).
 *
 * @remarks
 * - `defineErrors()` preserves literal keys/types without runtime overhead.
 * - `fieldsOf<T>()` is a **phantom** builder: it returns `{}` at runtime but anchors the generic `T`
 *   so each code’s `fields` is precisely typed.
 * - Codes are namespaced as `"scope.identifier"` (e.g., `"params.outOfRange"`).
 * - Keep messages human-readable at call sites; payloads here stay machine-readable and minimal.
 *
 * @example
 * ```ts
 * import { err } from './error';
 * import { ERROR_SPEC, type ErrorCode, type ErrorPayload } from './registry';
 *
 * function validateLength(key: string, expected: number, received: number): never {
 *   const code: ErrorCode = 'params.intoLengthMismatch';
 *   const details: ErrorPayload<typeof code> = { key, expectedLength: expected, receivedLength: received };
 *   throw err(code, `Buffer for "${key}" has wrong length: expected ${expected}, got ${received}`, details);
 * }
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

/**
 * Definition for a single error code.
 *
 * @typeParam S - Scope this error belongs to.
 * @typeParam F - Structured payload fields carried by this error.
 */
interface ErrorDef<S extends SeqlokErrorScope, F extends Record<string, unknown>> {
  readonly scope: S;
  readonly fields: F;
}

/** Internal helper type for the registry map. */
type ErrorSpecMap = Record<string, ErrorDef<SeqlokErrorScope, Record<string, unknown>>>;

/**
 * Preserve literal typing of the registry object with zero runtime cost.
 *
 * @example
 * ```ts
 * const SPEC = defineErrors({ 'spec.invalid': { scope:'spec', fields: fieldsOf<{ reason?: string }>() } });
 * ```
 */
export function defineErrors<const M extends ErrorSpecMap>(m: M): M {
  return m;
}

/**
 * Phantom builder to capture the field-shape type `T` without runtime allocations.
 *
 * @remarks
 * - The optional parameter keeps `T` “used” in both parameter and return positions
 *   to satisfy lint rules about unnecessary type parameters.
 *
 * @example
 * ```ts
 * fields: fieldsOf<{ key: string; min: number; max: number; received: number }>()
 * ```
 */
export function fieldsOf<T extends Record<string, unknown>>(_shape?: T): T {
  return {} as T;
}

/** TypedArray constructor names used in error payloads for buffer binding. */
export type TypedArrayName = 'Float32Array' | 'Float64Array' | 'Uint32Array';

/**
 * Canonical error registry: codes → scope + payload field shape.
 *
 * @remarks
 * - Grouped by scope; add new codes in the correct section.
 * - Keep payloads small and stable; prefer string/number/boolean and short arrays.
 */
export const ERROR_SPEC = defineErrors({
  // ── Spec (DSL definition)
  'spec.invalid': {
    scope: 'spec',
    fields: fieldsOf<{ reason?: string; expected?: unknown; received?: unknown }>(),
  },

  // ── Handoff (cross-thread contract)
  'handoff.validationFailed': {
    scope: 'handoff',
    fields: fieldsOf<{ reason: string }>(),
  },
  'handoff.versionMismatch': {
    scope: 'handoff',
    fields: fieldsOf<{ expected: string | number; received: string | number }>(),
  },
  'handoff.hashMismatch': {
    scope: 'handoff',
    fields: fieldsOf<{ localHash: string; remoteHash: string; diff?: string }>(),
  },
  'handoff.missingPlane': {
    scope: 'handoff',
    fields: fieldsOf<{ plane: string }>(),
  },

  // ── Params (controller writes)
  'params.unknownKey': {
    scope: 'params',
    fields: fieldsOf<{ key: string; available?: readonly string[] }>(),
  },
  'params.outOfRange': {
    scope: 'params',
    fields: fieldsOf<{ key: string; min: number; max: number; received: number }>(),
  },
  'params.invalidValue': {
    scope: 'params',
    fields: fieldsOf<{ key?: string; expected?: unknown; received?: unknown }>(),
  },
  'params.intoTypeMismatch': {
    scope: 'params',
    fields: fieldsOf<{
      key: string;
      expectedType: TypedArrayName;
      receivedType: string;
    }>(),
  },
  'params.intoLengthMismatch': {
    scope: 'params',
    fields: fieldsOf<{ key: string; expectedLength: number; receivedLength: number }>(),
  },

  // ── Meters (processor writes, controller reads)
  'meters.unknownKey': {
    scope: 'meters',
    fields: fieldsOf<{ key: string; available?: readonly string[] }>(),
  },
  'meters.intoTypeMismatch': {
    scope: 'meters',
    fields: fieldsOf<{
      key: string;
      expectedType: TypedArrayName;
      receivedType: string;
    }>(),
  },
  'meters.intoLengthMismatch': {
    scope: 'meters',
    fields: fieldsOf<{ key: string; expectedLength: number; receivedLength: number }>(),
  },

  // ── Backing (SAB/WASM memory shape)
  'backing.wasmNotShared': {
    scope: 'backing',
    fields: fieldsOf<{ detail?: string }>(),
  },
  'backing.sabConfig': {
    scope: 'backing',
    fields: fieldsOf<{ detail?: string }>(),
  },
  'backing.missingPlaneSab': {
    scope: 'backing',
    fields: fieldsOf<{ plane: string }>(),
  },

  // ── Env (platform capabilities)
  'env.unsupported': {
    scope: 'env',
    fields: fieldsOf<{
      feature: string;
      reason: string;
      crossOriginIsolated?: boolean;
    }>(),
  },

  // ── Bind (lifecycle)
  'bind.roleTaken': {
    scope: 'bind',
    fields: fieldsOf<{ role: 'controller' | 'processor' }>(),
  },
  'bind.alreadyBound': {
    scope: 'bind',
    fields: fieldsOf<{ role: 'controller' | 'processor' }>(),
  },
  'bind.disposed': {
    scope: 'bind',
    fields: fieldsOf<{ role?: 'controller' | 'processor' }>(),
  },

  // ── Meta (feature gates)
  'meta.unsupported': {
    scope: 'meta',
    fields: fieldsOf<{ feature: string; detail?: string }>(),
  },
} as const);

/** Union of all defined error codes (registry keys). */
export type ErrorCode = keyof typeof ERROR_SPEC;

/**
 * Structured payload type for a given error code.
 *
 * @typeParam C - Error code drawn from {@link ErrorCode}.
 * @remarks Includes an optional `cause` used by `SeqlokError` to chain errors.
 */
export type ErrorPayload<C extends ErrorCode> = Readonly<
  (typeof ERROR_SPEC)[C]['fields'] & {
    readonly cause?: unknown;
  }
>;
