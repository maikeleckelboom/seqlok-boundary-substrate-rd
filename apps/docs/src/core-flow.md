# Boundary Flow

Exclave Boundary has one explicit flow. The steps are intentionally separate so layout ownership, backing allocation, and runtime capability transfer remain visible.

```text
defineSpec
  -> planLayout
  -> allocateShared / allocateSharedPartitioned / allocateWasmShared
  -> buildHandoff
  -> acceptHandoff
  -> bindController / bindProcessor / bindObserver
```

## Stages

| Stage | Responsibility | Boundary value |
| --- | --- | --- |
| `defineSpec` | Author params and meters as a typed contract. | Canonical spec with dot keys. |
| `planLayout` | Compute deterministic plane sizes, offsets, and hash identity. | Plan. |
| `allocateShared` / `allocateSharedPartitioned` | Allocate backing memory that matches the plan. | Shared backing. |
| `buildHandoff` | Package plan and backing descriptor for transfer. | Handoff. |
| `acceptHandoff` | Validate the received artifact before binding. | Accepted handoff. |
| `bindController` | Bind host-side param writes and meter reads. | Controller binding. |
| `bindProcessor` | Bind runtime-side param reads and meter writes. | Processor binding. |
| `bindObserver` | Bind read-only inspection or telemetry surfaces. | Observer binding. |

`defineSpec` accepts nested authored AST and returns a canonical runtime spec with dot keys. `planLayout` turns that canonical spec into byte sizes and plane offsets. Allocation consumes the plan. Handoff packages the plan and backing descriptor. Bindings consume the accepted artifact or an explicit spec/plan/backing triple where the public API allows it.

## Ownership

- Host/controller side owns spec authoring, layout planning, backing allocation, and parameter writes.
- Runtime/processor side owns coherent parameter reads and meter publication.
- Observer side owns read-only snapshots for tooling, telemetry, or a secondary consumer.

This separation is the product. Avoid hiding plan or backing creation behind ambient global state.

## Timing-Sensitive Path

The hot path should already have an accepted handoff and a bound processor. It should read params inside `processor.params.within(...)` and publish meters inside `processor.meters.publish(...)`. Spec authoring, planning, allocation, validation, and worker lifecycle work belong outside the tight loop.
