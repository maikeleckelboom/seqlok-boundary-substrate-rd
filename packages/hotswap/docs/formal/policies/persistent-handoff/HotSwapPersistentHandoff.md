# Hot-Swap Protocol: Persistent Handoff

**Status:** Implemented  
**Scope:** Continuity-class persistent handoff for `@seqlok/hotswap`  
**Audience:** Seqlok contributors, hotswap implementers, and TLA+ authors

This document describes the current formal specification for **persistent continuity**
during a structural engine swap.

Persistent continuity means:

- The outgoing engine exports a handoff snapshot.
- The incoming engine installs that snapshot.
- The runtime advances the incoming engine through deterministic replay from the
  capture frame to the crossfade start.
- The swap reaches crossfade only after replay obligations are satisfied.
- The protocol does not silently degrade when persistent continuity is required.

This is **not** an overlap-policy model.
Overlap policy (`single`, `reject-busy`) is a separate axis.
This model is the continuity-class surface for the **successful persistent-handoff path**.

## Files

```text
packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.tla
packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.cfg
packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.invonly.cfg
```

- `.tla` contains the TLA+ protocol model.
- `.cfg` runs safety plus liveness.
- `.invonly.cfg` runs safety only.

## Exact scope of the current model

The current model is intentionally narrow.

It models:

- persistent continuity only
- one admitted handoff per behavior
- the successful path:

  - `spawn`
  - `capture`
  - `install`
  - `catchup`
  - optional `prewarm`
  - `crossfade`
  - `retire`

It does not model:

- aligned continuity admission
- explicit downgrade branches
- explicit abort branches
- overlap handling or host-side queueing policy
- waveform similarity or psychoacoustic correctness
- engine-internal snapshot format

That narrower scope is intentional. The model exists to prove the lifecycle legality
and gating rules of the successful persistent-handoff path, not the full future
continuity surface.

## Lifecycle

The current persistent lifecycle is:

```text
spawn -> capture -> install -> catchup -> prewarm -> crossfade -> retire -> idle
```

`prewarm` is optional. If no prewarm blocks are required, the model transitions
from `catchup` directly to `crossfade`.

### Phase semantics

#### `spawn`

Create the candidate engine instance.

#### `capture`

Export a handoff snapshot from the outgoing engine at a known frame boundary.

Requirements:

- RT-safe
- bounded
- tied to the outgoing engine lineage and admitted handoff

#### `install`

Install the captured snapshot into the candidate engine.

In the current model, `install` represents the **successful** install path only.

#### `catchup`

Advance the candidate engine from the capture frame to the crossfade start by replaying input.

Requirements:

- deterministic replay window
- correct lineage
- output discarded during replay

#### `prewarm`

Run the candidate engine on real input while discarding output until stable.

#### `crossfade`

Run both engines in parallel on the same input and blend.

#### `retire`

Retire the outgoing engine only after install and replay obligations are satisfied.

## Safety invariants

The current model checks these invariants:

| Property                       | Description                                                  |
| ------------------------------ | ------------------------------------------------------------ |
| `TypeOK`                       | All state variables remain in valid domains                  |
| `AtMostTwoEngines`             | No more than two engines are active at any time              |
| `NoGapDuringCrossfade`         | Both engines are active during crossfade                     |
| `CrossfadeEnginesDistinct`     | Crossfade never uses the same engine in both roles           |
| `NoSilentDowngrade`            | Persistent-required swaps do not degrade silently            |
| `SnapshotLineageConsistency`   | Snapshot state is only present in legal persistent phases    |
| `RetireAfterPersistentInstall` | Retire implies install and replay obligations were satisfied |
| `NoCrossfadeBeforeReplay`      | Crossfade implies replay has completed                       |

## Liveness properties

The full configuration additionally checks:

| Property                           | Description                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `EventuallyIdle`                   | Every admitted swap eventually returns to idle                                              |
| `PersistentSwapEventuallyResolves` | Every admitted persistent swap eventually returns to idle on the successful persistent path |
| `NoCaptureLivelock`                | The protocol does not remain in `capture` forever                                           |
| `NoInstallLivelock`                | The protocol does not remain in `install` forever                                           |
| `NoCatchupLivelock`                | The protocol does not remain in `catchup` forever                                           |
| `NoLivelockPrewarm`                | The protocol does not remain in `prewarm` forever                                           |
| `NoLivelockCrossfade`              | The protocol does not remain in `crossfade` forever                                         |

`PersistentSwapEventuallyResolves` in the current model means successful completion of the admitted persistent handoff.
It does **not** prove abort or downgrade behavior, because those branches are not yet modeled.

## Running the model

From the repository root:

```bash
pnpm tla:hotswap -- --policy persistent-handoff
pnpm tla:hotswap:full -- --policy persistent-handoff
```

Direct TLC invocation:

```bash
java -jar tla2tools.jar \
  -config packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.cfg \
  packages/hotswap/docs/formal/policies/persistent-handoff/tla/HotSwapPersistentHandoff.tla
```

Use the `.invonly.cfg` file for a faster invariants-only run.

## Relationship to overlap policy

This model is orthogonal to overlap policy.

- `single` proves the base aligned swap lifecycle.
- `reject-busy` proves a host-side overlap policy.
- `persistent-handoff` proves the continuity-class lifecycle inside an admitted persistent swap.

This model is not the owner of scheduling, overlap rejection, mailboxing, or request admission policy.

## Relationship to implementation

The persistent-handoff protocol corresponds to the continuity-class decision in
`../../adr/hotswap-continuity-classes-and-persistent-handoff.md`.

Implementation mapping:

- `capture` corresponds to engine-side handoff export
- `install` corresponds to engine-side handoff import
- `catchup` corresponds to replay advancement
- `NoSilentDowngrade` corresponds to runtime enforcement of continuity requirements

The current runtime does not yet expose the full persistent-handoff lifecycle as a landed runtime surface.
This formal model should therefore be read as the checked protocol contract for the successful persistent path, ahead of full runtime implementation.

## Future work

Future model work may add:

- explicit install failure branches
- explicit catchup failure branches
- explicit downgrade rules
- explicit abort rules
- composition with overlap-policy models

Those are separate extensions, not part of the currently checked surface.

## References

- `../single/HotSwapSingle.md`
- `../reject-busy/HotSwapRejectBusy.md`
- `../../adr/hotswap-continuity-classes-and-persistent-handoff.md`
- Lamport, _Specifying Systems_
