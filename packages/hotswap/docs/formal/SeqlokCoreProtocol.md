# Seqlok Core Protocol – Coherence Specification (Design Stub)

**Status:** Draft design – TLA+ module not yet implemented  
**Scope:** Coherence protocol for `@seqlok/core` parameters and meters (LU/MU seqlock)  
**Audience:** Seqlok contributors, `@seqlok/core` implementers, and TLA+ authors

This document defines the logical behavior of the seqlock-based coherence
protocol used by `@seqlok/core`:

- **Parameters:** controller → processor (real-time thread)
- **Meters:** processor → observers (host/UI)

The aim is to specify:

- **Safety:** conditions that must hold in every reachable state.
- **Liveness:** conditions that eventually hold under reasonable assumptions.

A future TLA+ module will encode this behavior and be checked with TLC.

---

## 1. Role in the Architecture

The protocol underlies the following public APIs:

- `params.set(key, value)`
- `params.update(patch)`
- `params.stage(key, cb)` – RAII-style array writes
- `params.within(cb)` – coherent reads on the real-time side
- `meters.publish(cb)` – coherent meter writes on the real-time side
- `meters.snapshot(...)` – coherent meter reads on host/observers

Design constraints:

- **Single writer, multiple readers (SWMR)** per side:
  - Controller is the sole writer of parameters.
  - Processor is the sole writer of meters.
- **Lock-free:** no blocking on the real-time thread.
- **Coherent snapshots:** readers observe whole generations, never torn states.

---

## 2. Planned Formal Artifacts

The formal model is expected to be located under `@seqlok/core`:

```text
packages/core/docs/formal/tla/SeqlokCoreProtocol.tla
packages/core/docs/formal/tla/SeqlokCoreProtocol.cfg
packages/core/docs/formal/core-test-vectors.json
````

* `.tla` – TLA+ module defining the protocol.
* `.cfg` – model-checking configuration (constants, invariants, properties).
* `.json` – test vectors / traces consumable by TypeScript/Rust harnesses.

This document serves as the English reference for those artifacts.

---

## 3. Informal State Model

The TLA+ spec will track an abstract state. This is not a memory layout; it is a
logical model that implementations must emulate.

### 3.1 Parameters state (controller → processor)

* `paramsScalars : [ParamKey → Value]`
  Committed scalar parameter values.

* `paramsArrays : [ArrayKey → Seq(Value)]`
  Committed array parameter values.

* `paramsVersion : Nat`
  Logical “LU” counter. Even = stable, odd = write in progress.

* `stagingArrays : [ArrayKey → Seq(Value) ∪ {NULL}]`
  Staged arrays during a `params.stage(key, cb)` operation.

* `stagingActive : BOOLEAN`
  Indicates whether a staging block is active in the model.

Model simplification:

* At most one staging block is active at a time.
* Production implementations may support multiple staged arrays, provided that
  each commit still corresponds to a single LU bump and that snapshots remain
  coherent.

### 3.2 Meters state (processor → observers)

* `metersScalars : [MeterKey → Value]`
  Committed scalar meter values.

* `metersArrays : [ArrayKey → Seq(Value)]`
  Committed array meter values.

* `metersVersion : Nat`
  Logical “MU” counter. Even = stable, odd = publish in progress.

* `publishActive : BOOLEAN`
  Indicates an active `meters.publish` block.

* `meterStagingScalars : [MeterKey → Value ∪ {NULL}]`
  Staged scalar meter values during publish.

* `meterStagingArrays : [ArrayKey → Seq(Value) ∪ {NULL}]`
  Staged array meter values during publish.

Staging accumulates writes; MU is bumped exactly once when a publish commits.

### 3.3 Reader state

A generic reader is modeled with bounded retry. Two roles share this machinery:

* Parameter reader on the processor side (`params.within`).
* Meter reader on host/observers (`meters.snapshot`).

State:

* `readerState ∈ {"idle", "reading", "retrying"}`
* `readerVersionBefore : Nat`
* `readerBuffer : [Key → Value ∪ {INCOMPLETE}]`
* `retryCount : Nat` (bounded in the model)

Implementation notes:

* The processor-side parameter reader may choose to use stale data rather than
  retry; the model over-approximates with retries to reason about coherence.
* Observer-side meter readers are expected to retry until a stable snapshot is
  obtained.

---

## 4. Behaviour Model

The following actions describe the logical behavior. TLA operators will encode
them as next-state relations.

### 4.1 Controller actions – parameter writer

These correspond to `params.set`, `params.update` and `params.stage`.

**`ControllerSetParam(k, v)`**

* Preconditions:

  * `k ∈ ParamKey`.
* Effects:

  * `paramsVersion` transitions even → odd → even (one LU bump).
  * `paramsScalars[k]` is updated.

**`ControllerUpdateParams(patch)`**

* Applies a finite patch to `paramsScalars` and/or `paramsArrays`.
* All changes are visible as a single generation.
* Exactly one LU bump for the full patch.

**`ControllerStageArrayBegin(k)`**

* Preconditions:

  * `stagingActive = FALSE`.
  * `k ∈ ArrayKey`.
* Effects:

  * `stagingActive' = TRUE`.
  * `stagingArrays[k]` initialized from `paramsArrays[k]`.

**`ControllerStageArrayWrite(k, idx, v)`**

* Preconditions:

  * `stagingActive = TRUE`.
* Effects:

  * Staging buffer for `k` is mutated at `idx`.

**`ControllerStageArrayCommit`**

* Preconditions:

  * `stagingActive = TRUE`.
* Effects:

  * `paramsArrays` updated from `stagingArrays`.
  * `paramsVersion` increments by 2 (odd → even).
  * `stagingActive' = FALSE`, staging cleared.

**`ControllerStageArrayAbort`**

* Preconditions:

  * `stagingActive = TRUE`.
* Effects:

  * Staging state cleared, no LU bump.

### 4.2 Processor actions – parameter reader and meter writer

These model `params.within` and `meters.publish`.

#### Parameters (`params.within`)

**`ProcessorWithinBegin`**

* Captures `paramsVersion` into `readerVersionBefore`.
* Requires the captured version to be even.
* Sets `readerState' = "reading"`.

**`ProcessorWithinRead(k)`**

* Copies `paramsScalars[k]` or `paramsArrays[k]` into `readerBuffer[k]`.
* Valid only in `"reading"`.

**`ProcessorWithinEnd`**

* Checks whether `paramsVersion` is unchanged and even.
* If unchanged:

  * Snapshot is coherent.
* If changed:

  * Model may transition to `"retrying"` with increased `retryCount`.
  * Actual runtime behavior may use the stale snapshot; the model remains a
    conservative over-approximation.

#### Meters (`meters.publish`)

**`ProcessorPublishBegin`**

* Preconditions:

  * `publishActive = FALSE`.
* Effects:

  * `metersVersion` becomes odd.
  * `publishActive' = TRUE`.

**`ProcessorPublishScalar(k, v)`**

* Writes staged scalar meter value for `k`.

**`ProcessorPublishArrayStage(k, mutator)`**

* Applies `mutator` to the staged array for `k`.

**`ProcessorPublishCommit`**

* Preconditions:

  * `publishActive = TRUE`.
* Effects:

  * Meters updated from staging.
  * `metersVersion` increments by 2 and becomes even.
  * Staging cleared.
  * `publishActive' = FALSE`.

### 4.3 Observer actions – meter reader

These model `meters.snapshot(...)`.

**`ObserverSnapshotBegin`**

* Captures `metersVersion` in `readerVersionBefore`.
* Sets `readerState' = "reading"`.

**`ObserverSnapshotRead(k)`**

* Copies meter values for `k` into `readerBuffer[k]`.

**`ObserverSnapshotEnd`**

* If `metersVersion` is unchanged and even:

  * Snapshot is accepted; `readerState' = "idle"`.
* Otherwise:

  * Snapshot is rejected; `readerState' = "retrying"`, `retryCount` increases.

---

## 5. Safety Properties

The protocol is intended to satisfy the following invariants in all reachable
states.

* **TypeOK**
  All variables remain within their declared domains.

* **VersionsEvenWhenStable**
  If `stagingActive = FALSE` and `publishActive = FALSE`, both `paramsVersion`
  and `metersVersion` are even.

* **NoTornParamSnapshots**
  Any completed `within` window observes either:

  * all parameter values from a single pre-write generation, or
  * all parameter values from a single post-write generation,
    but never a mix.

* **NoTornMeterSnapshots**
  Analogous property for meter snapshots.

* **MonotoneParamsVersion**
  `paramsVersion` never decreases.

* **MonotoneMetersVersion**
  `metersVersion` never decreases.

* **StageCommitBumpsExactlyOnce**
  Each successful staged array commit corresponds to exactly one LU bump.

* **PublishBumpsExactlyOnce**
  Each successful publish corresponds to exactly one MU bump.

* **SnapshotSeesCommittedOnly**
  Reader buffers contain only committed values. Staged-but-uncommitted values
  do not leak into snapshots.

* **NoNestedStaging (model-level)**
  At most one staging block is active in the model.

* **NoNestedPublish (model-level)**
  At most one publish block is active in the model.

---

## 6. Liveness Properties and Assumptions

### 6.1 Target liveness properties

* **EventuallySnapshotSucceeds**
  Under quiescent writers, snapshots eventually succeed.

* **NoInfiniteRetryOnStableData**
  If parameters/meters stabilize, readers do not retry indefinitely.

* **EventuallyPublishVisible**
  Once a publish commits, subsequent snapshots eventually reflect the new
  meters.

* **EventuallyParamVisible**
  Once a parameter write completes, subsequent `within` windows eventually
  reflect the updated parameters.

* **StagingEventuallyResolves**
  Every staging or publish block eventually commits or aborts.

### 6.2 Assumptions

To reason about liveness, the model assumes:

1. Writers eventually either complete or quiesce (no perpetually open staging or
   publish blocks).
2. Fair scheduling of reader and writer actions (`WF_vars(Next)` style).
3. Bounded retry (`MAX_RETRY` or equivalent), or eventual stabilization of
   versions when writers quiesce.

These assumptions will be reflected in the `.cfg` configuration and comments in
the `.tla` module.

---

## 7. Mapping to `@seqlok/core` API

Correspondence between spec concepts and API:

| Spec concept / action    | `@seqlok/core` API            |
|--------------------------|-------------------------------|
| `ControllerSetParam`     | `params.set(key, value)`      |
| `ControllerUpdateParams` | `params.update(patch)`        |
| `ControllerStageArray*`  | `params.stage(key, cb(view))` |
| `ProcessorWithin*`       | `params.within(cb)`           |
| `ProcessorPublish*`      | `meters.publish(cb(writer))`  |
| `ObserverSnapshot*`      | `meters.snapshot(...)`        |

Implementation requirements:

* One LU bump per logical parameter write (set/update/stage+commit).
* One MU bump per meter publish.
* Parameter readers observe coherent generations.
* Meter readers observe coherent generations or retry until they do.

Range policy (`"clamp" | "reject"`) is out of scope for this protocol and is
treated as a value-level concern.

---

## 8. TLA+ Module Skeleton (Non-normative)

The eventual TLA+ module is expected to resemble the following structure:

```tla
---- MODULE SeqlokCoreProtocol ----
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    PARAM_KEYS, ARRAY_PARAM_KEYS,
    METER_KEYS, ARRAY_METER_KEYS,
    MAX_ARRAY_LEN,
    MAX_RETRY

VARIABLES
    paramsScalars, paramsArrays, paramsVersion,
    stagingArrays, stagingActive,
    metersScalars, metersArrays, metersVersion,
    publishActive, meterStagingScalars, meterStagingArrays,
    readerState, readerVersionBefore, readerBuffer, retryCount

vars == << ... >>

TypeOK == ...
Init == ...
Next == ...

Safety == ...
Fairness == WF_vars(Next)

EventuallySnapshotSucceeds == ...
NoInfiniteRetryOnStableData == ...

Spec == Init /\ [][Next]_vars /\ Fairness

THEOREM Spec => []Safety
THEOREM Spec => EventuallySnapshotSucceeds

====
```

This skeleton is illustrative only. The authoritative behavior is defined by
the properties in the preceding sections.
