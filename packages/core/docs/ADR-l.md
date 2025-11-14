# ADR-2025-11-12 — Meter Writes & Snapshot `into` (Seqlok v1)

**Status:** Accepted
**Date:** 2025-11-12
**Scope:** `@seqlok/core` bindings — meter writing API and controller snapshots
**Decision Owners:** Binding/API maintainers

---

## 0) Summary

We finalize two user-visible binding decisions:

1. **No lazy scalar setters.** Scalars are written by value; arrays are written via a mutator callback. We keep three
   entry points with distinct use cases:

- **Direct scalar writers**: `writer.peak(1.25)` — hot path
- **Generic writer**: `writer.set(key, valueOrMutator)` — dynamic keys, single mental model
- **Explicit array mutation**: `writer.stage('spectrum', dst => { /* mutate */ })`

2. **Controller snapshot keeps `into` as a nested option** (do **not** flatten). Arrays may be zero-copied into
   caller-supplied buffers via
   `snapshot(keys, { into: { arrayKey: buffer } })`.

These choices preserve semantic clarity, maintain type precision, and avoid runtime discrimination overhead.

---

## 1) Rationale

### 1.1 Scalars by value; arrays by mutation

- Different semantics: scalars are cheap immutable values; arrays are buffers mutated in place.
- Type safety: avoids "lazy" scalar callbacks and forgotten returns.
- Performance: avoids per-call key lookups/extra invocations for scalars.
- API honesty: two data categories → two write styles. `set()` supports both without weakening rules.

### 1.2 Keep `into` nested

- Signals intent: `into` is an explicit destination map for zero-copy writes.
- Future-proof: room for options like `format`/`precision`/`normalize` without clashing with meter names.
- Simple types & impl: buffers (`into`) are separated from other options.

---

## 2) Canonical API (high-level)

### 2.1 Processor — meter writers

- **Per-key scalar methods** generated from the spec: `w.peak(v)`, `w.rms(v)`, …
- **Generic `set(key, valueOrMutator)`** for dynamic keys or single-model code.
- **`stage(key, fn)`**: explicit array mutation; thin alias of the array branch of `set`.

> **Invariant:** one MU bump per `publish` call; array mutations commit at the end of the mutator.

### 2.2 Controller — meter snapshots (with `into`)

**Only array and object forms** (no tuple overload):

```ts
const scratch = { spectrum: new Float32Array(1024) };

const [peak, spectrum] = ctl.meters.snapshot(['peak', 'spectrum'], {
  into: { spectrum: scratch.spectrum },
});

// Or object form:
const { 0: peak2, 1: frameMs } = ctl.meters.snapshot({
  keys: ['peak', 'frameMs'],
  // into: { ... }
});
```

Returned arrays are typed readonly; if `into` is supplied, the implementation fills the caller's buffer in place.

---

## 3) Alternatives Considered

- **Single `mutate(key, valueOrFn)`** for scalars+arrays — rejected (hot-path branching, key lookup, worse inlining).
- **Flattened `into`** — rejected (name collisions with meter keys, worse types, clarity loss).

---

## 4) Migration

- Hot loops → per-key scalar methods.
- Dynamic paths → `set(key, valueOrMutator)`.
- Clarity for arrays → `stage('arrayKey', fn)`.
- Snapshots → nested `into` for zero-copy arrays (array/object forms only).

---

## 5) Documentation Tasks

- API Reference: document the three writer entry points and the array/object `snapshot(..., { into })` forms with
  diagnostics.
- Cross-link this ADR from API shape rationale and Processor/Controller sections.

````

---

# API Reference (corrected)

```markdown
# API Reference

Complete API documentation for `@seqlok/core`.

## Table of Contents

- [Core](#core)
  - [`defineSpec`](#definespec)
  - [`planLayout`](#planlayout)
  - [`allocateShared`](#allocateshared)
  - [`allocateSharedPartitioned`](#allocatesharedpartitioned)
  - [`allocateWasmShared`](#allocatewasmshared)
  - [`buildHandoff`](#buildhandoff)
  - [`receiveHandoff`](#receivehandoff)
  - [`verifyHandoff`](#verifyhandoff)

- [Bindings](#bindings)
  - [`bindController`](#bindcontroller)
  - [`bindProcessor`](#bindprocessor)
  - [`bindProcessorWithBacking` (advanced)](#bindprocessorwithbacking-advanced)

- [Controller Binding API](#controller-binding-api)
  - [`params`](#controller-params)
  - [`meters`](#controller-meters)

- [Processor Binding API](#processor-binding-api)
  - [`params`](#processor-params)
  - [`meters`](#processor-meters)

- [Types](#types)
- [Error Codes](#error-codes)
- [Design Notes: Why `writer.set` exists](#design-notes-why-writerset-exists)

---

## Core

### `defineSpec`

```ts
function defineSpec<S extends SpecInput>(
  builder: (dsl: { param: ParamBuilders; meter: MeterBuilders }) => S,
): S;
````

**Example**

```ts
export const spec = defineSpec(({ param, meter }) => ({
  id: 'demo',
  params: {
    timeRatio: param.f32({ min: 0.25, max: 4 }),
    coeffs: param.f32.array(8),
    mode: param.enum({ values: ['normal', 'granular'] }),
  },
  meters: {
    rms: meter.f32(),
    peak: meter.f32(),
    spectrum: meter.f32.array(1024),
    frames: meter.u32(),
  },
}));
```

> Numeric ranges are scalar-only; arrays are shape-only.

---

### `planLayout`

```ts
function planLayout<S extends SpecInput>(spec: S, options?: PlanOptions): Plan<S>;
```

Deterministic planning → same spec yields same plan and hash.

---

### `allocateShared`

```ts
function allocateShared<S extends SpecInput>(plan: Plan<S>): SharedBacking;
```

Allocates a single `SharedArrayBuffer` for all planes.

---

### `allocateSharedPartitioned`

```ts
function allocateSharedPartitioned<S extends SpecInput>(
  plan: Plan<S>,
): SharedPartitionedBacking;
```

Allocate one `SharedArrayBuffer` **per plane** (“partitioned” backing).

> Useful when you want independent growth per plane or to hand individual planes to different workers.

---

### `allocateWasmShared`

```ts
function allocateWasmShared<S extends SpecInput>(
  plan: Plan<S>,
  memory: WebAssembly.Memory,
): WasmSharedBacking;
```

Use a shared `WebAssembly.Memory` as the backing.

---

### `buildHandoff`

```ts
function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: SharedBacking, // contiguous SAB only
): Handoff;
```

Create a serializable handoff payload for cross-thread binding.

---

### `receiveHandoff`

```ts
function receiveHandoff(h: Handoff): ReceivedHandoff;
```

Deserialize a handoff payload on the worker/worklet side.

---

### `verifyHandoff`

```ts
function verifyHandoff<S extends SpecInput>(
  plan: Plan<S>,
  received: ReceivedHandoff,
): void;
```

Validate `specHash` and `bytesTotal` before binding.

---

## Bindings

### `bindController`

```ts
function bindController<S extends SpecInput>(
  spec: S,
  backing: Backing,
  options?: ControllerOptions,
): ControllerBinding<S>;
```

Creates the controller binding (param writer + meter reader).

---

### `bindProcessor`

```ts
function bindProcessor<S extends SpecInput>(
  spec: S,
  received: ReceivedHandoff,
  options?: ProcessorOptions,
): ProcessorBinding<S>;
```

Creates the processor binding (param reader + meter writer) from a verified handoff.

> Generic-only overload (`bindProcessor<Spec>(received)`) is planned; until implemented, pass `spec` explicitly.

---

### `bindProcessorWithBacking` (advanced)

```ts
function bindProcessorWithBacking<S extends SpecInput>(
  spec: S,
  backing: Backing,
  options?: ProcessorOptions,
): ProcessorBinding<S>;
```

Bypass handoff verification and bind directly to a backing (tests/same-thread only).

---

## Controller Binding API

### `params`

- `set(key, value): void` – write one scalar (one PU bump)
- `update(patch): void` – atomic batch of scalars (one PU bump)
- `stage(key, cb): void` – RAII write for array params (one PU bump)
- `version(): number` – current PU sequence (cheap atomic)

### `meters`

- `snapshot(...): T` – coherent meter read (array/object forms only)
- `version(): number` – current MU sequence (cheap atomic)

#### Snapshot — **array form** + nested `into`

```ts
const scratch = { spectrum: new Float32Array(1024) };

const [peak, spectrum] = ctl.meters.snapshot(['peak', 'spectrum'], {
  into: { spectrum: scratch.spectrum },
  // reserved: format / precision / normalize
});
```

#### Snapshot — **object form**

```ts
const res = ctl.meters.snapshot({
  keys: ['peak', 'frameMs'],
  // into: { frameMs: buf }
});
```

**Return types**

- Scalars → `number` (or branded numbers when used).
- Arrays → `readonly` views. If `into[key]` is provided, the returned view aliases the caller's buffer.

**Diagnostics for `into`**

- `binding.snapshotIntoTypeMismatch`
- `binding.snapshotIntoLengthMismatch`

> **No tuple overload.** Calls like `ctl.meters.snapshot('peak', 'frameMs')` are not supported.

---

## Processor Binding API

### `params`

- `within(cb): T` – coherent, zero-alloc read window; arrays are ephemeral views (do not escape)

### `meters`

- `publish(cb): T` – stage writes and commit atomically (exactly one MU bump)

**Writer entry points inside `publish`**

- Per-key scalar methods (generated): `w.peak(value)`, `w.rms(value)`, … — fastest path
- Generic writer: `w.set(key, valueOrMutator)` — dynamic keys / single model
- Explicit array mutation: `w.stage(key, fn)` — readability alias for arrays

**Constraints**

- No lazy scalar setters (`w.set('peak', () => v)`) — not supported.
- Array updates are RAII-scoped; commit at end of mutator.
- Exactly one MU bump per `publish` call.

**Representative types (zero `any`)**

```ts
export interface MeterWriter<S extends SpecInput> {
  // Per-key scalar methods are emitted per spec key, e.g.:
  // peak(value: number): void;

  set<K extends ScalarMeterKeys<S>>(key: K, value: MeterScalarFor<S, K>): void;

  set<K extends ArrayMeterKeys<S>>(
    key: K,
    mutate: (dst: { readonly view: MeterArrayFor<S, K> }) => void,
  ): void;

  stage<K extends ArrayMeterKeys<S>>(
    key: K,
    mutate: (dst: { readonly view: MeterArrayFor<S, K> }) => void,
  ): void;
}
```

---

## Types

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
```

---

## Error Codes

- Domains: `spec.*`, `plan.*`, `backing.*`, `binding.*`, `handoff.*`, `orchestration.*`, `internal.*`, `primitives.*`,
  `runtime.*`
- Examples: `handoff.specHashMismatch`, `binding.snapshotIntoTypeMismatch`, `binding.snapshotIntoLengthMismatch`

---

## Design Notes: Why `writer.set` exists

`writer.set` is the ergonomic bridge for data-driven code that must write either scalars or arrays using a single model.
It preserves type safety and invariants. For hot paths, prefer per-key scalar methods and `stage` for arrays (see
ADR-2025-11-12).
