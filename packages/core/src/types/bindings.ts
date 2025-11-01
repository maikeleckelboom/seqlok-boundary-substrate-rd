/**
 * @packageDocumentation
 * Public binding contracts for Controller and Processor (pure types).
 *
 * These types define the **host-side** (Controller) and **real-time** (Processor)
 * interaction surfaces over a Seqlok plan. They are *pure types*—no runtime code.
 *
 * ## Semantics (summary)
 * - **Params (Controller → write, Processor → read):**
 *   - `update` performs an atomic multi-scalar commit → **exactly one PU bump**.
 *   - `stage(paramArray, cb)` exposes a **temporary array view**; mutations inside
 *     the callback coalesce into **exactly one PU bump**. The view is **ephemeral**.
 * - **Meters (Processor → write, Controller → read):**
 *   - `publish(cb)` batches scalar writes and array stages into **exactly one MU bump**.
 * - **Snapshots (Controller reads):** `snapshot()` returns a typed object view of
 *   the latest values; `{ keys, into }` overloads allow selective reads and reuse
 *   of caller-provided objects/arrays to avoid allocations.
 * - **Coherence (Processor reads):** `within(cb)` runs `cb` under a coherent
 *   read window. Scalar values are captured; array views are **temporary** and
 *   must not be retained.
 * - **Range policy:** `ControllerOptions.rangePolicy` governs **scalar** param
 *   writes only—`'clamp' | 'reject'` (default `'reject'`). Array params are
 *   validated by shape/length; no per-element clamping occurs.
 */

import type { MeterValueFor, ParamValueFor } from './shapes';
import type {
  FullMetersSnapshot,
  FullParamsSnapshot,
  IntoForMeters,
  IntoForParams,
  PUSeq,
  Snapshot,
  SnapshotMetersObject,
  SnapshotParamsObject,
  SnapshotStatus,
} from './snapshot';
import type {
  ArrayMeterKeys,
  ArrayParamKeys,
  MeterKeys,
  ParamDef,
  ParamKeys,
  Prettify,
  RangePolicy,
  ScalarMeterKeys,
  ScalarParamKeys,
  SpecInput,
} from './spec';

// Section: Controller – Params (write + read)

export interface ControllerParamsWriter<S extends SpecInput> {
  /**
   * Atomic multi-scalar update — **exactly one PU bump**.
   *
   * Only **scalar** param keys are accepted at compile time. The update is
   * applied atomically so readers observe either all changes or none.
   *
   * @example
   * ```ts
   * bindings.params.update({ rate: 1.12, mode: 'granular' });
   * ```
   * @param patch Partial record of scalar param keys to new values.
   */
  update(
    patch: Readonly<
      Partial<{
        [K in ScalarParamKeys<S>]: ParamValueFor<S, K>;
      }>
    >,
  ): void;

  /**
   * **RAII** mutation for an array param — **exactly one PU bump**.
   *
   * Provides a **temporary view** of the array param. The view is valid only
   * within the callback and must not be stored or used after the callback returns.
   *
   * @example
   * ```ts
   * bindings.params.stage('spectrum', (view) => {
   *   for (let i = 0; i < view.length; i++) view[i] = next[i];
   * });
   * ```
   * @param key Array param key.
   * @param cb  Mutator that receives a temporary view to write into.
   */
  stage<K extends ArrayParamKeys<S>>(
    key: K,
    cb: (view: ParamValueFor<S, K>) => void,
  ): void;
}

/**
 * Controller-side **reader** for params.
 *
 * `snapshot` and `snapshotWithStatus` have overloads to:
 * - Return **all** params
 * - Return a **subset** via `keys`
 * - Reuse caller-provided containers via `into` to avoid allocations
 */
export interface ControllerParamsReader<S extends SpecInput> {
  /** Snapshot **all** params into a typed object. */
  snapshot(): Snapshot<FullParamsSnapshot<S>>;

  /** Snapshot a **subset** of params with optional `into` reuse. */
  snapshot<const K extends readonly ParamKeys<S>[]>(opts: {
    readonly keys: K;
    readonly into?: IntoForParams<S, K>;
  }): Snapshot<SnapshotParamsObject<S, K>>;

  /** Snapshot **all** params and return the current snapshot status. */
  snapshotWithStatus(): readonly [Snapshot<FullParamsSnapshot<S>>, SnapshotStatus];

  /** Snapshot a **subset** of params with status and optional `into` reuse. */
  snapshotWithStatus<const K extends readonly ParamKeys<S>[]>(opts: {
    readonly keys: K;
    readonly into?: IntoForParams<S, K>;
  }): readonly [Snapshot<SnapshotParamsObject<S, K>>, SnapshotStatus];
}

/** Controller-side params surface: combines reader + writer. */
export type ControllerParams<S extends SpecInput> = ControllerParamsReader<S> &
  ControllerParamsWriter<S>;

// Section: Controller – Meters (read only)

export interface ControllerMeters<S extends SpecInput> {
  /** Snapshot **all** meters. */
  snapshot(): Snapshot<FullMetersSnapshot<S>>;

  /** Snapshot a **subset** of meters with optional `into` reuse. */
  snapshot<const K extends readonly MeterKeys<S>[]>(opts: {
    readonly keys: K;
    readonly into?: IntoForMeters<S, K>;
  }): Snapshot<SnapshotMetersObject<S, K>>;

  /** Snapshot **all** meters with status. */
  snapshotWithStatus(): readonly [Snapshot<FullMetersSnapshot<S>>, SnapshotStatus];

  /** Snapshot a **subset** of meters with status and optional `into` reuse. */
  snapshotWithStatus<const K extends readonly MeterKeys<S>[]>(opts: {
    readonly keys: K;
    readonly into?: IntoForMeters<S, K>;
  }): readonly [Snapshot<SnapshotMetersObject<S, K>>, SnapshotStatus];
}

// Section: Processor – Params (read only)

type ProcessorParamsView<S extends SpecInput> =
  S['params'] extends Record<string, ParamDef>
    ? Prettify<{
        [K in ParamKeys<S>]: ParamValueFor<S, K>;
      }>
    : Record<never, never>;

/** Processor-side **reader** for params. */
export interface ProcessorParams<S extends SpecInput> {
  /**
   * Execute `cb` under a **coherent** read window.
   * Array views are **ephemeral** and valid only within the callback.
   */
  within<T>(cb: (view: ProcessorParamsView<S>) => T): T;

  /**
   * Read the current **PU** sequence (monotonic, branded).
   * Increments by **1** per successful controller commit.
   */
  version(): PUSeq;
}

// Section: Processor – Meters (write only)

export type MeterWriter<S extends SpecInput> = Prettify<
  Record<ScalarMeterKeys<S>, (value: number) => void> & {
    /**
     * **RAII** mutation for an array meter; view is temporary.
     * @param key Array meter key.
     * @param cb  Mutator that writes into the temporary destination view.
     */
    stage<K extends ArrayMeterKeys<S>>(
      key: K,
      cb: (dst: MeterValueFor<S, K>) => void,
    ): void;
  }
>;

/** Processor-side **writer** for meters. */
export interface ProcessorMeters<S extends SpecInput> {
  /**
   * Atomic meter publish — **exactly one MU bump**.
   * All writes inside `cb` coalesce into one commit.
   */
  publish<T>(cb: (writer: MeterWriter<S>) => T): T;
}

// Section: Top-level bindings

/** Controller binding: params (read+write) and meters (read-only). */
export interface ControllerBinding<S extends SpecInput> {
  readonly params: ControllerParams<S>;
  readonly meters: ControllerMeters<S>;

  /** Release resources; subsequent calls on this binding are invalid. */
  dispose(): void;
}

/** Processor binding: params (read-only) and meters (write-only). */
export interface ProcessorBinding<S extends SpecInput> {
  readonly params: ProcessorParams<S>;
  readonly meters: ProcessorMeters<S>;

  /** Release resources; subsequent calls on this binding are invalid. */
  dispose(): void;
}

// Section: Binding options

/**
 * Controller binding options.
 *
 * @property rangePolicy       Scalar write policy: `'reject'` (default) or `'clamp'`.
 * @property forbidDoubleBind  If `true`, prevent binding when a role is already bound.
 */
export interface ControllerOptions {
  /**
   * Scalar write policy for **params**.
   * `'reject'` throws on out-of-range writes; `'clamp'` bounds them to `[min,max]`.
   * @defaultValue `'reject'`
   */
  readonly rangePolicy?: RangePolicy;

  /**
   * When `true`, prevent creating a Controller binding if that role is already bound.
   * @defaultValue `false`
   */
  readonly forbidDoubleBind?: boolean;
}

/** Processor binding options. */
export interface ProcessorOptions {
  /**
   * When `true`, prevent creating a Processor binding if that role is already bound.
   * @defaultValue `false`
   */
  readonly forbidDoubleBind?: boolean;
}
