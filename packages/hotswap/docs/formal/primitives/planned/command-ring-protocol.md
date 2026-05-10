# Command Ring Protocol (planned)

> **Artifact type:** Planned design stub. No formal model exists yet.  
> **Authority:** None. Not ratified. Not implemented. Aspirational only.  
> **Layer:** Formal primitives, planned  
> **Use for:** Understanding what formal artifacts are intended when this protocol is designed  
> **Must not be mistaken for:** A ratified spec or an implementation guide. No code should depend on this until the TLA+ model and English spec land.

**Status:** Planned  
**Scope:** SPSC command ring used for RT command delivery (tickets, etc.)

This is the intended formalization target for a bounded FIFO ring transport:

- **FIFO**: consumed order matches produced order
- **No corruption**: no phantom reads, no duplication
- **Bounded capacity** with explicit full-ring behavior (reject / overwrite-oldest, etc.)

## Planned artifacts

```text
packages/hotswap/docs/formal/primitives/tla/CommandRingProtocol.tla
packages/hotswap/docs/formal/primitives/tla/CommandRingProtocol.cfg
```

## Target invariants (sketch)

- `TypeOK`
- `CapacityBound` (writeIndex - readIndex <= CAPACITY)
- `FIFOOrdering` (consumed = SubSeq(produced, 1, Len(consumed)))
- `NoPhantomRead`
