# API Reference

Complete API documentation for `@seqlok/core`.

## Table of Contents

- [Core](#core)

  - [`defineSpec`](#definespec)
  - [`planLayout`](#planlayout)
  - [`allocateShared`](#allocateshared)
  - [`allocateSharedPartitioned`](#allocatesharedpartitioned)
  - [`attachWasmShared`](#attachwasmshared)
  - [`buildHandoff`](#buildhandoff)
  - [`receiveHandoff`](#receivehandoff)
  - [`verifyHandoff`](#verifyhandoff)

- [Bindings](#bindings)

  - [`bindController`](#bindcontroller)
  - [`bindProcessor`](#bindprocessor)
  - [`bindProcessorWithBacking` (advanced)](#bindprocessorwithbacking-advanced)

- [Controller Binding API](#controller-binding-api)

- [Processor Binding API](#processor-binding-api)

- [Types](#types)

- [Error Codes](#error-codes)

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

**DSL summary**

- Params (scalars): `f32({min,max})`, `i32({min,max})`, `bool()`, `enum({ values })`
- Params (arrays, fixed length): `f32.array(N)`, `i32.array(N)`, `bool.array(N)`, `enum.array({ values, length })`
- Meters (scalars): `f32()`, `f64()`, `u32()`, `bool()`
- Meters (arrays): `f32.array(N)`, `f64.array(N)`, `u32.array(N)`

> Numeric ranges are scalar-only; arrays are shape-only.

---

### `planLayout`

Compute a deterministic memory plan for the spec.

```ts
function planLayout<S extends SpecInput>(spec: S, options?: PlanOptions): Plan<S>;
```

Deterministic planning → same spec yields same plan and hash. (Export name verified in the package entrypoint.)

---

### `allocateShared`

Allocate a single `SharedArrayBuffer` for all planes.

```ts
function allocateShared<S extends SpecInput>(plan: Plan<S>): SharedBacking;
```

---

### `allocateSharedPartitioned`

Allocate separate SABs per plane (advanced).

```ts
function allocateSharedPartitioned<S extends SpecInput>(
  plan: Plan<S>,
): SharedPartitionedBacking;
```

---

### `attachWasmShared`

Use a shared `WebAssembly.Memory` as the backing (advanced).

```ts
function attachWasmShared<S extends SpecInput>(
  plan: Plan<S>,
  memory: WebAssembly.Memory,
): WasmSharedBacking;
```

---

### `buildHandoff`

Create a serializable handoff payload (main → worker).

```ts
function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: SharedBacking, // contiguous-only
): Handoff;
```

> The second parameter is **exactly** `SharedBacking` (contiguous SAB). Tests enforce this.

---

### `receiveHandoff`

Deserialize a handoff payload on the worker side.

```ts
function receiveHandoff(h: Handoff): ReceivedHandoff;
```

---

### `verifyHandoff`

Check that a received handoff matches a `Plan<S>` (hash/size).

```ts
function verifyHandoff<S extends SpecInput>(
  plan: Plan<S>,
  received: ReceivedHandoff,
): void;
```

---

## Bindings

### `bindController`

Create a controller binding (param writer + meter reader).

```ts
function bindController<S extends SpecInput>(
  spec: S,
  backing: Backing,
  options?: ControllerOptions,
): ControllerBinding<S>;
```

Controller API surface (`set | update | stage | snapshot | version`) matches source.

---

### `bindProcessor`

Create a processor binding (param reader + meter writer) using a verified handoff.

```ts
function bindProcessor<S extends SpecInput>(
  spec: S,
  received: ReceivedHandoff,
  options?: ProcessorOptions,
): ProcessorBinding<S>;
```

Processor APIs `params.within` and `meters.publish` match source.
`ProcessorOptions` exists (forward-compat diagnostics).

---

### `bindProcessorWithBacking` (advanced)

Bypass handoff verification and bind directly to a backing.

```ts
function bindProcessorWithBacking<S extends SpecInput>(
  spec: S,
  backing: Backing,
  options?: ProcessorOptions,
): ProcessorBinding<S>;
```

Use only in controlled environments (tests/same-thread). For actual cross-thread use, prefer
`buildHandoff → receiveHandoff → bindProcessor(spec, received)`.

---

## Controller Binding API

### `params`

- `set(key, value): void` – write one scalar (one PU bump)
- `update(patch): void` – atomic batch of scalars (one PU bump)
- `stage(key, cb): void` – RAII write for array params (one PU bump)
- `snapshot(opts?): object` – coherent values; arrays are **owned copies**; enum arrays are indices; enum scalars are
  labels on controller side
- `version(): number` – current PU sequence stamp (cheap atomic)

**Snapshot-into diagnostics**

If you use `snapshot({ into })` with the wrong typed array or length, errors are strongly typed:

- `binding.snapshotIntoTypeMismatch`
- `binding.snapshotIntoLengthMismatch`

### `meters`

- `snapshot(opts?): object` – coherent values; arrays are copies; bool meters are `0|1` numbers (MU32)
- `version(): number` – current MU sequence (cheap atomic)

The seqlock read/retire flow for snapshots is documented in the coherent-reads guide.

---

## Processor Binding API

### `params`

- `within(cb): T` – coherent, zero-alloc read window; arrays are ephemeral views (do not escape)

### `meters`

- `publish(cb): T` – stage writes and commit atomically (one MU bump)

The processor-side read/write algorithms and invariants are detailed in the docs; the shapes match source.

---

## Types

Key shapes in source:

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

Domains used across the library:

- `spec.*`, `plan.*`, `backing.*`, `binding.*`, `handoff.*`, `orchestration.*`, `internal.*`, `diagnostics.*`,
  `primitives.*`, `runtime.*`

Selected examples with typed payload tests:

- `handoff.specHashMismatch` (handoff verification)
- `binding.snapshotIntoTypeMismatch` / `binding.snapshotIntoLengthMismatch` (snapshot into buffers)

---
