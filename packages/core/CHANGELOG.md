# @seqlok/core

## 0.1.0

- Lock v1 DSL: range-only numeric scalars, fixed-length arrays, enum/enum.array; no step/origin/defaults.
- Finalize public flow: defineSpec → planLayout → allocateShared → buildHandoff → receiveHandoff →
  bindController/bindProcessor.
- Ship SWMR seqlock + SWSR ring primitives, backing/mapViews/handoff pipeline, diagnostics entrypoint (
  `@seqlok/core/diagnostics`), and error system with tests.
