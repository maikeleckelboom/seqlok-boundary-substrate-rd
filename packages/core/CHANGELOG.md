# Exclave Boundary

## 0.3.0-next.0

- Rename public package metadata to `@exclave/boundary`.
- Compile authored nested spec ASTs to canonical dot-key runtime specs.
- Add deterministic anonymous spec ids derived from canonical contents.
- Add `CanonicalSpec` and `CanonicalSpecFromAst` type exports.
- Expand supported params with `u32`, `u32.array`, `u8.array`, `i8.array`, `i16.array`, and `u16.array`.
- Expand supported meters with `i32` and enum scalar meters.
- Harden binding factory argument errors with `binding.invalidArgs`.
- Add packed-consumer smoke coverage for the publish tarball.
- Rename backing and handoff vocabulary to layout-oriented `packed`, `partitioned`, and `wasm` names.
- Remove the context helper surface; bind controllers and observers from explicit `spec, plan, backing` triples and processors from handoff or explicit `plan, backing`.

## 0.2.0

- Add observer binding (`bindObserver`) for passive/telemetry consumers:
  - host-side: `bindObserver(spec, plan, backing, options?)`,
  - worker-side: `bindObserver(accepted, options?)` from `AcceptedHandoff<S>`,
  - supports both `packed` and `partitioned` backings,
  - exposes read-only `params.within(...)` and `meters.snapshot(...)` with configurable retry/spin budgets.
- Introduce a shared coherence layer for bindings (`binding/common/coherent`):
  - centralize `snapshotWithPolicy` and `makeWithin`,
  - unify seqlock retry/spin/timeout semantics for controller, processor, and observer.
- Add cross-thread observer coherence test:
  - Node `Worker` publishes meters while an observer samples params/meters,
  - asserts finite, in-range values with observed peak approaching `1.0`.
- Extend benchmarks/docs to cover observer read-path performance:
  - include `snapshot` / `within` timings,
  - document observer as a non-authoritative, read-only role.
- Introduce SWSR ring primitive in `primitives`:
  - single-writer/single-reader ring designed as the building block for higher-level MWMR command buses,
  - covered by runtime tests and documented in ADR-010.

## 0.1.0

- Lock v1 DSL: range-only numeric scalars, fixed-length arrays, enum/enum.array; no step/origin/defaults.
- Finalize public flow: `defineSpec` → `planLayout` → `allocatePacked` → `buildHandoff` → `acceptHandoff` →
  `bindController` / `bindProcessor`.
- Ship SWMR seqlock primitives, backing/mapViews/handoff pipeline, diagnostics entrypoint
  (`@exclave/boundary/diagnostics`), and error system with tests.
