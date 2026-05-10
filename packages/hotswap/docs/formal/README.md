# HotSwap Formal Bundle

> Entry point for the formal model, reference C++ spec, and English formal spec.

This directory holds the artefacts that make the hotswap protocol **provable**
and **cross-language**.

---

## 1. Supported vs experimental

The formal bundle is split by status.

### Supported

- **`single`** — base single-swap protocol (aligned lifecycle)
- **`reject-busy`** — Level 2 overlap policy (aligned lifecycle)
- **`persistent-handoff`** — continuity-class persistent handoff lifecycle extension

### Experimental

- **`mailbox-latest`** — latest-wins mailbox policy

Experimental material lives under `experimental/` and must not be treated as part of the shipped supported surface.

Policy axis and continuity axis are different concerns:

- **Policy axis** — `single`, `reject-busy`
- **Continuity axis** — `aligned` (shared by `single` / `reject-busy`), `persistent` (modeled by `persistent-handoff`)

See [`../adr/hotswap-continuity-classes-and-persistent-handoff.md`](../adr/hotswap-continuity-classes-and-persistent-handoff.md).

---

## 2. Contents

### Policies (TLA+ + English spec)

- **`single`**

  - [`policies/single/`](./policies/single/)

- **`reject-busy`**

  - [`policies/reject-busy/`](./policies/reject-busy/)

- **`persistent-handoff`**

  - [`policies/persistent-handoff/`](./policies/persistent-handoff/)

- **`mailbox-latest`** (experimental)
  - [`experimental/mailbox-latest/`](./experimental/mailbox-latest/)

Each policy folder is intended to be self-contained:
English spec + `tla/` module + TLC configs.

### Reference Implementation

- [`reference/cpp/hotswap_spec.reference.hpp`](reference/cpp/hotswap_spec.reference.hpp)  
  Header-only **reference C++ specification** of the protocol state machine.
  Kept in lockstep with the TypeScript spec for cross-language verification.

  > Not installed as public ABI; production code includes `<seqlok/hotswap_spec.hpp>`.

### Primitives (shared building blocks)

- [`primitives/README.md`](./primitives/README.md)

Primitives are zoned by artifact type and authority: `specs/` (ratified), `architecture/` (design rationale), `planned/` (aspirational stubs and cross-package pointers), and `tla/` (model files). See the primitives README for classification.

### Tooling

Outside this directory but part of the formal bundle:

- `../../scripts/tla/run-hotswap.ts`  
  CLI helper for running TLC with policy-based selection.

---

## 3. How the pieces relate

High-level relationships:

- **HotSwapSingle.tla**  
  Canonical mathematical model of a single swap. Proves the base aligned lifecycle and its core safety/liveness properties.

- **HotSwapRejectBusy.tla**  
  Extends the base model to verify multi-swap behavior under reject-while-busy overlap policy.

- **HotSwapPersistentHandoff.tla**  
  Models the persistent-handoff lifecycle: capture, install, catchup, optional prewarm, crossfade, and retire gating.
  The current model is intentionally narrow:

  - persistent continuity only
  - one admitted handoff per behavior
  - successful path only

- **English policy docs**  
  Human-readable explanations of the models, one folder per policy under `policies/`.

- **reference C++** (`reference/cpp/`)  
  C++ template state machine matching the TypeScript implementation and traceable to the TLA+ models.

- **primitives** (`primitives/`)  
  Shared building blocks such as transport notes, the mailbox primitive TLA+ model, and planned ring/coherence stubs.

For overall package orientation, see:

- [`../README.md`](../README.md)

---

## 4. Running the model

### 4.1 Via workspace script

From the repo root:

```bash
# Single-swap protocol (default)
pnpm tla:hotswap
pnpm tla:hotswap:full

# Multi-swap with reject-while-busy
pnpm tla:hotswap -- --policy reject-busy
pnpm tla:hotswap:full -- --policy reject-busy

# Persistent-handoff continuity class
pnpm tla:hotswap -- --policy persistent-handoff
pnpm tla:hotswap:full -- --policy persistent-handoff

# EXPERIMENTAL: mailbox-latest overlap handling
pnpm tla:hotswap -- --policy mailbox-latest
pnpm tla:hotswap:full -- --policy mailbox-latest
```

The script (`scripts/tla/run-hotswap.ts`) is responsible for:

- selecting the correct `.tla` and `.cfg` based on `--policy` and mode (`invonly` vs `full`)
- ensuring `tools/tla/tla2tools.jar` exists
- forwarding extra TLC CLI args
- running TLC via `java`
- routing TLC metadata into the package-local hotswap formal state directory

### 4.2 Manual TLC invocation

**Single-swap:**

```bash
java -jar tla2tools.jar \
  -config packages/hotswap/docs/formal/policies/single/tla/HotSwapSingle.cfg \
  packages/hotswap/docs/formal/policies/single/tla/HotSwapSingle.tla
```

**Reject-busy:**

```bash
java -jar tla2tools.jar \
  -config packages/hotswap/docs/formal/policies/reject-busy/tla/HotSwapRejectBusy.cfg \
  packages/hotswap/docs/formal/policies/reject-busy/tla/HotSwapRejectBusy.tla
```

**Persistent-handoff:**

```bash
java -jar tla2tools.jar \
  -config packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.cfg \
  packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.tla
```

---

## 5. Invariants and properties

The canonical list of safety and liveness properties lives in:

- **Single-swap:** [`policies/single/HotSwapSingle.md`](./policies/single/HotSwapSingle.md)
- **Reject-busy:** [`policies/reject-busy/HotSwapRejectBusy.md`](./policies/reject-busy/HotSwapRejectBusy.md)
- **Persistent-handoff:** [`policies/persistent-handoff/HotSwapPersistentHandoff.md`](./policies/persistent-handoff/HotSwapPersistentHandoff.md)
- **Mailbox-latest (experimental):** [`experimental/mailbox-latest/HotSwapMailboxLatest.md`](./experimental/mailbox-latest/HotSwapMailboxLatest.md)

### Aligned-lifecycle models (`single`, `reject-busy`)

These models share the base aligned lifecycle:

`spawn -> prime -> prewarm -> crossfade -> retire -> idle`

### Persistent-handoff model

The persistent-handoff model extends the lifecycle with:

`capture -> install -> catchup`

and currently proves the successful persistent path only.
It does **not** yet prove explicit downgrade or abort behavior.

---

## 6. Policy-based naming

| Policy Name          | TLA+ Spec                    | What It Proves                                        |
| -------------------- | ---------------------------- | ----------------------------------------------------- |
| `single`             | HotSwapSingle.tla            | Base protocol for one in-flight aligned swap          |
| `reject-busy`        | HotSwapRejectBusy.tla        | Reject-while-busy overlap policy                      |
| `persistent-handoff` | HotSwapPersistentHandoff.tla | Persistent continuity lifecycle, successful path only |
| `mailbox-latest`     | HotSwapMailboxLatest.tla     | Experimental latest-wins mailbox policy               |

---

## 7. Verification results

As of the latest supported-surface run:

| Spec                     | Mode    | Result       | Notes                                                              |
| ------------------------ | ------- | ------------ | ------------------------------------------------------------------ |
| HotSwapSingle            | full    | PASS         | Supported aligned base lifecycle                                   |
| HotSwapRejectBusy        | full    | PASS         | Supported Level 2 overlap policy                                   |
| HotSwapPersistentHandoff | invonly | PASS         | 48 distinct states, depth 8                                        |
| HotSwapPersistentHandoff | full    | PASS         | 48 distinct states, depth 8, successful-path-only persistent model |
| HotSwapMailboxLatest     | full    | EXPERIMENTAL | Not part of the supported surface                                  |

Notes:

- `persistent-handoff` is now green in both invariants-only and full modes.
- The current `persistent-handoff` model is intentionally narrow and does not yet include explicit downgrade or abort branches.
- `mailbox-latest` remains experimental and should not be read as part of the shipped supported contract.

---

## 8. Updating the specs

If you add or change invariants:

1. Update the relevant `.tla` file
2. Update the corresponding English spec
3. Update tests if behavior changes
4. Rerun the affected TLC models

Keep the TypeScript surface, English docs, and TLA+ models in lockstep.

---

## 9. Why this matters for real-time audio

In RT audio, protocol bugs cause audible failures, not just abstract correctness issues.

The formal surface exists to prove the lifecycle and policy rules before implementation drift turns them into folklore.
The implementation can still have ordinary code bugs, but the protocol structure is explicitly checked.
