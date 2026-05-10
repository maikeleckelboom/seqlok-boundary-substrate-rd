# Primitives

Shared building blocks used by multiple hotswap policies and by the projection spine.

This directory is **zoned by artifact type and authority**. Each subfolder contains artifacts of one kind only. Do not add files to the wrong zone.

## Zoning

| Zone            | Authority        | What belongs here                                                                                 | What must not go here                                         |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `specs/`        | Ratified         | Formal specifications that are implementation-authoritative and blocking for downstream work      | Architecture notes, planned stubs, cross-package pointers     |
| `architecture/` | Design rationale | Architectural decisions and transport choices that inform but do not constrain the ratified specs | Ratified specs (those go in `specs/`)                         |
| `planned/`      | None             | Planned design stubs and cross-package pointers with no formal model yet                          | Any document that is ratified or implementation-authoritative |
| `tla/`          | Model-checked    | TLA+ model files and configs for primitive protocols                                              | English specs (those go in `specs/` or `planned/`)            |

## Contents by zone

### `specs/`: Ratified formal specifications

- [`hot-lane-codec-and-layout-spec.md`](./specs/hot-lane-codec-and-layout-spec.md)  
  Planner algorithm, layout rules, bind-time validation, and conformance corpus for the hot lane.  
  **Status: Ratified. Implementation-authoritative.**

### `architecture/`: Architectural decisions and design rationale

- [`transport-architecture.md`](./architecture/transport-architecture.md)  
  Mailbox vs ring transport decision for RT lane communication.  
  **Status: Architecture note. Not a ratified spec.**

### `planned/`: Design stubs and cross-package pointers

- [`command-ring-protocol.md`](./planned/command-ring-protocol.md)  
  Planned formalization target for a bounded FIFO SPSC ring.  
  **Status: Planned. No formal model exists yet. Aspirational only.**

- [`seqlok-core-protocol.md`](./planned/seqlok-core-protocol.md)  
  Cross-package pointer to `@seqlok/core` coherence protocol (LU/MU seqlock).  
  **Status: Draft design. Actual formal artifacts will live under `packages/core`.**

### `tla/`: TLA+ model files

The primitive `LatestMailboxProtocol` module models an SPSC latest-wins mailbox. It is used as a building block by the experimental `mailbox-latest` policy. It stays in primitives because it is a reusable protocol primitive, not a policy model.

- [`LatestMailboxProtocol.tla`](./tla/LatestMailboxProtocol.tla)
- [`LatestMailboxProtocol.cfg`](./tla/LatestMailboxProtocol.cfg)
- [`LatestMailboxProtocol.invonly.cfg`](./tla/LatestMailboxProtocol.invonly.cfg)

## How to read this directory

1. If you are implementing hot-lane code, read `specs/hot-lane-codec-and-layout-spec.md` first.
2. If you are choosing a transport for RT commands, read `architecture/transport-architecture.md` for design rationale.
3. If you are planning future formalization work, check `planned/` to see what has not been modeled yet.
4. Do not treat anything in `planned/` or `architecture/` as implementation-authoritative.

## See also

- [`../policies/single/`](../policies/single/): supported base policy
- [`../policies/reject-busy/`](../policies/reject-busy/): supported Level 2 policy
- [`../policies/persistent-handoff/`](../policies/persistent-handoff/): continuity-class model
- [`../experimental/mailbox-latest/`](../experimental/mailbox-latest/): experimental policy
