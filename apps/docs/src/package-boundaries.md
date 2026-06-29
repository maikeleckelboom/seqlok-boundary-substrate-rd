# Package Graph and Internal Boundaries

This release direction uses one public package:

```txt
@seqlok/core
```

The former split between base, schema, and primitives is internalized for this pass. Those layers are allowed to exist as source folders, but they are not workspace runtime dependencies in the packed output.

## Public Boundary

Consumers should import from:

```ts
import { defineSpec, planLayout } from "@seqlok/core";
import { snapshotCounters } from "@seqlok/core/diagnostics";
```

## Internal Boundary

Internal modules may change without semver guarantees unless they are exported from `@seqlok/core` or `@seqlok/core/diagnostics`.

## Publish Rule

The packed package must not depend on `workspace:*` packages at runtime. If a future pass splits packages again, each package must be publish-ready, packed, and smoke-tested as a real dependency.
