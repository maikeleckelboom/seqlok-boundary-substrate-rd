# Guides

Deep-dive documents for `@seqlok/core`.

These are focused walkthroughs and patterns that build on the main README and API reference. They assume you already
know the basic golden flow:

> `defineSpec → planLayout → allocateShared/allocateWasmShared → buildHandoff → receiveHandoff → bindController / bindProcessor`

---

## Available guides

- [Understanding The Architecture](understanding-seqlok-mwmr-from-pipe-to-hub.md)
  How Seqlok scales from a simple pipe (SWSR) to a complex multi-writer system (MWMR) without locking the hot path. Covers:
  - The evolution from **Controller/Processor** to **Hub/Ring/Observer**
  - Critical mental models for **"Zero-GC"** programming
  - Deployment realities (COOP/COEP headers)


- [Enum helpers & UI wiring](./enum-helpers.md)
  How to drive UI controls, legends, and fixtures directly from enum params/meters using:
  - `enumValues`
  - `enumPaletteFor`
  - `enumArrayToLabels` / `enumLabelsToArray`
  - `enumIndexFromLabel` / `enumLabelFromIndex`

More guides will land here over time as we standardize recurring patterns in real demos.
