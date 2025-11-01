# Migration Guide to vNext

## Renames & Removals

- `param`/`meter` → **`params`/`meters`** namespaces.
- Remove call‑style readers (`r.rate()`); use property reads inside `params.within` (`v.rate`).
- Processor no longer reconstructs views; it binds using `receiveHandoff(h)` → `bindProcessor(spec, backing)`.

## Snapshots

- `sample()` → **`snapshot()`** (values only).
- Any prior `withStatus` flag → **`snapshotWithStatus(...)`** method (values + status pair).

## Zero‑alloc arrays

- Use `snapshot({ keys, into })`.  
  Only the arrays present in `into` reuse buffers; others allocate. Scalars are numbers.

## Verify with type tests

- `into` on a scalar key → `@ts-expect-error`
- wrong typed‑array class/length → `@ts-expect-error` (length also asserted at runtime)
