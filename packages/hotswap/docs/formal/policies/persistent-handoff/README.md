# Policy: `persistent-handoff`

Continuity-class model for **persistent handoff** between engines.

This model is orthogonal to the overlap-policy models (`single`, `reject-busy`).
It proves the lifecycle and gating rules of the **successful persistent-handoff path**:
capture, install, catchup, optional prewarm, crossfade, and guarded retire.

## Status

This policy is implemented as a checked TLA+ surface with:

- English spec
- invariants-only config
- full safety plus liveness config

The current model is intentionally narrow:

- persistent continuity only
- one admitted handoff per behavior
- successful path only

## Contents

- **English spec**: [`HotSwapPersistentHandoff.md`](./HotSwapPersistentHandoff.md)
- **TLA+**: [`tla/HotSwapPersistentHandoff.tla`](./tla/HotSwapPersistentHandoff.tla)
- **TLC configs**:

  - Full: [`tla/HotSwapPersistentHandoff.cfg`](./tla/HotSwapPersistentHandoff.cfg)
  - Invariants-only: [`tla/HotSwapPersistentHandoff.invonly.cfg`](./tla/HotSwapPersistentHandoff.invonly.cfg)

## What this model proves

- capture, install, catchup, prewarm, crossfade, and retire are legally ordered
- snapshot state appears only in legal persistent phases
- retire is gated on successful install and replay
- crossfade does not begin before replay is complete
- no silent downgrade occurs on the modeled successful path
- at most two engines are active at any time
- the admitted persistent handoff eventually returns to idle

## What this model does not prove

- explicit downgrade branches
- explicit abort branches
- overlap-policy behavior
- waveform similarity or psychoacoustic transparency
- algorithm-internal numerical stability
- time-stretch quality

Those remain future model work or engine-level conformance concerns.

## Relationship to overlap policy

The persistent-handoff model can be composed conceptually with either `single` or `reject-busy`.
The overlap policy governs whether a request is admitted.
The continuity class governs what happens inside an admitted persistent swap.

This model owns the continuity-class protocol only.
It does not own host scheduling policy.
