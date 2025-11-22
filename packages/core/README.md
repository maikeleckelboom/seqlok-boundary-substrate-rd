# @seqlok/core

**Seqlok**
Lock-free shared-memory sync for real-time audio, workers, and WebAssembly.

---

## Status: v0.1.0 · SWMR core

Seqlok v0.1.0 ships the **single-writer, multi-reader (SWMR)** seqlock core:

- One writer, many readers over a shared backing (`SharedArrayBuffer`).
- Controller ↔ processor bindings with coherent `within` reads and `publish` writes.
- Typed-plane layout for params (PF32 / PI32 / PB) and meters (MF32 / MU32 / MF64 / MU).
- Range-only v1 DSL: numeric scalars, fixed-length arrays, and enum / enum.array.
- Decoupled mode only (JS + SAB); future MWMR/compose modes live in the design docs.
- Diagnostics surface (`@seqlok/core/diagnostics`) for counters, env probing, and debug tools.

**Zero-copy, seqlock-based state synchronization for real-time systems.**

A typed shared-memory layer between a **Controller** (main/UI thread) and a **Processor** (Worker / AudioWorklet):

- **Controller** writes **params** (what you want the engine to do).
- **Processor** writes **meters** (what the engine is actually doing).
- Both use coherent snapshots guarded by a seqlock so no one ever sees torn state.

- **Zero allocations** – direct typed-array access over `SharedArrayBuffer`.
- **Type-safe** – full TypeScript inference from spec → plan → backing → bindings.
- **Coherent reads** – readers never observe partial writes.
- **Predictable** – deterministic memory layout, no hidden orchestration or sugar in the core.

---

## Install

```bash
pnpm add @seqlok/core
```

### Runtime requirements

- ESM-only: modern browsers (≈2022+) or Node 20+.
- `SharedArrayBuffer` must be available:

  - **Browser**: correct COOP/COEP headers and `crossOriginIsolated === true`.
  - **Worker / AudioWorklet**: same process, SAB enabled by the host.
  - **Node**: recent Node with `SharedArrayBuffer` support (e.g. Node 20+).

---

## Core concept: Spec → Plan → Backing → Handoff → Bindings

Seqlok's API is shaped like the underlying protocol. There is **one golden flow** and the core does not provide shortcuts.

1. **Spec** – what exists

   ```ts
   const spec = defineSpec(/* params + meters schema */);
   ```

2. **Plan** – how it is laid out in memory

   ```ts
   const plan = planLayout(spec);
   ```

3. **Backing** – where it lives (actual shared memory)

   ```ts
   const backing = allocateShared(plan);
   ```

4. **Handoff** – how layout + backing cross a trust boundary

   ```ts
   const handoff = buildHandoff(plan, backing);
   ```

5. **ReceivedHandoff + bindings** – how the other side sees it

   ```ts
   const received = receiveHandoff(handoff);
   const controller = bindController(spec, plan, backing);
   const processor = bindProcessor(received);
   ```

The important rule:

> `planLayout` is called exactly once at the **Spec → Plan** boundary.
> Backing and binding **consume** `Plan` — they never recompute it.

There is **no** `bindController(spec, backing)` sugar in core.
If you want shortcuts, you build them _on top_ of this flow.

---

## Quick sketch: controller ↔ processor

This is the minimal shape of a typical setup.

### 1. Define a spec

```ts
import { defineSpec } from '@seqlok/core';

export const deckSpec = defineSpec(({ param, meter }) => ({
  id: 'deck',
  params: {
    timeRatio: param.f32({ min: 0.25, max: 4 }),
    eqBands: param.f32.array({ length: 8 }),
    mode: param.enum(['normal', 'granular']),
  },
  meters: {
    rms: meter.f32(),
    peak: meter.f32(),
    framesProcessed: meter.u32(),
  },
}));

export type DeckSpec = typeof deckSpec;
```

### 2. Owner thread: spec → plan → backing → controller + handoff

```ts
import {
  planLayout,
  allocateShared,
  buildHandoff,
  bindController,
  type Handoff,
} from '@seqlok/core';
import { deckSpec, type DeckSpec } from './spec';

const plan = planLayout(deckSpec);
const backing = allocateShared(plan);
const controller = bindController(deckSpec, plan, backing);

const handoff: Handoff<DeckSpec> = buildHandoff(plan, backing);

// handoff is what you post to a Worker / AudioWorklet
worker.postMessage({ type: 'handoff', handoff });

// Example controller usage
controller.params.set('timeRatio', 1.5);
controller.params.update({ mode: 'granular' });

controller.params.stage('eqBands', (view) => {
  for (let i = 0; i < view.length; i += 1) {
    view[i] = i < 4 ? -3 : 3;
  }
});

const meters = controller.meters.snapshot('rms', 'peak', 'framesProcessed');
console.log(meters);
```

### 3. Worker / processor side: receive handoff → bind processor

```ts
import {
  receiveHandoff,
  bindProcessor,
  type Handoff,
  type ProcessorBinding,
} from '@seqlok/core';
import type { DeckSpec } from './spec';

type InitMessage = {
  type: 'handoff';
  handoff: Handoff<DeckSpec>;
};

let processor: ProcessorBinding<DeckSpec> | undefined;

self.onmessage = (ev: MessageEvent<InitMessage>) => {
  if (ev.data.type !== 'handoff') return;

  const received = receiveHandoff(ev.data.handoff);
  processor = bindProcessor(received);
};

// Somewhere in your audio loop / worker loop
function processBlock() {
  if (!processor) return;

  processor.params.within((params) => {
    const { timeRatio, eqBands } = params;
    const framesForBlock = Math.floor(128 * timeRatio);

    processor.meters.publish((writer) => {
      writer.rms(0.5);
      writer.peak(0.9);

      writer.stage('framesProcessed', () => {
        // could be a scalar or array depending on the spec
      });

      // etc.
    });
  });
}
```

---

## Future JS pipes (host-side helpers)

Seqlok core intentionally does **not** ship orchestration helpers or pipe utilities.
But the protocol is designed so that, when JS gets a pipe operator, host code can look like this:

```ts
// Host-side helpers (not part of @seqlok/core)
const withPlan = (spec: DeckSpec) => ({
  spec,
  plan: planLayout(spec),
});

const withBacking = (ctx: { spec: DeckSpec; plan: Plan<DeckSpec> }) => ({
  ...ctx,
  backing: allocateShared(ctx.plan),
});

const withController = (ctx: {
  spec: DeckSpec;
  plan: Plan<DeckSpec>;
  backing: Backing;
}) => ({
  ...ctx,
  controller: bindController(ctx.spec, ctx.plan, ctx.backing),
});

const withHandoff = (ctx: { plan: Plan<DeckSpec>; backing: Backing }) => ({
  ...ctx,
  handoff: buildHandoff(ctx.plan, ctx.backing),
});
```

With a future pipeline operator, the **owner flow** could read:

```ts
const full =
  { spec: deckSpec }
    |> withPlan
    |> withBacking
    |> withController
    |> withHandoff;
```

The important part: this still calls the **same core functions** in the same order:

```
defineSpec → planLayout → allocateShared → buildHandoff → bindController
```

Core stays "just truth"; pipes and helpers are pure composition on top.

---

## Benchmarks

Seqlok ships micro- and scenario-level benchmarks for both primitives (seqlock) and end-to-end param/meter flows.

Run the raw suite:

```bash
pnpm bench
```

This executes all Vitest benches with a JSON reporter and writes the raw report to:

```text
bench-results.json
```

For a human-readable summary suitable for docs:

```bash
pnpm bench:report
```

This is equivalent to:

```bash
pnpm bench && pnpm bench:format
```

- `bench` produces `bench-results.json`.
- `bench:format` (`tsx scripts/format-bench.ts`) reads `bench-results.json` and prints a Markdown-ready summary
  (ASCII charts for hot-path ops and parameter writes) to stdout.

You can use that output directly in documentation (for example by refreshing a `bench-results.generated.md` file),
and treat the numbers as **regression guardrails**, not marketing claims.

---

## Diagnostics

Diagnostics live on a separate entry point:

```ts
import {
  snapshotCounters,
  resetCounters,
  type DiagnosticsCountersSnapshot,
} from '@seqlok/core/diagnostics';
```

Use this surface for:

- Environment probing and SAB/COOP/COEP checks.
- Binding / seqlock counters in stress harnesses.
- Dev overlays and HUDs.

It's designed so diagnostics can be tree-shaken out of production builds when unused.

---

## Documentation

Full design docs live under `packages/core/docs`.

Recommended entry points:

- [`docs/INDEX.md`](./docs/INDEX.md) – map of all architecture docs and ADRs.
- Concurrency model, seqlock rationale, planes layout, and architecture diagrams.
- API reference for the explicit golden flow:

  - `defineSpec`
  - `planLayout`
  - `allocateShared`
  - `buildHandoff`
  - `receiveHandoff`
  - `bindController` (spec + plan + backing)
  - `bindProcessor`

---

## License

See the LICENSE file in this repository for current licensing terms.
