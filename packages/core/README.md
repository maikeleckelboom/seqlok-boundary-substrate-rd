# @seqlok/core

Coherent, atomic, SWMR state sync for real-time systems. A shared-memory layer between a **Controller** (main/UI) and a
**Processor** (worker/worklet). Controller writes **Params**, Processor writes **Meters**.

- Typed arrays over `SharedArrayBuffer`, guarded by seqlock
  - API: `defineSpec → planLayout → allocateShared → buildHandoff → receiveHandoff → bindController / bindProcessor`
- ESM-only (Browser 2024+ / Node 20+), COOP/COEP enabled

---

## Install

```bash
pnpm add @seqlok/core
# or
npm i @seqlok/core
```

---

## Quick Start — Define → Plan → Bind

```
src/
  spec.ts
  main.ts
  worker.ts
```

### `src/spec.ts`

```ts
import { defineSpec } from '@seqlok/core';

export const spec = defineSpec(({ param, meter }) => ({
  id: 'demo',
  params: {
    timeRatio: param.f32({ min: 0.25, max: 4 }),
    coeffs: param.f32.array(8),
    mode: param.enum({ values: ['normal', 'granular'] }),
  },
  meters: {
    rms: meter.f32(),
    peak: meter.f32(),
    spectrum: meter.f32.array(1024),
    frames: meter.u32(),
  },
}));

export type DemoSpec = typeof spec;
```

### `src/main.ts`

```ts
import { planLayout, allocateShared, buildHandoff, bindController } from '@seqlok/core';
import { spec } from './spec';

const plan = planLayout(spec);
const backing = allocateShared(plan);
export const controller = bindController(spec, backing);

const handoff = buildHandoff(plan, backing);
worker.postMessage({ type: 'HANDOFF', handoff });

controller.params.update({ timeRatio: 1.5 });
controller.params.stage('coeffs', (v) => {
  for (let i = 0; i < v.length; i++) v[i] = Math.random();
});

const v0 = controller.meters.version();
if (controller.meters.version() !== v0) {
  const { rms, spectrum } = controller.meters.snapshot({ keys: ['rms', 'spectrum'] });
}
```

### `src/worker.ts`

```ts
import { receiveHandoff, bindProcessor } from '@seqlok/core';
import { spec } from './spec';

self.onmessage = (ev) => {
  if (ev.data?.type !== 'HANDOFF') return;

  const received = receiveHandoff(ev.data.handoff);
  const processor = bindProcessor(spec, received);

  processor.params.within((p) => {
    const ratio = p.timeRatio;
    const taps = p.coeffs;
    const mode = p.mode;
  });

  processor.meters.publish((w) => {
    w.rms(0.42);
    w.peak(0.71);
    w.stage('spectrum', (buf) => {
      for (let i = 0; i < buf.length; i++) buf[i] = i & 1 ? 0 : 1;
    });
    w.frames(123_456);
  });
};
```

---

## Memory planes (cheat sheet)

PF32/PI32/PB/PU for **params**, MF32/MF64/MU32/MU for **meters**.
Offsets are bytes → `index = offset / BYTES_PER_ELEMENT`.
Bool meters are `0 | 1` on MU32.

---

## Documentation

**Architecture**

- [00 — Origin & Design History](./docs/architecture/00-seqlok-origin-and-design-history.md)
- [01 — Goals & Non-Goals](./docs/architecture/01-seqlok-goals-and-non-goals.md)
- [02 — Intellectual Heritage](./docs/architecture/02-seqlok-intellectual-heritage.md)
- [03 — Concurrency Model & Roles](./docs/architecture/03-seqlok-concurrency-model-and-roles.md)
- [04 — DSL Overview & Rationale](./docs/architecture/04-seqlok-dsl-overview-and-rationale.md)
- [05 — Error System & Fail-Fast Philosophy](./docs/architecture/05-seqlok-error-system-and-fail-fast-philosophy.md)
- [06 — Object Model Rationale](./docs/architecture/06-seqlok-object-model-rationale.md)
- [07 — API Shape Rationale](./docs/architecture/07-seqlok-api-shape-rationale.md)
- [08 — Primitives & Seqlock](./docs/architecture/08-seqlok-primitives-and-seqlock.md)
- [09 — Backing & Plane Layout](./docs/architecture/09-seqlok-backing-and-plane-layout.md)
- [10 — ABA/Wraparound: Not a Bug](./docs/architecture/10-seqlok-aba-wraparound-not-a-bug.md)
- [11 — E2E Flow: Visual Guide](./docs/architecture/11-seqlok-e2e-flow-visual-guide.md)
- [12 — Coherent Reads & Planes](./docs/architecture/12-coherent-reads-and-planes.md)
- [13 — Implementation Notes (Kernel)](./docs/architecture/13-implementation-notes.md)

**Reference**

- [API Reference](./docs/api-reference.md)

---

## License

MIT
