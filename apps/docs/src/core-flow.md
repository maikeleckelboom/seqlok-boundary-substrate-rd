# Boundary Flow

Exclave Boundary is organized around five explicit steps.

## Define

`defineSpec()` accepts either an authored AST builder or a plain object. Nested authored params and meters compile to canonical dot keys.

## Plan

`planLayout(spec)` converts the canonical spec into a deterministic memory plan. It assigns every param and meter to a backing plane, byte offset, length, and element width.

## Allocate

`allocateShared(plan)` creates a single `SharedArrayBuffer` backing. `allocateSharedPartitioned(plan)` can allocate one shared buffer per plane when transport or host boundaries need that shape.

## Handoff

`buildHandoff(plan, backing)` creates a serializable boundary artifact. `acceptHandoff(handoff)` validates artifact shape, plan compatibility, and backing capacity before a worker or secondary runtime binds to it.

## Bind

Controllers write params and read meters. Processors read params and publish meters. Observers read both sides without write authority.

```ts
const controller = bindController(spec, plan, backing);
const processor = bindProcessor(acceptHandoff(handoff));
const observer = bindObserver(acceptHandoff(handoff));
```

Binding factories throw `binding.invalidArgs` when required arguments are missing, and structured domain errors for invalid keys, invalid values, range failures, and handoff failures.
