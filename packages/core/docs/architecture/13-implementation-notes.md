# 13 – Implementation Notes (Kernel)

Internal details for contributors and advanced users. This document explains _how_ the kernel achieves its guarantees without imposing runtime overhead on hot paths.

---

## 1. Design principles

**Boring wire, not a framework.** The core provides: planning, allocation, typed bindings, and synchronization. It intentionally avoids reactivity, change‑tracking, schema migration, or persistence so different apps can layer their own orchestration.

**Fail‑fast over fail‑safe.** When invariants are broken (mismatched layouts, wrong handoff, out‑of‑bounds access), the library throws a typed `SeqlokError`. Silent recovery risks corruption and heisenbugs.

**Zero‑allocation hot paths.** After bind, `processor.params.within`, `processor.meters.publish`, and controller param writes do not allocate. `controller.meters.snapshot` returns owned copies and is expected to run off the RT thread.

**Type safety with no runtime cost.** Types encode key/value sets, arrays vs scalars, and enum label unions for params. Bindings compute offsets at bind time; field access compiles to direct typed‑array reads/writes.

**Deterministic plan.** Same spec ⇒ same plan, always. This enables precomputation, reproducible debugging, and independent re‑implementation in other languages.

---

## 2. Hash‑verified handoffs

**Why:** Prevent accidental spec/plan mismatches across threads. A 64‑bit FNV‑1a hash covers id, field names, kinds, lengths, and ranges. `bindProcessor(spec, received)` verifies the received plan/hash before exposing views.

**Where stored:** `plan.hash` and `handoff.hash` (both `bigint`).

**Guideline:** In production, always bind via `bindProcessor(spec, receiveHandoff(...))` instead of mapping offsets manually.

---

## 3. Seqlock mechanics

**Control:** each family has `Int32` control `[LOCK, SEQ]`.

- **LOCK** — acquired by the single writer via `Atomics.compareExchange`, released with `Atomics.store`.
- **SEQ** — bumped odd on enter, even on commit; readers only observe it.

**Reader protocol (snapshot/within):**

1. load `SEQ` → `s1` (spin if odd);
2. read/capture values;
3. load `SEQ` → `s2`;
4. if `s1 !== s2` or odd → retry.

**Spin & retry budgets:** very small spin loops when odd; bounded retries before yielding and retrying. Budgets are kept internal for now to avoid surface area in the public API.

**Memory ordering:** writers use atomic stores around SEQ bumps; readers use atomic loads for SEQ before/after value reads. This is sufficient for JS’s Atomics model to guarantee readers see a self‑consistent snapshot.

---

## 4. Planes and semantics

- **Params:** PF32, PI32, PB, PU. Enums are stored as **indices** (PI32). Ranges live in binding metadata.
- **Meters:** MF32, MF64, MU32, MU. **Bool meters** use MU32 (0/1 numbers) for pragmatic atomicity and minimal planes.

**Indexing rule:** planner offsets are _bytes_; divide by `BYTES_PER_ELEMENT` to compute the typed‑array index.

---

## 5. Diagnostics & ergonomics

- `version()` on params/meters is a single atomic load. Poll it, then snapshot only when it changes.
- Optional `snapshotWithStatus` can surface spin/retry/fallback counters for profiling in dev builds.
- Higher‑level helpers (kits) may close over `spec`/`plan` for convenience; the kernel stays explicit and composable.

---

## 6. Future toggles (not part of v1 contract)

- Tunable spin/retry budgets for extreme workloads.
- Optional `(SEQ, GEN)` extended state if strict anti‑ABA proofs are ever required.
- Dedicated plane for boolean meters if a future platform exposes atomic 8‑bit ops with the right semantics.
