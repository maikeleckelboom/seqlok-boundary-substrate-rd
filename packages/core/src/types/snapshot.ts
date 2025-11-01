/**
 * @packageDocumentation
 * Snapshot branding, status, and zero-allocation `into` typing (pure types).
 *
 * Defines the branded {@link Snapshot} wrapper returned by controller reads,
 * branded sequence counters ({@link PUSeq}, {@link MUSeq}), diagnostic
 * {@link SnapshotStatus}, and helper types that describe the shapes of snapshot
 * result objects and the `into` containers used to avoid allocations.
 *
 * @remarks
 * - `Snapshot<T>` is a **readonly** view branded with a unique symbol so it
 *   cannot be confused with a plain object of the same shape.
 * - `PUSeq`/`MUSeq` are branded numbers that identify commit epochs for params
 *   (PU) and meters (MU) respectively.
 * - `IntoFor*` utilities let callers supply their own `TypedArray` buffers for
 *   array fields when taking partial snapshots, minimizing allocations.
 */

import type { MeterValueFor, ParamValueFor } from './shapes';
import type {
  ArrayMeterKeys,
  ArrayParamKeys,
  MeterKeys,
  ParamKeys,
  Prettify,
  SpecInput,
} from './spec';

/** Unique brand used to distinguish snapshot wrappers at the type level. @internal */
declare const SNAPSHOT_BRAND: unique symbol;

/**
 * Branded, **readonly** snapshot wrapper around a values object.
 *
 * @typeParam T - The concrete values object captured by a snapshot.
 *
 * @example
 * ```ts
 * const snap: Snapshot<{ rate: number }> = bindings.params.snapshot();
 * // snap.rate is readonly; do not mutate
 * ```
 */
export type Snapshot<T> = Readonly<T> & { readonly [SNAPSHOT_BRAND]: 0 };

/** @internal */
declare const PU_SEQ: unique symbol;
/** @internal */
declare const MU_SEQ: unique symbol;

/**
 * Branded, monotonic **params** sequence number.
 *
 * @remarks Increments by 1 on each successful controller params commit (PU bump).
 */
export type PUSeq = number & { readonly [PU_SEQ]: 0 };

/**
 * Branded, monotonic **meters** sequence number.
 *
 * @remarks Increments by 1 on each successful processor meters publish (MU bump).
 */
export type MUSeq = number & { readonly [MU_SEQ]: 0 };

/**
 * Diagnostic information associated with a snapshot read.
 *
 * @remarks
 * - These counters help tune spin/retry budgets and detect fallback behavior.
 * - Exact semantics are defined by the seqlock reader implementation.
 */
export interface SnapshotStatus {
  /** Busy-wait iterations on the final attempt while waiting for LOCK to be even. */
  readonly spins: number;
  /** Full read restarts (failed coherence checks) before success/fallback. */
  readonly retries: number;
  /**
   * `true` when a previous coherent epoch was returned (best-effort),
   * `false` when the newest epoch was read coherently.
   */
  readonly fallback: boolean;
}

/**
 * Caller-provided **destination containers** for selected **param** array fields.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - Tuple of param keys being snapshot.
 *
 * @remarks
 * - Only array param keys in `K` may appear here. Scalars are excluded.
 * - Containers are optional per key; omitted keys are allocated by the snapshot.
 */
export type IntoForParams<
  S extends SpecInput,
  K extends readonly ParamKeys<S>[],
> = Prettify<{
  readonly [P in Extract<K[number], ArrayParamKeys<S>>]?: ParamValueFor<S, P>;
}>;

/**
 * Caller-provided **destination containers** for selected **meter** array fields.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - Tuple of meter keys being read.
 */
export type IntoForMeters<
  S extends SpecInput,
  K extends readonly MeterKeys<S>[],
> = Prettify<{
  readonly [P in Extract<K[number], ArrayMeterKeys<S>>]?: MeterValueFor<S, P>;
}>;

/**
 * Values object shape for a **subset** of params specified by `K`.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - Tuple of param keys to include.
 */
export type SnapshotParamsObject<
  S extends SpecInput,
  K extends readonly ParamKeys<S>[],
> = Prettify<{ readonly [P in K[number]]: ParamValueFor<S, P> }>;

/**
 * Values object shape for a **subset** of meters specified by `K`.
 *
 * @typeParam S - The `SpecInput`.
 * @typeParam K - Tuple of meter keys to include.
 */
export type SnapshotMetersObject<
  S extends SpecInput,
  K extends readonly MeterKeys<S>[],
> = Prettify<{ readonly [P in K[number]]: MeterValueFor<S, P> }>;

/**
 * Values object shape for **all params** defined by the spec.
 *
 * @typeParam S - The `SpecInput`.
 */
export type FullParamsSnapshot<S extends SpecInput> =
  S['params'] extends Record<string, unknown>
    ? Prettify<{ readonly [K in ParamKeys<S>]: ParamValueFor<S, K> }>
    : Record<never, never>;

/**
 * Values object shape for **all meters** defined by the spec.
 *
 * @typeParam S - The `SpecInput`.
 */
export type FullMetersSnapshot<S extends SpecInput> =
  S['meters'] extends Record<string, unknown>
    ? Prettify<{ readonly [K in MeterKeys<S>]: MeterValueFor<S, K> }>
    : Record<never, never>;
