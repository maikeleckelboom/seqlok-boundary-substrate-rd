# Memory and Layout Model

The authored spec is not memory. `planLayout(spec)` is the lowering step that turns canonical fields into byte sizes, plane offsets, and a layout identity.

## Canonical Fields

Nested authored fields collapse to canonical dot keys before layout:

```text
params.filter.cutoff -> "filter.cutoff"
meters.engine.rms    -> "engine.rms"
```

The plan uses that canonical field set. Controller writes, snapshots, diagnostics, and generated examples should use the same keys.

## Plan First, Allocate Second

Allocation consumes a plan:

```ts
const plan = planLayout(spec);
const backing = allocateShared(plan);
```

The binding layer does not silently re-plan. Passing a plan and backing that do not describe the same memory is a contract error.

## Planes

The implementation maps fields into typed planes for scalar and array storage. The exact plane names are implementation detail, but the public consequence is stable:

- Numeric param and meter fields map to typed shared-memory regions.
- Boolean and enum values have explicit storage representations.
- Array fields reserve fixed lengths at plan time.
- Coherent reads and writes use seqlock-protected domains.

## Backing Choices

| Allocation | Use |
| --- | --- |
| `allocateShared(plan)` | One contiguous `SharedArrayBuffer`; the simplest handoff shape. |
| `allocateSharedPartitioned(plan)` | Separate buffers per plane; useful when host integration wants plane-level separation. |
| `allocateWasmShared(plan, memory)` | Attach compatible shared `WebAssembly.Memory`; useful for WASM-oriented runtimes. |

Only `shared` and `shared-partitioned` backing are currently represented by the handoff protocol.

## Callback-Scoped Views

Array views in `params.within(...)`, `params.stage(...)`, and meter `stage(...)` callbacks are ephemeral. They point into shared backing or callback-owned scratch space. Do not store them for later use.
