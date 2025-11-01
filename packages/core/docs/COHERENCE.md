# Coherence Guarantees

- **Even/Odd seqlock** per domain: readers spin while odd; verify `seq0 === seq1 && even`.
- **Controller:** `meters.snapshot(...)` / `params.snapshot(...)` (values) and `snapshotWithStatus(...)` (values + status).
- **Processor:** `params.within(cb)` for a coherent window; publish meters atomically in one MU bump.

**Rules:**

- Do not leak ephemeral scratch views from `within`.
- Array values returned to Controller are **copies** at snapshot time; use `into` to avoid allocations.
- No cross‑domain coherence; correlate via stamps (e.g., `frameIndex`, `paramsEpoch`) if needed.
