# API Reference

Complete API documentation for `@seqlok/core`.

## Table of Contents

* [Core](#core)

  * [`defineSpec`](#definespec)
  * [`planLayout`](#planlayout)
  * [`allocateShared`](#allocateshared)
  * [`allocateSharedPartitioned`](#allocatesharedpartitioned)
  * [`allocateWasmShared`](#allocateWasmShared)
  * [`buildHandoff`](#buildhandoff)
  * [`receiveHandoff`](#receivehandoff)
  * [`verifyHandoff`](#verifyhandoff)

* [Binding](#binding)

  * [`bindController`](#bindcontroller)
  * [`bindProcessor`](#bindprocessor)

* [Controller Binding API](#controller-binding-api)

* [Processor Binding API](#processor-binding-api)

* [Types](#types)

* [Error Codes](#error-codes)

---

## Core

### `defineSpec`

Define the specification (params + meters).

```ts
function defineSpec<S extends SpecInput>(
  builder: (dsl: { param: ParamBuilders; meter: MeterBuilders }) => S,
): S;
```

**Example**

```ts
import { defineSpec } from '@seqlok/core';

export const spec = defineSpec(({ param, meter }) => ({
  id: 'demo',
  params: {
    timeRatio: param.f32({ min: 0.25, max: 4 }),
    coeffs: param.f32.array(8),
    mode: param.enum(['normal', 'granular']),
  },
  meters: {
    rms: meter.f32(),
    peak: meter.f32(),
    spectrum: meter.f32.array(1024),
    frames: meter.u32(),
  },
}));
// typeof spec is inferred; used as S extends SpecInput everywhere else
```

**DSL summary**

* Params (scalars)

  * `param.f32({ min, max })`
  * `param.i32({ min, max })`
  * `param.bool()`
  * `param.enum(values: readonly string[])`

* Params (arrays, fixed length)

  * `param.f32.array(length: number)` or `param.f32.array({ length })`
  * `param.i32.array(length: number)` or `param.i32.array({ length })`
  * `param.bool.array(length: number)` or `param.bool.array({ length })`
  * `param.enum.array({ values: readonly string[]; length: number })`

* Meters (scalars)

  * `meter.f32()`
  * `meter.f64()`
  * `meter.u32()`
  * `meter.bool()`

* Meters (arrays)

  * `meter.f32.array(length: number)` or `meter.f32.array({ length })`
  * `meter.f64.array(length: number)` or `meter.f64.array({ length })`
  * `meter.u32.array(length: number)` or `meter.u32.array({ length })`

> Numeric ranges are **scalar-only** and only for **params**.
> Arrays (params/meters) are **shape-only** (fixed length, no per-element `{min,max}`).
> Enum arrays always store **indices** (`Int32Array`) via `param.enum.array({ values, length })`.

---

### `planLayout`

Compute a deterministic memory plan for the spec.

```ts
function planLayout<S extends SpecInput>(
  spec: S,
  options?: PlanOptions,
): Plan<S>;
```

* Same spec + options → same layout and hash.
* `Plan<S>` encodes:

  * bytes per plane (`PF32`, `PI32`, `PB`, `PU`, `MF32`, `MF64`, `MU32`, `MU`),
  * offsets / lengths for all params and meters,
  * seqlock indices for param and meter domains,
  * a stable `hash` used for handoff verification and diagnostics.

The **plan layer** is the single source of truth for layout and spec metadata. All layout-related errors live under `plan.*`.

---

### `allocateShared`

Allocate a single `SharedArrayBuffer` for all planes (contiguous backing).

```ts
function allocateShared<S extends SpecInput>(plan: Plan<S>): SharedBacking;
```

* Returns a backing object with:

  * `kind: 'shared'`,
  * one `SharedArrayBuffer`,
  * all planes laid out contiguously,
  * `bytesTotal` matching `plan.bytesTotal`.

* This is the **canonical** backing for cross-thread usage and the simplest option for `buildHandoff`.

---

### `allocateSharedPartitioned`

Allocate separate SABs per plane (partitioned backing).

```ts
function allocateSharedPartitioned<S extends SpecInput>(
  plan: Plan<S>,
): SharedPartitionedBacking;
```

* Returns a backing object with:

  * `kind: 'shared-partitioned'`,
  * one `SharedArrayBuffer` per plane,
  * each plane sized according to `plan.planes[plane]`.

* Intended for hosts that want:

  * distinct lifetimes per plane,
  * OS-level mapping / NUMA tricks,
  * more experimental memory policies.

* **Supported by handoff**:

  * `buildHandoff(plan, backing)` accepts `SharedPartitionedBacking`,
  * the resulting `Handoff<S>` uses `packing: 'shared-partitioned'`,
  * `receiveHandoff` reconstructs a `ReceivedHandoff<S>` with a partitioned backing descriptor.

From the binding point of view, contiguous vs partitioned is opaque; both produce the same param/meter API.

---

### `allocateWasmShared`

Use a shared `WebAssembly.Memory` as the backing (advanced).

```ts
function allocateWasmShared<S extends SpecInput>(
  plan: Plan<S>,
  memory: WebAssembly.Memory,
): WasmSharedBacking;
```

* Uses a **shared** `WebAssembly.Memory` instead of a JS `SharedArrayBuffer`.

* Same plan-driven layout as `allocateShared`:

  * plane offsets/lengths are derived from `Plan<S>`.

* Intended for WASM-heavy engines that want Seqlok planes and DSP state in the same linear memory.

* **Current limitation (v0.1.0)**:

  * `buildHandoff(plan, backing)` does **not** support `kind: 'wasm-shared'` yet,
  * passing a Wasm backing to `buildHandoff` throws `handoff.invalidArtifact`.

You can still bind directly to a Wasm backing via `bindController` / `bindProcessor` if you manage agent boundaries yourself.

---

### `buildHandoff`

Create a serializable handoff payload (owner/main → worker/secondary).

```ts
function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: Backing, // shared or shared-partitioned
): Handoff<S>;
```

* Accepts:

  * `SharedBacking` (`kind: 'shared'`) from `allocateShared(plan)`,
  * `SharedPartitionedBacking` (`kind: 'shared-partitioned'`) from `allocateSharedPartitioned(plan)`.

* Rejects:

  * `kind: 'wasm-shared'` backings (not serializable via handoff yet) with `handoff.invalidArtifact`.

* Packs:

  * `version` (handoff schema version),
  * `packing` (`'shared' | 'shared-partitioned'`),
  * `backingDescriptor` (SAB or per-plane SABs),
  * `plan` (full `Plan<S>`: hash, planes, offsets, lengths).

Conceptually:

```ts
type Handoff<S extends SpecInput> =
  | {
      version: 1;
      packing: 'shared';
      backingDescriptor: { sab: SharedArrayBuffer };
      plan: Plan<S>;
    }
  | {
      version: 1;
      packing: 'shared-partitioned';
      backingDescriptor: { planes: Record<PlaneKey, SharedArrayBuffer> };
      plan: Plan<S>;
    };
// actual structure is opaque and may evolve
```

The handoff is a **protocol envelope**; you should not rely on its exact shape outside of the typed helpers.

---

### `receiveHandoff`

Deserialize a handoff payload on the consumer side.

```ts
function receiveHandoff<S extends SpecInput>(
  handoff: Handoff<S>,
): ReceivedHandoff<S>;
```

* Validates basic handoff structure and extracts:

  * `plan` (remote `Plan<S>`),

  * backing descriptor, honoring `packing`:

    * `'shared'` → `ReceivedSharedHandoff<S>`,
    * `'shared-partitioned'` → `ReceivedSharedPartitionedHandoff<S>`,

  * typed plane views,

  * seqlock indices.

* Does **not** need the spec at runtime; `S` is purely a type parameter.

* Works in:

  * Workers / AudioWorklets,
  * same-thread “multi-agent” setups,
  * tests.

Typical consumer flow (B₂):

```ts
const received = receiveHandoff(handoff);
const processor = bindProcessor(received);
```

If the envelope shape or packing is unsupported or inconsistent with the embedded plan, `receiveHandoff` throws `handoff.invalidArtifact`.

---

### `verifyHandoff`

Check that a remote plan matches a local `Plan<S>` (hash/size/version).

```ts
function verifyHandoff<S extends SpecInput>(
  localPlan: Plan<S>,
  remotePlan: Plan<S>,
): void;
```

Usage pattern:

```ts
// main thread
const spec = defineSpec(/* ... */);
const plan = planLayout(spec);
const backing = allocateShared(plan);
const handoff = buildHandoff(plan, backing);

// worker thread
const received = receiveHandoff(handoff);
verifyHandoff(plan, received.plan); // throws on mismatch
```

* Compares `localPlan` to `remotePlan`:

  * `hash` equality (spec + layout),
  * `bytesTotal` consistency,
  * plane byte lengths,
  * version compatibility.

* Throws a `SeqlokError` on mismatch:

  * `handoff.specHashMismatch`
  * `handoff.versionMismatch`
  * `handoff.backingMismatch`
  * `handoff.invalidArtifact`

This is optional and intended for **diagnostics / hardening**. The golden production path (`receiveHandoff` → `bindProcessor`) does not require it.

---

## Binding

### `bindController`

Create a controller binding (param writer + meter reader).

```ts
function bindController<S extends SpecInput>(
  spec: S,
  plan: Plan<S>,
  backing: Backing,
  options?: ControllerOptions,
): ControllerBinding<S>;
```

* `spec` — semantic contract (names, ranges, enum labels).

* `plan` — layout contract for that spec (`Plan<S>`).

* `backing` — any supported backing for that plan:

  * `SharedBacking` (`allocateShared`),
  * `SharedPartitionedBacking` (`allocateSharedPartitioned`),
  * `WasmSharedBacking` (`allocateWasmShared`).

* `ControllerOptions` configures:

  * param range policy (`'reject' | 'clamp'`),
  * meter snapshot degrade and budgets,
  * exclusivity hints (`exclusive?: boolean`).

Canonical owner/main flow:

```ts
import {
  defineSpec,
  planLayout,
  allocateShared,
  buildHandoff,
  bindController,
  type Handoff,
} from '@seqlok/core';

export const spec = defineSpec(/* ... */);
const plan = planLayout(spec);
const backing = allocateShared(plan);

export const handoff: Handoff<typeof spec> = buildHandoff(plan, backing);

export const controller = bindController(spec, plan, backing, {
  params: { rangePolicy: 'reject' },
});
```

`bindController` cross-checks `spec`, `plan`, and `backing` and throws `binding.*` or `backing.*` errors if they are inconsistent.

---

### `bindProcessor`

Create a processor binding (param reader + meter writer) from a received handoff.

```ts
function bindProcessor<S extends SpecInput>(
  received: ReceivedHandoff<S>,
  options?: ProcessorOptions,
): ProcessorBinding<S>;
```

* Processor binding is **spec-free at runtime**:

  * the spec is only used at type level (`S extends SpecInput`),
  * runtime input is `ReceivedHandoff<S>` from `receiveHandoff`.

* Works with both packings:

  * `packing: 'shared'`
  * `packing: 'shared-partitioned'`

Example (worker / AudioWorklet):

```ts
import {
  receiveHandoff,
  bindProcessor,
  type Handoff,
  type ProcessorBinding,
} from '@seqlok/core';
import type { DemoSpec } from './spec';

type InitMessage = { type: 'init'; handoff: Handoff<DemoSpec> };

let proc: ProcessorBinding<DemoSpec> | undefined;

self.onmessage = (ev: MessageEvent<InitMessage>) => {
  if (ev.data.type !== 'init') return;

  const received = receiveHandoff<DemoSpec>(ev.data.handoff);
  proc = bindProcessor(received);

  // proc.params / proc.meters now available in the audio/worker loop
};
```

---

## Controller Binding API

A `ControllerBinding<S>` exposes:

```ts
interface ControllerBinding<S extends SpecInput> {
  readonly params: ControllerParams<S>;
  readonly meters: ControllerMeters<S>;

  dispose(): void;
}
```

### `params` (controller)

#### Scalar writes

```ts
params.set<K extends ScalarParamKeys<S>>(
  key: K,
  value: ParamValueFor<S, K>,
): void;

params.update(patch: ScalarParamPatch<S>): void;
```

* `set(key, value)`:

  * single scalar write,
  * one param-domain seqlock commit (one PU sequence bump).

* `update(patch)`:

  * atomic micro-batch of **scalar** params,
  * one commit for the whole patch.

* `update` is **scalar-only**:

  * array params are **not** allowed in the patch (shape errors == `binding.shapeInvalid`),
  * unknown keys cause `binding.unknownKey`.

* Range behavior is controlled by `ControllerOptions.params.rangePolicy`:

  * `'reject'` (default): out-of-range values throw `binding.paramRange`.
  * `'clamp'`: values are clamped into `[min,max]` and committed.

#### Array writes (hot path)

```ts
params.stage<K extends ArrayParamKeys<S>>(
  key: K,
  cb: (view: ArrayParamView<S, K>) => void,
): void;
```

* `stage(key, cb)`:

  * exposes a **mutable typed view** (`Float32Array`, `Int32Array`, `Uint8Array`, …),
  * executes `cb(view)` under a single seqlock write window,
  * commits the entire array with one PU bump,
  * guarantees readers never see a torn array.

Typical usage:

```ts
controller.params.stage('coeffs', (view) => {
  view.set(newCoeffs);
});
```

#### Bulk hydration (cold path)

```ts
params.hydrate(patch: HydratePatch<S>): void;
```

* `hydrate(patch)`:

  * accepts a **partial** param object with scalars and arrays,

  * validates keys and shapes up front:

    * unknown keys → `binding.unknownKey`,
    * wrong array types → `binding.shapeInvalid`,
    * length mismatch → `binding.shapeInvalid`,

  * applies all writes under a single seqlock commit (one PU bump),

  * intended for presets, project load, snapshot restore, IPC, REPL.

* Scalars:

  * same semantics as `update`,
  * respect `rangePolicy`.

* Arrays:

  * must be typed arrays (`Float32Array`, `Int32Array`, `Uint8Array`, etc.),
  * length must match the spec-defined length.

Round-trip pattern:

```ts
const snap = controller.params.snapshot();
// ...
controller.params.hydrate(snap);
```

#### Snapshots

```ts
type ParamSnapshotKeys<S extends SpecInput> =
  | readonly (keyof S['params'])[]
  | undefined;

interface ParamSnapshotOptions<
  S extends SpecInput,
  P extends ParamSnapshotKeys<S> | undefined = undefined,
> {
  into?: SnapshotIntoBuffers<S, P>;
}

params.snapshot<P extends ParamSnapshotKeys<S> = undefined>(
  keys?: P,
  options?: ParamSnapshotOptions<S, P>,
): ControllerParamsSnapshot<S, P>;
```

* `snapshot()`:

  * coherent view of params at a single PU sequence,
  * scalars: numbers / booleans / enum **labels**,
  * arrays: owned copies (`Float32Array`, `Int32Array`, etc.).

* `snapshot(keys)`:

  * subset of params.

* `snapshot(keys, { into })`:

  * reuses preallocated typed arrays from `into`,
  * avoids allocations when lengths/types match,
  * mismatches:

    * type mismatch → `binding.snapshotIntoTypeMismatch`,
    * length mismatch → `binding.snapshotIntoLengthMismatch`.

#### Version

```ts
params.version(): PUSeq;
```

* Returns the current param-domain seqlock sequence.
* Cheap atomic; ideal for "only snapshot when changed" loops.

---

### `meters` (controller)

#### Snapshots

```ts
type MeterSnapshotKeys<S extends SpecInput> =
  | readonly (keyof S['meters'])[]
  | undefined;

interface MeterSnapshotOptions<
  S extends SpecInput,
  M extends MeterSnapshotKeys<S> | undefined = undefined,
> {
  into?: MeterSnapshotIntoBuffers<S, M>;
}

meters.snapshot<M extends MeterSnapshotKeys<S> = undefined>(
  keys?: M,
  options?: MeterSnapshotOptions<S, M>,
): ControllerMetersSnapshot<S, M>;
```

* `snapshot()`:

  * coherent view of meters at a single MU sequence,
  * scalars: numbers / booleans,
  * arrays: copies (`Float32Array`, `Float64Array`, `Uint32Array`, `Int32Array` for enum arrays).

* `snapshot(keys, { into })`:

  * subset + reuse existing array buffers,
  * same snapshot-into error semantics as params (`binding.snapshotInto*`).

Degrade / budgets via `ControllerOptions.meters`:

* `degrade: 'returnLatest' | 'throw'`

  * `'returnLatest'`: returns last coherent snapshot if retries are exhausted;
  * `'throw'`: throws `binding.snapshotRetryExhausted`.

* `spinBudget`, `retryBudget`:

  * control how aggressively snapshot will spin/retry under heavy writer contention.

#### Version

```ts
meters.version(): MUSeq;
```

* Returns the meter-domain seqlock sequence.
* Cheap atomic; useful to gate snapshotting.

---

## Processor Binding API

A `ProcessorBinding<S>` exposes:

```ts
interface ProcessorBinding<S extends SpecInput> {
  readonly params: ProcessorParams<S>;
  readonly meters: ProcessorMeters<S>;

  dispose(): void;
}
```

### `params` (processor)

Coherent read window:

```ts
params.within<T>(cb: (view: ProcessorParamView<S>) => T): T;
```

* Executes `cb` inside a seqlock **read window**.

* If a write is in progress:

  * spins for a bounded `spinBudget`,
  * retries up to `retryBudget` times.

* Guarantees that `view` is self-consistent (no half-updated state). If budgets are exhausted, throws `binding.coherentRetryExhausted`.

Inside `cb(view)`:

* Scalars:

  * exposed as plain numbers / booleans / enum **indices**.

* Arrays:

  * exposed as ephemeral `TypedArray` views into the backing,
  * valid only during the callback.

Example:

```ts
processor.params.within((p) => {
  const ratio = p.timeRatio;
  const coeffs = p.coeffs; // Float32Array view
  // use coeffs within this callback only
});
```

Spin/retry budgets are controlled via `ProcessorOptions.params`.

### `meters` (processor)

Coherent write window:

```ts
meters.publish<T>(cb: (w: MeterWriter<S>) => T): T;
```

* Exposes a meter writer inside a single seqlock write window.
* Commits all scalar and array meter updates with one MU bump.
* Exhausted spin/retry budgets throw `binding.coherentRetryExhausted`.

Inside `cb(w)`:

* Scalar meters:

  * functions: `w.peak(value)`, `w.rms(value)`, `w.frames(value)`, etc.

* Array meters:

  * `w.stage('spectrum', (view) => { /* fill view */ })`,
  * `view` is a `TypedArray` aliasing meter plane storage.

Recommended DSP pattern:

```ts
processor.params.within((p) => {
  const ratio = p.timeRatio;
  // read params, compute audio...

  processor.meters.publish((w) => {
    w.peak(computedPeak);
    w.stage('spectrum', (view) => {
      view.set(computedSpectrum);
    });
  });
});
```

Budgets are controlled via `ProcessorOptions.meters`.

---

## Types

Key public types (simplified):

```ts
export type PUSeq = number; // param-domain seqlock sequence
export type MUSeq = number; // meter-domain seqlock sequence

export type RangePolicy = 'clamp' | 'reject';
```

### Value helpers

```ts
/** Controller-visible param values (arrays readonly, enums are label unions). */
export type ParamValues<S extends SpecInput> = {
  [K in ParamKeys<S>]: ParamValueFor<S, K>;
};

/** Controller-visible meter values (arrays readonly). */
export type MeterValues<S extends SpecInput> = {
  [K in MeterKeys<S>]: MeterValueFor<S, K>;
};
```

### Hydration patch

```ts
/**
 * Patch shape for `params.hydrate()`.
 *
 * - Keys are spec param keys.
 * - Scalars use controller-visible types (numbers, booleans, enum labels).
 * - Arrays must be typed arrays (`Float32Array`, `Int32Array`, `Uint8Array`, etc.).
 */
export type HydratePatch<S extends SpecInput> = {
  readonly [K in ParamKeys<S>]?: ParamValueFor<S, K> | undefined;
};
```

### Controller / Processor options

```ts
export interface ControllerOptions {
  readonly params?: {
    readonly rangePolicy?: RangePolicy;
  };

  readonly meters?: {
    /**
     * Behavior when snapshot retries are exhausted.
     * - 'returnLatest': return the latest successfully read values.
     * - 'throw': throw `binding.snapshotRetryExhausted`.
     */
    readonly degrade?: 'returnLatest' | 'throw';

    /** Max spin iterations per snapshot attempt. */
    readonly spinBudget?: number;

    /** Max retry attempts before giving up. */
    readonly retryBudget?: number;
  };

  /**
   * Hint that this binding should be considered the exclusive owner
   * of the backing (used for diagnostics and future safety checks).
   *
   * Defaults to `true`.
   */
  readonly exclusive?: boolean;
}

export interface ProcessorOptions {
  readonly params?: {
    /** Max spin iterations per `within()` attempt. */
    readonly spinBudget?: number;
    /** Max retry attempts before giving up and throwing. */
    readonly retryBudget?: number;
  };

  readonly meters?: {
    /** Max spin iterations per `publish()` attempt. */
    readonly spinBudget?: number;
    /** Max retry attempts before giving up and throwing. */
    readonly retryBudget?: number;
  };
}
```

### Binding & handoff types

```ts
export interface ControllerBinding<S extends SpecInput> {
  readonly params: ControllerParams<S>;
  readonly meters: ControllerMeters<S>;
  dispose(): void;
}

export interface ProcessorBinding<S extends SpecInput> {
  readonly params: ProcessorParams<S>;
  readonly meters: ProcessorMeters<S>;
  dispose(): void;
}

/**
 * Opaque, serializable envelope for a given spec.
 * Type parameter S is used only at compile-time.
 */
export type Handoff<S extends SpecInput = SpecInput> = unknown;

/**
 * Opaque, rehydrated handoff on the consumer side.
 * Carries plan/meta information and backing references.
 */
export type ReceivedHandoff<S extends SpecInput = SpecInput> = unknown;

/** Backing variants. */
export type Backing =
  | SharedBacking
  | SharedPartitionedBacking
  | WasmSharedBacking;
```

`Plan<S>`, `SharedBacking`, `SharedPartitionedBacking`, `WasmSharedBacking`, `ControllerParams<S>`, `ControllerMeters<S>`, `ProcessorParams<S>`, and `ProcessorMeters<S>` are exported generics over `SpecInput` and covered by type tests.

---

## Error Codes

Error domains (grouped by concern), as exposed from the error registry:

* `spec.*` — spec definition / DSL misuse
* `plan.*` — planning/layout issues
* `backing.*` — SAB / WASM allocation, mapping, and capacity
* `handoff.*` — handoff envelopes and plan/backing verification
* `binding.*` — controller/processor binding and runtime usage
* `primitives.*` — low-level seqlock/atomic primitives and SWSR ring
* `env.*` — environment/runtime capability checks
* `diagnostics.*` — diagnostics and introspection
* `internal.*` — internal invariants (`assertionFailed`, `unreachable`, etc.)

Selected examples:

* `spec.rangeInvalid`, `spec.enumInvalid`, `spec.arrayInvalid`

  * Thrown by `defineSpec` / DSL when ranges, enums, or array lengths are invalid.

* `plan.failed`, `plan.overflowRisk`

  * Thrown when layout planning fails or risks overflowing numeric limits.

* `backing.allocFailed`

  * Failure to allocate SAB/Wasm memory for a given plan or plane.

* `backing.allocUndersized`

  * Backing is smaller than `plan.bytesTotal` (or per-plane requirement).

* `backing.wasmMemoryNotShared`

  * `allocateWasmShared` called with a non-shared memory.

* `handoff.specHashMismatch`, `handoff.versionMismatch`

  * `verifyHandoff` detected plan/layout incompatibility between local and remote plans.

* `handoff.backingMismatch`

  * Backing byte lengths or plane layout are inconsistent with the plan.

* `handoff.invalidArtifact`

  * Handoff envelope is malformed, uses unsupported packing, or contains invalid backing descriptors.

* `binding.paramRange`

  * Out-of-range param write under `rangePolicy: 'reject'`.

* `binding.paramInvalidValue`

  * Param value has the wrong shape/type (e.g., enum label not in the spec's `values`).

* `binding.shapeInvalid`

  * Wrong array type/length for params or meters.

* `binding.unknownKey`

  * Param/meter key not present in the spec.

* `binding.snapshotIntoTypeMismatch`,
  `binding.snapshotIntoLengthMismatch`

  * Using `params.snapshot({ into })` / `meters.snapshot({ into })` with mismatched typed arrays.

* `binding.snapshotRetryExhausted`

  * Cannot obtain a coherent controller snapshot within configured budgets.

* `binding.coherentRetryExhausted`

  * Processor `within()` or `publish()` cannot complete a coherent operation within budgets.

* `primitives.seqlockTimeout`

  * Seqlock `tryRead` exhausted its internal budget and could not acquire a coherent snapshot.

* `primitives.swsrRingInvalidLayout`

  * SWSR ring layout invalid or inconsistent with expected header/region sizes.

* `env.unsupported`

  * Environment does not support required primitives (e.g. `SharedArrayBuffer`).

* `env.coopCoepRequired`

  * Indicates missing COOP/COEP when SAB is required in a browser.

* `diagnostics.counterInvalid`, `diagnostics.featureInvalid`

  * Counters or diagnostics feature flags are invalid or out-of-range.

* `internal.assertionFailed`, `internal.unreachable`, `internal.exhaustiveness`

  * Internal invariants violated; these indicate bugs and should never be triggered in normal usage.

All error codes carry structured details and meta:

* `severity` (e.g. `'warning' | 'error' | 'fatal'`)
* `recoverable` (boolean)
* `boundarySafe` (boolean, for “safe to send across process/worker boundary”)
* a detail payload type (e.g. `RangeDetails`, `EnumDetails`, `BufferDetails`, …)

They are registered in the central error registry and exercised by unit tests.
