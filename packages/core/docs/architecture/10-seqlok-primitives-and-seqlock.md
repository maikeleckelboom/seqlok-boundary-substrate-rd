# Seqlok primitives and seqlock

This document describes the **lowest-level building blocks** that everything else in Seqlok stands on:

- **Seqlock** (dual-counter, SWMR)
- **Atomics helpers** (small wrappers with structured errors)
- **Plane vocabulary** (identifiers, element sizes, packing order, alignment helpers)

These are used across the internal pipeline:

```text
Spec → Plan → Backing → Views → Bindings
```

The intent is boring and deterministic: predictable memory layout, predictable alignment, predictable concurrency.

---

## 0) Where these primitives live

Seqlok’s “primitive vocabulary” spans two places:

### `@seqlok/primitives`

ABI-level plane definitions shared across plan/backing/binding:

- `PlaneKey`
- `PLANE_PACK_ORDER` (canonical contiguous packing order)
- `BYTES_PER_ELEM` (bytes-per-element and natural alignment)
- `roundUpTo` (alignment helper)
- runtime guards (`isPlaneKey`, `assertPlaneKey`)

### `@seqlok/core` (internal primitives)

Concurrency kernel used by bindings:

- seqlock (`SeqPair`, `publish`, `tryRead`, etc.)
- atomics wrappers (`loadU32`, `addU32`, `spinUntilEven`, etc.)

Key rule: **`@seqlok/primitives` is policy-light.** It defines a stable vocabulary.
Policy like “which user DSL kind maps to which plane” lives in `core/spec/*`.

---

## 1) Seqlock (dual-counter, SWMR)

Each domain (params / meters) uses a **two-word seqlock** stored in shared `Uint32Array` memory:

- `LOCK` — odd while writer is active, even while quiescent
- `SEQ` — monotonic commit counter (incremented **exactly once per successful commit**)

The kernel represents a lock pair as:

```ts
export interface SeqPair {
  readonly u32: Uint32Array;
  readonly lockIndex: number; // LOCK word
  readonly seqIndex: number; // SEQ word
}
```

SWMR constraint:

- Exactly **one writer** per domain
- Many readers allowed

---

### 1.1 Reference loop (what this abstracts)

Minimal two-word seqlock (ignoring budgets/errors/ergonomics):

```ts
const LOCK_INDEX = 0;
const SEQ_INDEX = 1;

function beginWrite(u32: Uint32Array): void {
  // even → odd
  Atomics.add(u32, LOCK_INDEX, 1);
}

function endWrite(u32: Uint32Array): void {
  // commit stamp
  Atomics.add(u32, SEQ_INDEX, 1);
  // odd → even
  Atomics.add(u32, LOCK_INDEX, 1);
}

function writePayload(u32: Uint32Array, apply: () => void): void {
  beginWrite(u32);
  try {
    apply();
  } finally {
    endWrite(u32);
  }
}

function readCoherent<T>(u32: Uint32Array, readPayload: () => T): T {
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const lockBefore = Atomics.load(u32, LOCK_INDEX);
    if ((lockBefore & 1) !== 0) continue;

    const seq0 = Atomics.load(u32, SEQ_INDEX);
    const snapshot = readPayload();
    const seq1 = Atomics.load(u32, SEQ_INDEX);
    const lockAfter = Atomics.load(u32, LOCK_INDEX);

    if ((lockBefore & 1) === 0 && (lockAfter & 1) === 0 && seq0 === seq1) {
      return snapshot;
    }
  }
}
```

Bindings don’t expose this raw loop; they call the kernel helpers that add:
bounded spin/retry budgets + structured error reporting.

---

### 1.2 Constructing a pair: `createSeqPair`

```ts
const pair = createSeqPair(u32Plane, lockIndex, seqIndex);
```

Guarantees:

- Validates indices are in bounds
- Throws structured internal errors on invalid construction
- This is the only supported way to create a `SeqPair`

---

### 1.3 Writer protocol: `publish`

Writer flow:

1. Enter (LOCK odd)
2. Write payload
3. Commit (SEQ bump)
4. Exit (LOCK even)

Kernel helpers conceptually look like:

```ts
declare function beginWrite(p: SeqPair): void;

declare function endWrite(p: SeqPair): void;

declare function publish<T>(p: SeqPair, fn: () => T): T;
```

`publish` guarantees:

- Exactly one SEQ bump per successful commit
- If `fn` throws:

  - LOCK returns to even
  - SEQ is not incremented (no ghost commit)

---

### 1.4 Reader protocol: `tryRead`

Readers try to obtain a coherent snapshot under bounded budgets:

- spin until LOCK is even (bounded)
- sample SEQ, copy payload, verify SEQ stable and LOCK still even (bounded retries)

The kernel returns a structured status describing contention, and throws a structured timeout
if budgets are exhausted without a coherent sample.

Bindings interpret these outcomes inside APIs like:

- `processor.params.within(...)`
- `controller.meters.snapshot(...)`

---

## 2) Atomics helpers

All direct `Atomics.*` calls used by seqlock are centralized in thin wrappers.

Typical helpers:

```ts
declare function loadU32(plane: Uint32Array, index: number): number;

declare function addU32(
  plane: Uint32Array,
  index: number,
  delta: number,
): number;

declare function spinUntilEven(
  plane: Uint32Array,
  index: number,
  spinBudget: number,
): { value: number; spins: number } | undefined;
```

Why wrappers exist:

- Normalize platform / misuse failures into structured errors
- Keep the seqlock code readable and audit-friendly
- Provide a single place to attach diagnostics/telemetry later

---

## 3) Planes (memory layout primitives)

A **plane** is an ABI-level bucket of storage with a TypedArray representation.
Planes are shared vocabulary across plan/backing/binding.

Planes are defined in `@seqlok/primitives`:

- `PlaneKey`
- `BYTES_PER_ELEM`
- `PLANE_PACK_ORDER`
- `roundUpTo`

### 3.1 Plane keys (current ABI)

Current plane set:

- `PF32` Float32 param payload

- `PI32` Int32 param payload (including enum indices)

- `PB` Uint8 param payload (booleans as 0/1)

- `PU` Uint32 param seqlock control

- `MF32` Float32 meter payload

- `MF64` Float64 meter payload

- `MU32` Uint32 meter payload

- `MU` Uint32 meter seqlock control

Conventions (current policy in `core/spec/*`):

- Bool params → `PB` (0/1 bytes)
- Bool meters → `MU32` (0/1 u32)
- `PU` and `MU` are control planes holding seqlock words

### 3.2 Bytes-per-element and alignment

`BYTES_PER_ELEM[plane]` is both:

- bytes per element of the TypedArray representation
- the natural alignment requirement for that plane’s base offset

This constant is used by:

- planner: to compute deterministic offsets and per-plane byte lengths
- backing: to map byte offsets to TypedArray indices
- tests: to assert contiguity + alignment invariants

### 3.3 Packing order

Contiguous and wasm-shared layouts use the canonical pack order:

- `PLANE_PACK_ORDER` (from `@seqlok/primitives`)

Backing code uses it to compute per-plane base offsets deterministically.

Changing pack order is an ABI/layout change; do it deliberately with corresponding
planner/backing updates and test changes.

---

## 4) Design intent

This layer must remain “2 AM pencil-proof”:

- deterministic memory layout
- allocation-free hot paths
- SWMR concurrency with explicit budgets and loud failures
- minimal policy in primitives; policy belongs in spec and bindings
