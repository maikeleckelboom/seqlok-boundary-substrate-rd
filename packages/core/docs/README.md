# Seqlok vNext — Core Concepts & Quick Start

Seqlok is a **SWMR** (single-writer, multiple-readers) synchronization layer for real‑time systems.
It provides **coherent** snapshots across threads using **seqlocks**, with two independent domains:

- **PU (Params domain)** — **Controller** is the single writer; **Processor** reads coherently.
- **MU (Meters domain)** — **Processor** is the single writer; **Controller** reads coherently.

## Golden Wiring (Owner/Main ↔ Processor)

**Owner/Main** builds and owns memory, binds controller, and sends a handoff:

```ts
import {
  defineSpec,
  planSpec,
  allocateShared,
  buildHandoff,
  bindController,
} from '@seqlok/core';

const spec = defineSpec(/* ... */);
const plan = planSpec(spec);
const backing = allocateShared(plan);
const ctl = bindController(spec, backing, { rangePolicy: 'clamp' });
const handoff = buildHandoff(plan, backing);
worker.postMessage(handoff);
```

**Processor** receives the handoff and binds:

```ts
import { receiveHandoff, bindProcessor } from '@seqlok/core';

self.onmessage = (e) => {
  const backing = receiveHandoff(e.data);
  const proc = bindProcessor(spec, backing);
};
```

> Processor **never** calls `planSpec` or mapping helpers; it only receives a validated **backing** and binds.

## Coherent Reads & Writes (Final API)

### Controller (values)

```ts
// Full
const allMeters = ctl.meters.snapshot();

// Subset + zero-alloc via `into`
const buf = new Float32Array(512);
const { spectrum, peak } = ctl.meters.snapshot({
  keys: ['spectrum', 'peak'],
  into: { spectrum: buf }, // spectrum === buf
});
```

### Controller (diagnostics)

```ts
const [vals, status] = ctl.meters.snapshotWithStatus({
  keys: ['spectrum', 'peak'],
  into: { spectrum: buf },
});
// status = { spins, retries, fallback }
```

### Processor (coherent param window + meter publish)

```ts
const scratch = new Float32Array(1024);

proc.params.within((v) => {
  const rate = v.rate; // scalar captured
  const bands = v.bands; // scratch view (copy if needed)

  const peak = computePeak(bands);
  computeSpectrum(bands, scratch);

  proc.meters.publish((w) => {
    w.peak(peak);
    w.stage('spectrum', (dst) => dst.set(scratch));
  });
});
```

## Key Guarantees

- **Coherence:** readers see self‑consistent epochs; torn reads are retried transparently.
- **Identity:** for arrays provided in `into`, `result[k] === into[k]`.
- **Partial zero‑alloc:** only arrays present in `into` reuse buffers; others allocate.
- **No boolean flags:** diagnostics use a separate `snapshotWithStatus` method.
- **Range policy:** scalars respect `rangePolicy: 'clamp' | 'reject'` (arrays validate shape/length).

See `PUBLIC_API.md`, `COHERENCE.md`, and `GOLDEN_API_DESIGN.md` for details.
