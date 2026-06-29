# @seqlok/core

`@seqlok/core` is the public core package for the Seqlok boundary-substrate R&D repository. It provides authored spec compilation, deterministic memory planning, shared backing allocation, explicit handoff artifacts, controller/processor/observer bindings, diagnostics, and structured errors.

The package is ESM-only, typed, MIT licensed, and marked `sideEffects: false`.

## Install

```sh
pnpm add @seqlok/core
```

## Flow

```text
defineSpec
  -> planLayout
  -> allocateShared / allocateSharedPartitioned / allocateWasmShared
  -> buildHandoff
  -> acceptHandoff
  -> bindController / bindProcessor / bindObserver
```

## Example

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
      count: param.u32({ min: 0, max: 1000 }),
    },
  },
  meters: {
    runtime: {
      state: meter.enum(["idle", "busy"]),
      delta: meter.i32(),
    },
  },
}));

const plan = planLayout(spec);
const backing = allocateShared(plan);
const controller = bindController(spec, plan, backing);
const processor = bindProcessor(acceptHandoff(buildHandoff(plan, backing)));

controller.params.set("runtime.enabled", true);
controller.params.set("runtime.count", 7);

processor.params.within((params) => {
  if (params.runtime.enabled) {
    processor.meters.publish((meters) => {
      meters.state(1);
      meters.delta(-1);
    });
  }
});
```

## Spec Contract

`defineSpec()` accepts an authored AST or a plain canonical object. Authored specs may use nested namespaces. Write APIs use explicit canonical string keys, and processor read views expose nested aliases:

```ts
params.runtime.enabled;
params.runtime.count;
```

Anonymous specs receive deterministic `anon_<hash>` ids derived from canonical contents.

## Package Boundary

This pass publishes one package: `@seqlok/core`. Internal base, schema, and primitive layers are implementation details unless exported from the root package or `@seqlok/core/diagnostics`.

The packed package must not contain `workspace:*` runtime dependencies. Run:

```sh
pnpm -F @seqlok/core run test:pack
```

## Development

```sh
pnpm -F @seqlok/core run build
pnpm -F @seqlok/core run test
pnpm -F @seqlok/core run test:types
pnpm -F @seqlok/core run bench
```

## Documentation

The VitePress docs site lives in `apps/docs`. Historical design notes remain under `packages/core/docs`; treat them as architecture history when they go beyond the current public package boundary.
