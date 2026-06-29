# Migration from the Seqlok Prototype

Exclave Boundary was formerly developed under the Seqlok prototype name. Current integrations should use `@exclave/boundary`.

## Import Path

Use the current package import:

```ts
import { defineSpec } from "@exclave/boundary";
```

Do not use old prototype package names in new code or docs.

## Vocabulary

- Keep `Seqlok` only when discussing history.
- Use `seqlock` only for the concurrency primitive.
- Use Exclave Boundary for the public package and docs.

## Practical Changes

| Prototype-era habit | Current guidance |
| --- | --- |
| Importing prototype package names. | Import `@exclave/boundary`. |
| Treating docs as repository archaeology. | Explain the current package contract first. |
| Reconstructing layout on both sides. | Build a handoff from one plan and accept it at the boundary. |
| Treating audio as the only domain. | Use audio as the clearest first example, not the abstraction limit. |
| Importing internals for convenience. | Stay on root exports or `@exclave/boundary/diagnostics`. |

## Boundary Semantics

The public package is a typed shared-memory boundary substrate, not a full application runtime. Orchestration, transport protocols, worker lifecycle management, and domain-specific command semantics stay outside `@exclave/boundary`.
