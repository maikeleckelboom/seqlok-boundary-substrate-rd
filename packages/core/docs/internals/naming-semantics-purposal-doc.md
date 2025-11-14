# Seqlok v1 – API & Design Review Pack

This document is a **design brief**, not marketing copy.
Audience: people reviewing the API surface, semantics, and layering of Seqlok.

Seqlok is a **typed shared-memory wire** between a _controller side_ (usually UI / host / orchestrator) and a _processor
side_ (usually worker / AudioWorklet / DSP loop). It gives you:

- A **typed spec DSL** (`defineSpec`) to describe params (controller→processor) and meters (processor→controller).
- A **plan planner** (`planLayout`) that turns the spec into a stable memory plan.
- A **backing allocator** (`allocateShared`) that allocates SharedArrayBuffer and typed planes.
- **Bindings** (`bindController`, `bindProcessor`) that expose high-level, typesafe APIs on top of that backing.
- A **handoff protocol** (`buildHandoff` + `receiveHandoff`) for cross-thread wiring, plus spec hashing to guarantee
  plan compatibility.
- A structured **error model** with codes / metadata.

Threat model: **cooperative, same-origin JS environment**.
We are not defending against hostile JS that can already run arbitrary code in the same process.

---

## 1. Top-level mental model

### 1.1 Golden pipeline

Intended top-level flow:

```ts
import { defineSpec, param, meter } from '@seqlok/core';
import {
  planLayout,
  allocateShared,
  bindController,
  bindProcessor,
  buildHandoff,
} from '@seqlok/core/memory';
// names may be spread across modules; conceptually this is the pipeline:

// 1) Describe the schema.
export const spec = defineSpec({
  id: 'my-synth', // optional; see below
  params: {
    gain: param.f32({ min: 0, max: 1 }),
    cutoff: param.f32({ min: 20, max: 20_000 }),
    mode: param.enum(['off', 'lp', 'hp'] as const),
    curve: param.f32.array({ length: 1024 }),
  },
  meters: {
    peak: meter.f32(),
    frame: meter.f32.array({ length: 256 }),
  },
});

// 2) Plan a memory plan from the spec.
const plan = planLayout(spec);

// 3) Allocate backing memory (SharedArrayBuffer + typed views).
const backing = allocateShared(plan);

// 4) Main/UI side gets a controller binding.
export const controller = bindController(spec, backing);

// 5) Build a handoff bundle for worker/audio thread.
export const handoff = buildHandoff(plan, backing);

// --- in worker / AudioWorklet: ----------------------------------------------

import { bindProcessor, receiveHandoff } from '@seqlok/core/worker';
import { spec } from './spec';

let processor: ReturnType<typeof bindProcessor<typeof spec>> | undefined;

self.onmessage = (event) => {
  if (event.data?.type !== 'HANDOFF') return;

  const received = receiveHandoff(event.data.handoff);
  processor = bindProcessor(spec, received); // verifies handoff internally
};

// Advanced: explicit verify + escape hatch
import { bindProcessorWithBacking, verifyHandoff, planLayout } from '@seqlok/core';

const received = receiveHandoff(event.data.handoff);
const plan = planLayout(spec);
verifyHandoff(plan, received);
const processor = bindProcessorWithBacking(spec, received.backing);
```

Conceptually:

1. `defineSpec` – describe the **schema** (params + meters).
2. `planLayout` – derive a **memory plan plan** from the spec.
3. `allocateShared` – allocate the **shared backing** (SAB + typed planes).
4. `bindController` / `bindProcessor` – attach semantic roles to that backing.
5. `buildHandoff` / `receiveHandoff` – cross-thread packaging + reconstruction.

---

## 2. DSL: `defineSpec`, params, meters

### 2.1 Spec shape

Rough shape of authored spec:

```ts
type SpecInput = Readonly<{
  id?: string; // optional; if omitted we synthesize one from hash
  params?: Readonly<Record<string, ParamDef>>;
  meters?: Readonly<Record<string, MeterDef>>;
}>;
```

Parameters (controller → processor) and meters (processor → controller) are defined in terms of a small closed set of
primitives:

#### Param kinds (DSL-level)

- Scalar:

  - `f32` – numeric, with optional `{ min, max, step, origin }`
  - `i32` – numeric, same numeric constraints but integer-specific rules (step must be integer ≥ 1, etc.)
  - `bool`
  - `enum` – string enums with `values: readonly string[]` (or tuple for literal type narrowing)

- Arrays:

  - `f32.array` – length-fixed, numeric constraints shared across elements
  - `i32.array`
  - `bool.array`
  - `enum.array` – fixed length of enum slots with a single `values` set

Meters mirror that, but with a slightly different scalar set (`f32`, `f64`, `u32`, `bool`) and arrays for those.

DSL helpers (`param`, `meter`) are thin wrappers that build those definitions with correct `kind`/`shape` tags and
attach constraints.

Example:

```ts
export const spec = defineSpec({
  params: {
    gain: param.f32({ min: 0, max: 1 }),
    taps: param.i32.array({ length: 8, min: -10, max: 10 }),
    mode: param.enum(['off', 'lp', 'hp'] as const),
  },
  meters: {
    peak: meter.f32(),
    rms: meter.f32.array({ length: 2 }),
  },
});
```

### 2.2 Numeric constraints & policies

Numeric parameters carry constraints:

```ts
type NumericConstraints = Readonly<{
  min?: number;
  max?: number;
  step?: number;
  origin?: number; // for step grids
}>;
```

Controller writes are interpreted under a **policy**:

```ts
type RangePolicy = 'reject' | 'clamp';
type StepPolicy = 'reject' | 'round' | 'floor' | 'ceil';
```

The main implementation lives in a `validateAndQuantize(...)` / `makeQuantizer(...)` helper:

- Range:

  - `reject`: throw if value is outside `[min, max]`.
  - `clamp`: clamp into `[min, max]` when range is defined.

- Step:

  - `reject`: require `(value - origin) / step` to be approximately integer (epsilon-based).
  - `round` / `floor` / `ceil`: snap to step grid around `origin`, then apply range policy again.

This gives a stable, predictable mapping from JS numbers into backing.

### 2.3 Spec validation

`defineSpec(spec, { validate })` runs a set of structural and semantic checks:

- `id`:

  - If provided: must be non-empty string.
  - If omitted: allowed, but `planLayout` will synthesize an id from hash (see below).

- Must define at least one param _or_ one meter.

- Disallow same key under both `params` and `meters`.

- For param/meter defs:

  - Ensure `shape` (`scalar`/`array`) and `kind` are in the supported set.
  - Numeric options (`min`, `max`, `step`, `origin`) must be finite, consistent (`min <= max`), step > 0 etc.
  - `i32` constraints: integer-only step/origin where applicable.
  - Array `length` must be a positive finite integer, ≤ a library-wide `MAX_ARRAY_LENGTH`.

If validation fails, a structured `SeqlokError` is thrown with an error code like `spec.invalid`, `spec.builderInvalid`,
`spec.rangeInvalid`, etc., plus `details` like `key`, `received`, `expected`, `where`, `reason`.

---

## 3. Planning: `planLayout(spec)`

### 3.1 What `Plan<S>` contains

`planLayout` converts a `SpecInput` into a `Plan<S>` that is fully concrete and plan-facing.

High-level structure:

```ts
interface Plan<S extends SpecInput> {
  /** Authored or synthesized id. Always non-empty. */
  readonly id: string;

  /** Canonical hash of the authored spec (see below). */
  readonly hash: SpecHash;

  /** Total backing size (bytes) across planes + seqlock pads. */
  readonly bytesTotal: number;

  /** Per-plane byte lengths. */
  readonly planes: PlaneByteLengths; // PF32, PI32, PB, PU, MF32, MF64, MU32, MU

  /** Seqlock stride (padding) used for PU/MU planes. */
  readonly lockStrideBytes: LockStrideBytes;

  /** Per-entry slots keyed by param/meter names. */
  readonly params: Readonly<Record<ParamKey<S>, EntrySlot>>;
  readonly meters: Readonly<Record<MeterKey<S>, EntrySlot>>;

  /** Seqlock indices / initial state (PU/MU sequencing). */
  readonly locks: {
    PU: { lock: number; seq: number };
    MU: { lock: number; seq: number };
  };
}
```

Planes roughly:

- Params:

  - `PF32` – Float32 (f32 params / arrays)
  - `PI32` – Int32 (i32 + enum indices)
  - `PB` – Uint8 (bool params)

- Meters:

  - `MF32` – Float32
  - `MF64` – Float64
  - `MU32` – Uint32 (u32 + bool meters)

- Seqlocks:

  - `PU` – param seqlock bytes (Uint32-based seqlock + padding)
  - `MU` – meter seqlock bytes

Each `EntrySlot` has `{ plane, offset, length, elemBytes }` — byte-based offset inside the plane and length in elements.

### 3.2 Alignment & seqlock stride

`planLayout` reserves a configurable `lockStrideBytes` for PU/MU (default 128):

- Provides coarse isolation between seqlock words and surrounding data.
- Intended to work both on 64B and 128B cache-line machines with low false sharing risk.

The planning logic:

- Packs per-plane bytes for params, then pads to `lockStrideBytes` and adds PU.
- Packs per-plane bytes for meters, then pads and adds MU.
- Aggregates into `PlaneByteLengths` and `bytesTotal`.

### 3.3 Soft limits & overflow safety

There are **two levels of array/size safety**:

1. **Per-field guard** – `MAX_ARRAY_LENGTH`:

- Each `param.*.array({ length })` must be a finite positive integer ≤ `MAX_ARRAY_LENGTH`.
- Violations throw `spec.builderInvalid` / `spec.rangeInvalid` with detail like `key`, `received`, `max`,
  `where: 'plan.planLayout'`, `reason`.

2. **Global soft limit** – total planned bytes:

   ```ts
   const PLAN_SOFT_LIMIT_BYTES = 0x7fff_ffff; // ~2GB - 1

   if (bytesTotal > PLAN_SOFT_LIMIT_BYTES) {
     throw createError('plan.overflowRisk', 'Planned memory exceeds soft limit', {
       detail: 'plan.size',
       estimatedBytes: bytesTotal,
       softLimitBytes: PLAN_SOFT_LIMIT_BYTES,
     });
   }
   ```

This is intended as a **safety rail** in a browser environment where backing >2GB is unrealistic. In the future this
could be:

- Tunable via `PlanOptions` or an environment-level policy.
- Tightened or relaxed per-host.

### 3.4 Spec hashing & synthesized ids

`hashSpec(spec)`:

- Builds a **canonical JSON representation** of the spec:

  - Keys sorted within `params` and `meters`.
  - Param defs reduced to canonical shape:

    - Numeric scalars: include only `kind` and present `min`/`max`.
    - Arrays: encode `{ kind, length }` and for enums also `values` in order.

  - Meters likewise.
  - Include explicit `id` if provided; omit or null if not.

- Feed canonical JSON into a 64-bit FNV-1a hasher.

- Emit base-36 string as `SpecHash`.

This hash is used to:

- Detect plan compatibility between main/worker.
- Generate a default id when `spec.id` is omitted:

  ```ts
  const id = inputSpec.id ?? `anon:${hash.slice(0, 8)}`;
  ```

So:

- **User-provided id**: stable, human-readable, recommended.
- **Omitted id**: supported; library ensures `Plan.id` is always non-empty via hash-derived id.

---

## 4. Backing allocation: `allocateShared(plan)`

This piece:

- Takes a `Plan<S>`.
- Allocates one or more `SharedArrayBuffer`s and typed views to match the per-plane byte lengths.
- Returns a `Backing` (or `Views`) object that bindings can consume.

Rough shape:

```ts
interface Backing {
  readonly planes: {
    PF32?: Float32Array;
    PI32?: Int32Array;
    PB?: Uint8Array;

    PU: Uint32Array;

    MF32?: Float32Array;
    MF64?: Float64Array;
    MU32?: Uint32Array;

    MU: Uint32Array;
  };
  readonly sabList: SharedArrayBuffer[]; // for handoff
}
```

Naming decision: the public API uses **`allocateShared`** (not `allocateMemory`) to stress that:

- It is specifically allocating **shared** memory (SAB).
- It leaves room for a future `allocateLocal(plan)` that allocates `ArrayBuffer`-backed local views for SSR or
  off-main-thread simulation.

Constraint: we respect the plan’s per-plane byte lengths and do not exceed the total, aside from standard typed-array
alignment.

---

## 5. Bindings: controller vs processor

Two symmetric binding types:

- `bindController(spec, backing)` → `ControllerBinding<S>`
- `bindProcessor(spec, backing)` → `ProcessorBinding<S>`

We track roles with a per-backing registry:

```ts
type BindRole = 'controller' | 'processor';
type BindSlots = { controller?: true; processor?: true };

const __BOUND = new WeakMap<Backing, BindSlots>();

// Called by bindController/bindProcessor:
noteBinding(backing, 'controller'); // bookkeeping
claimBinding(backing, 'controller'); // throw on double-bind if enabled
releaseBinding(backing, 'controller'); // on dispose
```

With `forbidDoubleBind?: boolean` options to cause explicit errors if someone tries to bind a second controller or
processor to the same backing.

### 5.1 ControllerBinding API

On the main/UI side:

#### Params: writing

We intentionally avoid a "mini state library" and keep the API narrow:

```ts
type ControllerBinding<S extends SpecInput> = {
  readonly params: {
    /** Atomic multi-param update (one seqlock commit). */
    update(patch: Partial<ParamShape<S>>): void;

    /** Possibly also current() or snapshot(): ParamShape<S> for convenience. */
    snapshot(): ParamShape<S>; // design still being refined
  };

  readonly meters: {
    /** Coherent snapshot of meters. */
    snapshot(): MeterShape<S>;
  };

  dispose(): void;
};
```

Key points:

- **Single entry point** for writes: `params.update(patch)`:

  - Patch object may be partial: `{ gain: 0.5, cutoff: 2000 }`.
  - Write path validates/coerces values:

    - `f32`/`i32` scalars: numeric validation + range + step.
    - enums: value → index mapping, rejects unknown values.
    - bools: coerced to 0/1 with clear error on invalid.
    - arrays: either stage & copy or alias view depending on design (see open questions).

- Range & step policy are configured on the controller side (e.g. `rangePolicy: 'reject' | 'clamp'`,
  `stepPolicy: 'reject' | 'round' | ...`).

- The commit is **atomic** per `update()` call via the param seqlock plane (PU).

#### Meters: reading

- `meters.snapshot()` returns a fully materialized `MeterShape<S>` (scalars as numbers, arrays as typed views or
  copies).
- Reads are wrapped in a seqlock read on MU so the snapshot is either fully "before" or fully "after" any meter publish.

We intentionally do **not** expose reactive hooks (`subscribe`) in the core; those are meant to be built in userland or
framework adapters.

### 5.2 ProcessorBinding API

On the worker / audio / DSP side:

```ts
type ProcessorBinding<S extends SpecInput> = {
  readonly params: {
    /**
     * Coherent read of params; `readers` contains scalar accessors and/or array views.
     * Protected by param seqlock.
     */
    within<T>(fn: (r: ParamReaders<ParamShape<S>>) => T): T;

    /** Read the current seqlock sequence, for advanced users. */
    luSeq(): number;
  };

  readonly meters: {
    /**
     * Stage meter writes in a local struct and atomically commit to backing.
     */
    publish<T>(fn: (w: MeterWriters<MeterShape<S>>) => T): T;
  };

  dispose(): void;
};
```

#### `params.within(fn)`

At bind time we precompute **hot-path readers** for every param:

- For scalar f32/i32:

  - `() => L[idx]` / `() => I[idx]`, optionally clamped/validated only on write side.

- For scalar enums:

  - `() => enumValues[I[idx]] ?? undefined` (corruption-resilient).

- For arrays:

  - `Float32Array` / `Int32Array` / `Uint8Array` views into the correct slice.

`within(fn)`:

- Wraps `fn(readers)` inside a seqlock read on PU.
- Guarantees the function sees a **coherent snapshot** of params.

The idea is: the processor side is _read-heavy_; we want zero allocations and the cheapest consistent view possible.

#### `meters.publish(fn)`

For meters, we invert the pattern:

- At bind time:

  - Precompute scalar meter indices (dense arrays pointing into backing).
  - Allocate scalar staging arrays (`stageScalarMF32`, etc.) and `dirty` flag arrays.
  - Precompute array meter staging views (`new Float32Array(len)` etc.) with their offsets.

- At publish time:

  ```ts
  processor.meters.publish((w) => {
    w.peak(0.8);
    const frame = w.frame;
    frame[0] = 0;
    frame[1] = 0;
  });
  ```

  Implementation:

  - User writes into staging arrays (`stageScalar*` + array stages).
  - We set dirty flags for scalars.
  - Under `beginWrite(MU, METER_LOCK_INDEX)`:

    - Apply only dirty scalars to `MF32` / `MU32` / `MF64`.
    - Copy staged arrays into backing via `.set`.

  - Clear dirty flags, `endWrite(MU, METER_LOCK_INDEX)`.

So:

- One `publish` call → one atomic, coherent meter update from controller's point of view.
- No allocations on the hot path after binding.

---

## 6. Handoff & verification

We have a protocol for cross-thread handoff based on **plane metadata + SAB list**, plus plan/version metadata.

### 6.1 Handoff message

Shape (simplified):

```ts
interface HandoffEntry {
  key: PlaneKey; // e.g. 'PF32'
  byteOffset: number; // TypedArray.byteOffset
  length: number; // element count
  sabIndex: number; // index into sabList
}

interface HandoffMessage {
  version: 'seqlok-handoff-v1';
  sabList: SharedArrayBuffer[];
  entries: HandoffEntry[];

  // Optional: plan metadata (for verification / tooling).
  layoutVersion?: number;
  layoutHash?: string; // stable hash of plan/plan, separate from spec hash
}
```

`buildHandoff(plan, backing)`:

- Captures `sabList` and per-plane `byteOffset` / `length`.
- Optionally embeds plan metadata from `plan`.

On the worker side, `receiveHandoff(...)`:

- Validates structure.
- Reconstructs typed views from SABs and entries.
- Returns a `Backing`/`Views` object suitable for `bindProcessor`.

### 6.2 Spec & plan verification

We rely on a **spec hash** + plan metadata to ensure the worker is interpreting the same plan as the main thread.

Design intent:

- `planLayout` is deterministic given a spec + options.
- `Plan.hash` is `hashSpec(spec)`.
- Handoff includes either:

  - Spec hash that backing was planned against, or
  - Layout hash + version that can be matched against the worker's own `planLayout(spec)`.

Verification patterns:

1. **Explicit verify before binding**:

   ```ts
   const received = receiveHandoff(msg.handoff);
   verifyHandoff(spec, received); // throws if mismatch
   const processor = bindProcessor(spec, received.backing);
   ```

2. **Auto-verify inside `bindProcessor`**:

   ```ts
   export function bindProcessor<S extends SpecInput>(
     spec: S,
     handoff: Handoff,
   ): ProcessorBinding<S> {
     const verification = verifyHandoff(spec, handoff);
     if (!verification.valid) {
       throw createError('binding.handoffMismatch', 'Layout mismatch ...', {
         /* diff info */
       });
     }
     return createProcessorBinding(spec, handoff.backing);
   }
   ```

The safety story:

- **JS runtime** gives typed array bound safety: you cannot overflow SAB memory from JS.
- **Seqlok** adds spec/plan compatibility safety:

  - Mismatched spec → handoff mismatch → binding fails fast.
  - No "struct reinterpretation" bug where worker thinks `[f64, i32]` while main thinks `[f32, f32, i32]`.

Threat model: same-origin, same-bundle cooperative environment. If an attacker can craft arbitrary SAB + handoff objects
in your process, they already own the process.

---

## 7. Error model

Seqlok uses a structured error type:

```ts
class SeqlokError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;
  readonly meta: ErrorMeta; // severity, scope, safeToExpose, etc.
}
```

- Errors are declared in **registries** per layer:

  - DSL: `spec.invalid`, `spec.builderInvalid`, `spec.rangeInvalid`, `spec.duplicateKey`, etc.
  - Layout: `plan.failed`, `plan.overflowRisk`, `plan.planFailed`.
  - Plan/planes: e.g. `plane.wrongSize`, `plane.tooSmall`.
  - Bindings: `binding.doubleBind`, `binding.handoffMismatch`.
  - Runtime params/meters: `params.invalidValue`, etc.

- Each entry has:

  - `code`: machine-readable string.
  - `message`: human-facing summary.
  - `meta`: { severity, recoverable, safeToExpose }.
  - `details` at throw site: where (`plan.planSpec`, `bindings.controller`, …), reason, key, expected, received, etc.

The goal is:

- Keep all errors tagged by **scope** (dsl/plan/bindings/params/meters/handshake).
- Make errors loggable + diagnosable without exposing secrets or raw memory.

---

## 8. Design history / things intentionally _not_ in core

We had earlier incarnations of Seqlok that looked more like a **state management library** plus a memory wire. That
included:

- `bindHost` / `bindThread` instead of `bindController` / `bindProcessor`.

- Rich host API:

  ```ts
  host.params.set('gain', 0.5);
  host.params.setMany({ gain: 0.5, cutoff: 2000 });

  host.params.transaction((draft) => {
    draft.gain = 0.5;
    draft.cutoff = 2000;
  });

  host.params.subscribe('gain', (value) => {});
  ```

- Helpers like:

  - `setSpan` for array param slices.
  - Implicit microtask batching for subscriber notifications.
  - Exposed plan strategies (contiguous/split/offset) as userland configuration.

We deliberately **removed** all of this from the core:

- Reactivity (`subscribe`) is a framework concern; we don’t want a “mini store” inside the ABI layer.
- `transaction` semantics tend to grow (nesting, rollback, etc.) and are better built in app code using `params.update`
  as the commit primitive.
- Exposing plan strategies made the API more complex without strong real-world benefit; we prefer a single canonical
  planner.

Instead, the current design aims to be:

> “A boring, predictable **wire** you can build your own abstractions on top of."

---

## 9. Open questions / areas we want scrutiny on

These are the spots where feedback from other LLMs / reviewers is most welcome.

### 9.1 Param update ergonomics (arrays, replace vs mutate)

Currently:

- Controller writes typed payloads:

  ```ts
  controller.params.update({
    curve: someFloat32Array,
    leds: new Uint8Array([255, 255, 255]),
  });
  ```

Questions:

- **Should we allow plain JS arrays** as sugar?

  ```ts
  controller.params.update({
    curve: [
      /* numbers */
    ], // number[]
    leds: [255, 255, 255], // number[]
  });
  ```

  Tradeoffs:

  - ✅ Ergonomic for simple cases, easy to JSON-ify.
  - ❌ Requires per-call allocation + conversion to typed arrays; can be slow in hot paths.
  - ❌ Might mask performance issues in real-time workloads.

We are inclined to:

- Prefer typed arrays (`Float32Array`, `Int32Array`, `Uint8Array`) as the _primary_ ergonomics.
- Possibly allow plain arrays only in "slow path" or dev mode, with a clear documented cost.

We'd like a critical evaluation of:

- API shapes that make this obvious without overloading the core.
- Whether to have explicit "replace array" vs "mutate in place" semantics, or keep it simple.

### 9.2 Where to enforce spec/plan verification

Two options:

1. **Explicit `verifyHandoff`** – user must call it before `bindProcessor`.
2. **Implicit inside `bindProcessor`** – `bindProcessor` refuses to bind if hashes/plan don't match.

We're leaning toward:

- `bindProcessor` **must** verify by default (no "forget to verify" footgun).
- `verifyHandoff` could be an advanced API returning rich diffs for diagnostics / tooling.

We'd like feedback on:

- API shapes that make this hard to misuse but still debuggable.
- How to encode this at the type level (e.g. a `VerifiedHandoff` phantom type) without turning everything into generic
  soup.

### 9.3 Layout hash vs spec hash

Right now:

- We compute a `SpecHash`.
- Layout is derived deterministically from spec.

There is an argument to:

- Also compute a `LayoutHash` based on `Plan<S>` (plane sizes, offsets, lockStrideBytes, etc.).

Questions:

- Is it worth having **both** `specHash` and `layoutHash`?
- Should handoff carry layoutHash exclusively, or both?
- How should we evolve `layoutVersion` / hash if the planner’s algorithm changes but we still want to detect ABI breaks
  cleanly?

### 9.4 Plan sizing / soft limits

We currently have a hard-coded:

- Per-array `MAX_ARRAY_LENGTH` (e.g. 1e6).
- Per-plan `PLAN_SOFT_LIMIT_BYTES` (~2GB, reflecting browser realities).

We'd like critique on:

- Whether these should be:

  - Hard-coded,
  - Configurable per-plan via `PlanOptions`,
  - Or controlled by a global policy / environment injection.

- Reasonable default values for browser vs Node / server contexts.

### 9.5 Dev-only paranoid checks

We're considering **development-only features** such as:

- A `bindParanoidProcessor(spec, handoff)` that:

  - Re-runs `planLayout(spec)` on worker side.
  - Deep-compares layouts with handoff plan (offsets, lengths, plane shapes).
  - Logs/renders a structural diff when mismatches occur.

- Dev-only runtime checks on binding:

  - Assert array lengths match exactly.
  - Assert enum index ranges.
  - Potentially catch "user mutated spec at runtime" scenarios.

We'd like input on:

- Where to draw the line between helpful dev diagnostics and unnecessary complexity.
- Whether such checks should be part of the main package or an explicit "debug" sub-module.

### 9.6 Error taxonomy & DX

We have a structured error registry, but it's easy to overcomplicate:

- How granular should codes be?
  (e.g. `spec.invalid` vs `spec.invalidRange` vs `spec.invalidStep` vs `spec.invalidEnumValue`.)
- How much detail belongs in `details` vs the main message?
- Are there better patterns for exposing `safeToExpose` hints to consumers (so they can safely show messages in UIs)?

We want feedback on:

- A clean error taxonomy that's stable but not overly fine-grained.
- Strategies for keeping error codes future-proof while allowing new details.

---

## 10. What we consider "frozen" vs revisitable

**Mostly frozen for v1:**

- Overall pipeline: `defineSpec` → `planLayout` → `allocateShared` → `bindController`/`bindProcessor` → `buildHandoff`.
- The **Controller vs Processor** role split.
- Basic DSL kinds: `f32`, `i32`, `bool`, `enum`, `*.array`.
- “Single atomic commit per `update()`/`publish()`” semantics.
- Cooperative threat model; no adversarial JS defenses beyond plan compatibility.

**Revisitable:**

- Exact method naming within bindings (`update` vs `set`, `snapshot` / `within` ergonomics).
- Array write ergonomics (typed vs plain arrays; copy vs view semantics).
- Exposure shape of `verifyHandoff` / `bindProcessor` interplay.
- Plan options (soft limits, lockStrideBytes configurability).
- Debug/dev-only helpers and whether they belong in the core package or a "debug" addon.

---

End of pack.
