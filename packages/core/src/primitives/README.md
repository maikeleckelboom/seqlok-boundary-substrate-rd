# Primitives

Lock-free building blocks used by the planner and bindings. Allocation-free, sequentially-consistent (`Atomics.*`), and
designed for hot paths.

## Seqlock (dual-counter, SWMR)

Two 32-bit counters in a shared `Uint32Array`:

* **LOCK** — odd while writing, even while quiescent
* **SEQ** — incremented exactly once per successful commit (the “one-bump” rule)

**Writer protocol**

1. `LOCK += 1` (enter) → write payload → 2) `LOCK += 1` (exit) → 3) `SEQ += 1` (commit)

**Reader protocol**

1. Wait until `LOCK` is even
2. Capture `SEQ` and `LOCK`
3. Read payload
4. Verify `LOCK` unchanged & even **and** `SEQ` unchanged → coherent

**API**

* `beginWrite(pair)` / `endWrite(pair)` — raw section management
* `publish(pair, writer)` — RAII wrapper ensuring exactly one commit bump
* `tryRead(pair, reader, opts?)` → `{ ok, value, status }`

  * `ok: true` → coherent capture
  * `ok: false` → best-effort value (fallback path)
* Defaults: `spinBudget = 128`, `retryBudget = 3`

**Notes & guarantees**

* All `Atomics.*` operations are SC; the final `SEQ += 1` forms the commit fence readers pair with.
* Payload read by `reader()` must live in the **same agent-cluster memory** as the counters (typically the same SAB).
* Strictly SWMR: single writer, multiple readers.

**Example**

```ts
import {publish, tryRead} from './seqlock';

publish(pair, () => {
  paramsF32[rateIdx] = nextRate;
  metersF32[peakIdx] = currentPeak;
});

const {ok, value, status} = tryRead(pair, () => ({
  rate: paramsF32[rateIdx],
  peak: metersF32[peakIdx],
}));

// ok === true → coherent; otherwise treat `value` as fallback
```

---

## Atomics (helpers)

Thin wrappers around `Atomics.*`, plus small utilities:

* Loads/stores/arithmetic: `loadU32`, `storeU32`, `addU32`, `casU32`
* Spinners: `spinWhile`, `spinUntilEven`
* Bit checks: `isEvenU32`, `isOddU32`
* Budgets/guards: `clampNonNegativeInt`
* Environment: `isSharedBuffer`

Designed for reuse across primitives (seqlock, future structures) without embedding policy.

---

## Planes (layout and alignment)

Deterministic memory layout via canonical plane keys:

* **Params:** `PF32` (Float32), `PI32` (Int32 / enum indices), `PB` (Uint8 bools), `PU` (u32 `[LOCK,SEQ]`)
* **Meters:** `MF32` (Float32), `MU32` (Uint32), `MF64` (Float64), `MU` (u32 `[LOCK,SEQ]`)

**Helpers**

* `BYTES_PER_ELEM[plane]` — element byte width
* `roundUpTo(value, multiple)` — alignment padding
* `isPow2(n)` — alignment sanity check
* `isAligned(offset, plane)` — offset validity for the plane’s element size

**Alignment rules**

* Offsets must be multiples of the plane's element size (`4` for f32/u32/i32, `8` for f64, `1` for PB).
* Seqlock planes (`PU`, `MU`) reserve two `u32` per lock: index `0 = LOCK`, index `1 = SEQ`.
* PB is one byte per boolean in ABI v1 (no bit-packing).

**Examples**

```ts
import {BYTES_PER_ELEM, roundUpTo, isAligned} from './planes';

// Compute 8-byte padding for MF64 element alignment
const off = 13;
const aligned = roundUpTo(off, BYTES_PER_ELEM.MF64); // 16

// Validate a planned offset for Float64 meters
isAligned(24, 'MF64'); // true
isAligned(28, 'MF64'); // false
```

---

**Design intent**

* Minimal, stable surface that other layers depend on (planner, allocator, bindings).
* No allocations, no shared state, no side effects beyond atomic ops.
* Names and semantics match the public API and docs (one-bump principle, SWMR, coherent read windows).
