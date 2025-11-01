# Benchmarks (guidelines)

- `meters.snapshot({ keys: ['peak'] })` — target minimal overhead (controller hot path).
- `meters.snapshotWithStatus({ keys: ['peak'] })` — bounded overhead; aim for ≤ X% above values‑only.
- Zero‑alloc cases (`into`) should not allocate; verify GC pressure remains flat under sustained polling.
