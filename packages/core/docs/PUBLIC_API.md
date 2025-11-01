# Public API (vNext, Final) — Textual Reference

This document is the **source of truth** for the Seqlok core surface. It describes roles, guarantees, and behavior in plain language. Small snippets illustrate usage; full types and examples live elsewhere.

---

## Roles & Domains

- **PU (Params domain)** — Single writer: **Controller** (Owner/Main). Readers: **Processor** (RT/Worker/Worklet) via `params.within(...)`.
- **MU (Meters domain)** — Single writer: **Processor**. Readers: **Controller** via `meters.snapshot(...)` or `meters.snapshotWithStatus(...)`.

Cross-domain coherence is **not** implied. Correlate with stamps if needed (e.g., frame indices, epochs).

---

## Global Guarantees

- **One-bump semantics**

  - `params.update({ ... })` → **one PU bump** total.
  - `params.stage('key', cb(view))` → **one PU bump** when the callback returns.
  - `meters.publish(cb)` → **one MU bump** when the callback returns.

- **Coherent reads**

  - Processor coherence for params is guaranteed **only** within `params.within(cb)`.
  - Controller coherence for meters is guaranteed by `snapshot(...)` / `snapshotWithStatus(...)`.

- **No public knobs**

  - Spin/retry budgets are internal and adaptive. Not tunable.

- **Contention never throws**

  - Readers do not throw for contention. Diagnostics are exposed through `snapshotWithStatus(...)`.

- **Zero `any` in public surface**

  - The API and examples rely on precise types.

---

## Controller — Snapshots (values only)

### Full snapshot

- **Meters:** `meters.snapshot()` returns an immutable object of **all** meters.
- **Params:** `params.snapshot()` returns an immutable object of **all** params.

### Subset snapshot with optional zero-alloc

- **Meters:** `meters.snapshot({ keys, into? })`
- **Params:** `params.snapshot({ keys, into? })`

**Rules**

- `keys` is the exact set of names to read; the result is an immutable **object** with those named properties.
- Scalar keys return **numbers**.
- Array keys return **typed arrays**.
- If an array key is present in `into`, **that exact buffer is filled in place** and returned **by identity**.
- If an array key is **not** present in `into`, a **fresh typed array** is returned for that key.

**Guarantees**

- **Identity:** for array keys in `into`, `result[key] === into[key]`.
- **Partial zero-alloc:** `into` may list a subset of array keys; omitted arrays allocate fresh.
- **Validation:** wrong typed array class → `*.intoTypeMismatch`; wrong length → `*.intoLengthMismatch`. Compile-time and dev-time checks apply.

**Example (subset + zero-alloc)**

```ts
const buf = new Float32Array(512);
const { spectrum, peak } = ctl.meters.snapshot({
  keys: ['spectrum', 'peak'],
  into: { spectrum: buf },
}); // spectrum === buf
```

---

## Controller — Diagnostics (values + status)

Use **separate methods** for diagnostics:

- **Meters:** `meters.snapshotWithStatus()` or `meters.snapshotWithStatus({ keys, into? })`
- **Params:** `params.snapshotWithStatus()` or `params.snapshotWithStatus({ keys, into? })`

**Return shape**

- Always a **2-element tuple**: `[values, status]`.
- `values` follows the same rules as `snapshot(...)`.
- `status` contains:

  - `ok: boolean` — `true` if a fresh coherent epoch was captured; `false` if a prior coherent epoch was returned by fallback.
  - `spins: number` — fast-path spin attempts on the successful read.
  - `retries: number` — total read restarts before success (includes fallback tries).

**Example (diagnostic pair)**

```ts
const [vals, st] = ctl.meters.snapshotWithStatus({ keys: ['rms'] });
// st.spins, st.retries, st.ok
```

No boolean flags like `withStatus` exist. Values-only and diagnostics are **different entry points**.

---

## Controller — Param writes

- **Atomic multi-scalar write:** `params.update({ ... })` performs an **all-or-nothing** write with **one PU bump**.
- **Array write (RAII):** `params.stage('key', cb(view))` exposes a temporary mutable view you fill in place; commits with **one PU bump** when the callback returns.
- There is **no** public `commit()`; atomicity is defined by each call (`update` or `stage`).

**Example**

```ts
ctl.params.update({ gain: 0.8, mode: 'normal' }); // one PU bump
ctl.params.stage('coeffs', (dst) => {
  dst.set(newCoeffs);
}); // one PU bump
```

---

## Processor — Param reads (coherent window)

- `params.within(cb)` invokes `cb` with a **coherent** view for the duration of the callback.
- Scalars are read by **property** (e.g., `v.rate`).
- Arrays provide **scratch views** valid **only** inside the callback; copy if needed later.

**Example**

```ts
proc.params.within((v) => {
  const rate = v.rate; // scalar, captured by value
  const bands = v.bands; // array view, ephemeral
  // compute…
}); // bands becomes invalid here
```

---

## Processor — Meter writes (one MU bump)

- `meters.publish(cb)` opens a write window. All writes inside are batched into **one MU bump** after the callback returns.
- **Scalars:** call the meter as a function with the number to write (e.g., `w.peak(0.72)`).
- **Arrays:** use **`w.stage('key', cb(dst))`**; fill the provided typed view in place. The view is valid **only** during the staging callback.

**Example**

```ts
proc.meters.publish((w) => {
  w.peak(peak);
  w.rms(rms);
  w.stage('spectrum', (dst) => dst.set(scratch));
}); // exactly one MU bump
```

**Do / Don’t**

- ✅ Stage arrays via `w.stage('key', cb(dst))`.
- ✅ Mix many scalars and arrays; still one bump.
- ❌ Do not use writable properties or function-setter forms for arrays.
- ❌ Do not let the writer or staged `dst` escape.

---

## Error taxonomy (selected)

Errors represent programming/setup faults, not contention.

- Unknown meter key → `meters.unknownKey`
- Unknown param key → `params.unknownKey`
- Param value outside range (reject policy) → `params.outOfRange`
- `into` wrong typed array class → `params.intoTypeMismatch` / `meters.intoTypeMismatch`
- `into` wrong length → `params.intoLengthMismatch` / `meters.intoLengthMismatch`
- Handoff spec mismatch (hash/version) → `handoff.hashMismatch` / `handoff.versionMismatch`
- Missing SAB/COOP/COEP support → `env.unsupported`
- WASM memory not shared → `backing.wasmNotShared`
- Binding lifecycle conflicts → `bind.roleTaken` / `bind.alreadyBound` / `bind.disposed`

The registry enumerates the full set; messages must be actionable.

---

## Non-Goals & Policy

- No positional tuple API for values. Values are **named objects**. Diagnostics use tuple return `[values, status]`.
- No public seqlock tuning. Internal budgets may evolve; behavior and guarantees do not.
- Readers never throw on contention. Use diagnostics for visibility.

---

## Common Pitfalls (and the correct move)

- **“Where is `commit()`?”**
  Atomicity is the call boundary: `params.update` and `params.stage` each define one PU bump. No separate commit.

- **“Can I write arrays via `writer.spectrum.set(...)`?”**
  No. Arrays are staged via `writer.stage('spectrum', cb(dst))` inside `meters.publish`.

- **“Why no `withStatus: true` flag?”**
  Flags create conditional return types and ambiguous call sites. Diagnostics use separate methods.

- **“Why both `keys` and `into`?”**
  `keys` defines **what** you read. `into` defines **where** large arrays should land to avoid allocation. Identity is guaranteed only for arrays present in `into`.

- **“Do snapshots mutate my buffers?”**
  Only buffers passed in `into` are filled; returned objects are otherwise immutable.

---

## Minimal Quickstart

1. **Controller (Owner/Main)**

```ts
// Allocate once, reuse
const spectrumBuf = new Float32Array(512);

// Hot path read
const { spectrum, peak } = ctl.meters.snapshot({
  keys: ['spectrum', 'peak'],
  into: { spectrum: spectrumBuf },
});
```

2. **Processor (RT/Worker/Worklet)**

```ts
proc.params.within((v) => {
  // compute…
  proc.meters.publish((w) => {
    w.peak(peak);
    w.stage('spectrum', (dst) => dst.set(scratch));
  });
});
```

---

## Glossary

- **keys** — exact list of param/meter names to snapshot; inference preserves literal names.
- **into** — mapping from **array** keys to caller-owned typed arrays to receive zero-alloc fills.
- **values** — named object of numbers and typed arrays.
- **status** — read telemetry available only via `snapshotWithStatus`.

---

This reference is **normative** for naming, shapes, and behavior. All code and docs must remain consistent with it.
