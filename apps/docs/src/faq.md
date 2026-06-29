# FAQ

## Is This Still a Prototype Package?

No. The public package is `@exclave/boundary`. Historical prototype docs may remain in the repository, but current integration should target Exclave Boundary.

## Why Dot Keys?

Dot keys make the runtime contract flat and deterministic while keeping the authored AST readable. They also make memory layout and handoff validation easier to inspect.

## Why Not Publish Base, Schema, and Primitives Separately?

This package keeps those layers behind one public boundary. Internal layers can stay split in source, but consumers should not need multiple packages to import and run the boundary flow.

## Can I Use This Without SharedArrayBuffer?

The core binding flow is built around shared backing memory. A host can decide when and how to allocate that memory, but the public runtime flow assumes `SharedArrayBuffer` or compatible shared WebAssembly memory.

## Are Domain Semantics Built In?

No. Exclave Boundary provides typed params, meters, plans, backings, handoff validation, bindings, diagnostics, and structured errors. Domain commands and higher-level orchestration belong outside the package.
