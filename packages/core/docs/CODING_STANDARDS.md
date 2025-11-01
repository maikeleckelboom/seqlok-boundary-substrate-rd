# Coding Standards (API surface)

- **No boolean flags** in public APIs (e.g., `withStatus`). Prefer separate methods (e.g., `snapshotWithStatus`).
- **No `any`** in type surfaces or examples; use discriminated unions, generics, or `@ts-expect-error` in tests for negative cases.
- **Property readers inside `params.within`**; no call‑style getters.
- **Range‑only DSL** for numeric params ({ min, max }); UI handles snapping.
