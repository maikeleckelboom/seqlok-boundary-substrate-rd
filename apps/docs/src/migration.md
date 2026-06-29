# Migration Notes

Exclave Boundary was formerly developed under the Seqlok prototype name. Current integrations should use `@exclave/boundary`.

## Import Path

Use the current package import:

```ts
import { defineSpec } from "@exclave/boundary";
```

## Spec Shape

Specs may now be authored as nested ASTs. Write APIs use explicit canonical string keys returned by `defineSpec()`, while processor read views expose nested aliases such as `params.runtime.enabled`.

## Anonymous IDs

Specs without an explicit `id` receive a deterministic anonymous id derived from canonical contents. Set an explicit `id` when handoff compatibility should be tied to a stable public contract name.

## Expanded Kinds

`u32`, `u32.array`, `u8.array`, `i8.array`, `i16.array`, `u16.array`, `i32` meters, and enum meters are part of the public core surface for this pass.

## Boundary Semantics

The public package is a typed shared-memory boundary substrate, not a full application runtime. Orchestration, transport protocols, worker lifecycle management, and domain-specific command semantics stay outside `@exclave/boundary`.
