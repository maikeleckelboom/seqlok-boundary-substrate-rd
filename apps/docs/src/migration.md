# Migration Notes From Prototype

The prototype package name was `@seqlok-internal/prototype-core`. This pass extracts the public package as `@seqlok/core`.

## Import Path

Replace prototype imports:

```ts
import { defineSpec } from "@seqlok-internal/prototype-core";
```

with:

```ts
import { defineSpec } from "@seqlok/core";
```

## Spec Shape

Specs may now be authored as nested ASTs. Write APIs use explicit canonical string keys returned by `defineSpec()`, while processor read views expose nested aliases such as `params.runtime.enabled`.

## Anonymous IDs

Specs without an explicit `id` receive a deterministic anonymous id derived from canonical contents. Set an explicit `id` when handoff compatibility should be tied to a stable public contract name.

## Expanded Kinds

`u32`, `u32.array`, `u8.array`, `i8.array`, `i16.array`, `u16.array`, `i32` meters, and enum meters are part of the public core surface for this pass.

## Boundary Semantics

The public package is still a boundary substrate, not a full application runtime. Orchestration, transport protocols, worker lifecycle management, and domain-specific command semantics stay outside `@seqlok/core`.
