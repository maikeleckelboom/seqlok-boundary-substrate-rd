# Install

Install the public package:

```sh
pnpm add @seqlok/core
```

The package is ESM-only and ships TypeScript declarations through its `exports` map.

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
```

## Runtime Requirements

`@seqlok/core` uses `SharedArrayBuffer` for shared backing memory. In browsers, pages must be cross-origin isolated before `SharedArrayBuffer` is available. In Node.js, worker-thread usage depends on the Node version and host runtime.

## Package Shape

The package publishes only the built `dist` output, `README.md`, `LICENSE`, and `package.json`. It does not expose workspace-only runtime dependencies.
