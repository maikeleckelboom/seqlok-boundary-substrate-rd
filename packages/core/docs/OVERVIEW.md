# Overview

Seqlok provides coherent, lock‑free state exchange between a Controller (main/worker) and a Processor (RT/worker/worklet).

- Controller reads values via `*.snapshot(...)` (values) or `*.snapshotWithStatus(...)` (diagnostics).
- Processor reads params coherently via `params.within(cb)` and publishes meters via `meters.publish(cb)`.
- Zero‑alloc for arrays is opt‑in through `into` on the Controller side.
