# Seqlok Boundary Substrate R&D

Status: public core extraction in progress.

This repository contains `@seqlok/core`, a typed shared-memory boundary substrate for systems where one side writes control parameters and another timing-sensitive side reads them coherently. It demonstrates authored contracts, deterministic layout planning, shared backing allocation, explicit handoff artifacts, role-specific bindings, diagnostics, tests, benchmarks, and release smoke checks.

The public package is `@seqlok/core`. The former prototype package name was `@seqlok-internal/prototype-core`; new integrations should not use that name.

## What This Is

Seqlok makes a runtime boundary explicit:

- what fields exist across the boundary
- where they live in shared memory
- which side writes them
- which side reads them
- how readers avoid half-written state
- how a runtime receives its memory contract without hidden process state

The current vocabulary is controller, processor, observer, params, and meters. Those names describe roles in the boundary substrate, not a complete application framework.

## Install

```sh
pnpm add @seqlok/core
```

`@seqlok/core` is ESM-only, typed, and published as one package for this pass. Internal base, schema, and primitive layers are kept inside the package rather than exposed as workspace runtime dependencies.

## Quickstart

```ts
import {
  acceptHandoff,
  allocateShared,
  bindController,
  bindProcessor,
  buildHandoff,
  defineSpec,
  planLayout,
} from "@seqlok/core";

const spec = defineSpec(({ param, meter }) => ({
  params: {
    runtime: {
      enabled: param.bool(),
      count: param.u32({ min: 0, max: 1_000_000 }),
      payload: param.u8.array(16),
    },
  },
  meters: {
    runtime: {
      state: meter.enum(["idle", "busy", "fault"]),
      delta: meter.i32(),
    },
  },
}));

const plan = planLayout(spec);
const backing = allocateShared(plan);
const handoff = buildHandoff(plan, backing);

const controller = bindController(spec, plan, backing);
const processor = bindProcessor(acceptHandoff(handoff));

controller.params.set("runtime.enabled", true);
controller.params.set("runtime.count", 42);
controller.params.stage("runtime.payload", (payload) => {
  payload.set([1, 2, 3, 4]);
});

processor.params.within((params) => {
  if (params.runtime.enabled) {
    processor.meters.publish((meters) => {
      meters.state(1);
      meters.delta(-1);
    });
  }
});

console.log(controller.meters.snapshot());
```

Authored specs may use nested namespaces. Write APIs use explicit canonical string keys, and processor read views expose nested aliases such as `params.runtime.enabled`.

## Current Package

- `packages/core` publishes `@seqlok/core`.
- The package is MIT licensed, ESM, typed, and marked `sideEffects: false`.
- The packed output includes built `dist` files, `README.md`, `LICENSE`, and `package.json`.
- The release smoke test packs the package, installs the tarball into a fresh consumer, imports `@seqlok/core`, and verifies there are no `workspace:*` runtime dependencies.

## Documentation

- [Docs site source](apps/docs/src/index.md)
- [Package README](packages/core/README.md)
- [Historical design docs](packages/core/docs/INDEX.md)

Run the docs site locally:

```sh
pnpm docs:dev
```

Build it:

```sh
pnpm docs:build
```

## Verification

```sh
pnpm install
pnpm format
pnpm lint
pnpm test:types
pnpm test
pnpm build
pnpm docs:build
pnpm test:pack
```

`pnpm verify` runs the repository gate.
