# Primitives

Lock-free building blocks used by the planner and bindings. Allocation-free, **sequentially consistent** (via `Atomics.*`) and designed for hot paths. Surfaces are minimal and policy-light.

---

## Seqlock (dual-counter, SWMR)

Two 32-bit **counters** stored in an **`Int32Array`**:

- **LOCK** — odd while writing, even while quiescent
- **SEQ** — incremented **exactly once** per successful commit (the **one-bump** rule)

> Why `Int32Array`? JavaScript’s `Atomics.wait/notify` (where available) operate on `Int32Array`. Readers may cast the loaded `SEQ` to the unsigned domain with `>>> 0` to observe wraparound as `u32`.

### Writer protocol

1. `LOCK += 1` (enter — makes it odd)
2. Write payload (params/meters/whatever lives under this lock)
3. `LOCK += 1` (exit — makes it even)
4. `SEQ += 1` (commit fence)

### Reader protocol

1. Wait until `LOCK` is **even**
2. Capture `SEQ = load(seq)`
3. Read payload
4. Verify `LOCK` still **even** and unchanged **and** `SEQ` unchanged → coherent capture

### API

- `beginWrite(pair)` / `endWrite(pair)` — raw critical section
- `publish(pair, writer)` — RAII wrapper that guarantees **exactly one** commit bump
- `tryRead(pair, reader, opts?) → { ok, value, status }`

  - `ok: true` → coherent capture; `value` is from a stable window
  - `ok: false` → `value` is best-effort (fallback path)
  - `status: { spins: number, retries: number, fallback: boolean }`

**Defaults:** `spinBudget = 128`, `retryBudget = 3`.

### Notes & guarantees

- All `Atomics.*` ops are **SC** (sequentially consistent). The final `SEQ += 1` acts as the **commit fence**; readers pair with their final `SEQ` load.
- Payload guarded by the pair **must** be in the same agent-cluster shared memory as the counters (typically the same SAB or the same shared Wasm memory buffer region).
- Strict **SWMR**: single writer, multiple readers. (Multiple independent writers require distinct lock pairs.)

### Example

```ts
import { publish, tryRead } from './seqlock';

// Commit exactly once
publish(pair, () => {
  paramsF32[rateIdx] = nextRate;
  metersF32[peakIdx] = currentPeak;
});

// Coherent read with bounded spin/retry
const { ok, value, status } = tryRead(pair, () => ({
  rate: paramsF32[rateIdx],
  peak: metersF32[peakIdx],
}));

// ok === true → coherent; otherwise treat `value` as fallback
void status; // { spins, retries, fallback }
```

---

## Atomics (helpers)

Thin wrappers around `Atomics.*` and small utilities shared by primitives:

- Loads/stores/arithmetic: `loadU32`, `storeU32`, `addU32`, `casU32`
- Spinners: `spinWhile`, `spinUntilEven`
- Bit tests: `isEvenU32`, `isOddU32`
- Budgets/guards: `clampNonNegativeInt`
- Environment: `isSharedBuffer`

Design constraints:

- **No allocations** on hot paths
- **No hidden policy** beyond bounded spin/retry
- Compatible with Workers and Worklets (does not rely on `Atomics.wait` being present)

---

## Planes (plan & alignment)

Deterministic memory plan via canonical plane keys. **Offsets are in bytes**; **lengths are in elements**. Typed-array **element indices** must compute `index = offset / elemBytes`.

**Param planes**

- `PF32` — `Float32Array` (f32, f32.array)
- `PI32` — `Int32Array` (**enum indices**; i32, i32.array, enum(.array))
- `PB` — `Uint8Array` (**bool** and **bool.array** as 0/1 bytes)
- `PU` — `Int32Array` **[LOCK, SEQ]** (control only; no payload)

**Meter planes**

- `MF32` — `Float32Array` (f32, f32.array)
- `MF64` — `Float64Array` (f64, f64.array)
- `MU32` — `Uint32Array` (u32 counters/flags; **bool meters as 0/1**)
- `MU` — `Int32Array` **[LOCK, SEQ]** (control only; no payload)

> **No DSL leakage.** Planes contain **raw data only** (numbers/indices/0-1 flags). Enum **labels**, ranges, and other DSL metadata are **not** stored in planes. Bindings may cache label tables at bind time.

### Helpers

- `BYTES_PER_ELEM[plane]` — element width in bytes
- `roundUpTo(value, multiple)` — alignment padding
- `isPow2(n)` — alignment sanity
- `isAligned(offset, plane)` — offset validity for a plane’s element size

### Alignment rules

- Offsets must be multiples of the plane's element size (`4` for f32/i32/u32, `8` for f64, `1` for PB).
- Seqlock planes (`PU`, `MU`) reserve two `i32` per lock pair: index `0 = LOCK`, index `1 = SEQ`.
- `PB` stores **one byte per boolean** in ABI v1 (no bit-packing).

### Examples

```ts
import { BYTES_PER_ELEM, roundUpTo, isAligned } from './planes';

// Compute 8-byte padding for MF64 alignment
const off = 13;
const aligned = roundUpTo(off, BYTES_PER_ELEM.MF64); // 16

// Validate a planned offset for Float64 meters
isAligned(24, 'MF64'); // true
isAligned(28, 'MF64'); // false
```

---

## Design intent

- Minimal, **stable** surface area used by planner/allocator/bindings
- **No allocations**, no shared global state; only explicit atomic effects
- Names/semantics align with public API:

  - **One-bump** commit rule
  - **Coherent** read windows
  - **Indices, not labels** in PI32; **0/1 flags** in PB and MU32

- Plane-agnostic: contiguous and per-plane (partitioned) backings both supported by the same primitives
