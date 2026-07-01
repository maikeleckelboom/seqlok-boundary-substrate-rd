# Install

Install the public package in the application or library that owns the boundary contract:

```sh
pnpm add @exclave/boundary
```

Other package managers can install the same package:

```sh
npm install @exclave/boundary
yarn add @exclave/boundary
```

Import from the root package for the runtime flow:

```ts
import {
  acceptHandoff,
  allocatePacked,
  bindController,
  bindProcessor,
  buildHandoff,
  defineSpec,
  planLayout,
} from "@exclave/boundary";
```

Import diagnostics from the diagnostics subpath:

```ts
import { probeEnv, snapshotCounters } from "@exclave/boundary/diagnostics";
```

## Runtime Requirements

`@exclave/boundary` uses `SharedArrayBuffer` for shared backing memory. In browsers, pages must be cross-origin isolated before `SharedArrayBuffer` is available. In Node.js, worker-thread usage depends on the Node version and host runtime.

Run the diagnostics probe during integration rather than discovering support problems from a hot path:

```ts
import { probeEnv } from "@exclave/boundary/diagnostics";

const summary = probeEnv();

if (!summary.hasSharedArrayBuffer) {
  throw new Error("SharedArrayBuffer is unavailable in this runtime");
}
```

## Package Shape

The public package is ESM-only and typed. The supported import paths are:

| Import | Use |
| --- | --- |
| `@exclave/boundary` | Spec, planning, backing, handoff, bindings, enum helpers, and structured errors. |
| `@exclave/boundary/diagnostics` | Environment probes, counters, and mapped view descriptions. |

Internal folders under `packages/core/src` are not public API.
