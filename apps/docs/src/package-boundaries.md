# Package Graph and Internal Boundaries

This release direction uses one public package:

```txt
@exclave/boundary
```

Exclave is the ecosystem name. Boundary is this package. The former split between base, schema, and primitives is internalized. Those layers are allowed to exist as source folders, but they are not workspace runtime dependencies in the packed output.

## Public Boundary

Consumers should import from:

```ts
import { defineSpec, planLayout } from "@exclave/boundary";
import { snapshotCounters } from "@exclave/boundary/diagnostics";
```

## Internal Boundary

Internal modules may change without semver guarantees unless they are exported from `@exclave/boundary` or `@exclave/boundary/diagnostics`.

## Publish Rule

The packed package must not depend on `workspace:*` packages at runtime. If a future pass splits packages again, each package must be publish-ready, packed, and smoke-tested as a real dependency.
