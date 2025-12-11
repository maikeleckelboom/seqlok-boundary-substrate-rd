# Command Ring Protocol – Formal Specification Stub

**Status:** Planned – TLA+ module not yet implemented  
**Scope:** Single-producer / single-consumer (SPSC) command ring used for real-time command delivery  
**Audience:** Seqlok contributors, `@seqlok/commands` implementers, and TLA+ authors

This document describes the intended formal model for the Seqlok SPSC command
ring, which transports commands (including hot-swap tickets) from host-side
code to real-time consumers.

The focus is on:

- Preservation of FIFO order.
- Absence of corruption (no lost, duplicated, or phantom commands).
- Bounded capacity with explicit backpressure.
- Lock-free, wait-free behavior on the real-time consumer side.

---

## 1. Planned Formal Artifacts

The following artifacts are planned:

```text
formal/tla/CommandRingProtocol.tla     # TLA+ model of the ring
formal/tla/CommandRingProtocol.cfg     # TLC configuration
archive/command-ring-test-vectors.json # Cross-language conformance traces
````

The model will conceptually correspond to the `@seqlok/commands` SPSC ring.

---

## 2. Informal State Model

### 2.1 Buffer state

* `CAPACITY : Nat` (constant)
  Ring capacity; typically small in the TLC model (e.g. 3–4).

* `Slot == {Empty} ∪ Command`
  Abstract slot content type.

* `buffer : [0..CAPACITY-1 → Slot]`
  Fixed-size array of slots.

Notes:

* `Command` is an abstract type (e.g. opcode + payload). The model does not
  require the full Dekzer command schema.
* `Empty` is a distinguished value that cannot coincide with any command.

### 2.2 Index state

* `writeIndex : Nat`
  Monotonic producer cursor; slot index derived as `writeIndex % CAPACITY`.

* `readIndex : Nat`
  Monotonic consumer cursor; slot index derived as `readIndex % CAPACITY`.

Using unbounded indices simplifies reasoning about wrap-around and capacity.

### 2.3 Auxiliary state

The model maintains logical histories:

* `produced : Seq(Command)`
  Sequence of commands successfully enqueued.

* `consumed : Seq(Command)`
  Sequence of commands successfully dequeued.

Optional (for future variants):

* `rejected : Nat`
  Count of rejected producer attempts (e.g. ring full).

These variables simplify the statement of ordering properties:

```tla
FIFOOrdering ==
    consumed = SubSeq(produced, 1, Len(consumed))
```

---

## 3. Behavior Model

The protocol is modeled with producer and consumer actions.

### 3.1 Producer actions

**`ProducerEnqueue(cmd)`**

Represents an attempt to enqueue a command.

Preconditions and behavior depend on the policy:

* Let `liveCount == writeIndex - readIndex`.

**Strict “ring full” rejection:**

* If `liveCount = CAPACITY`:

  * Enqueue fails; `buffer`, `writeIndex`, and `produced` remain unchanged.
  * `rejected` may increase.
* Otherwise:

  * Slot index `i == writeIndex % CAPACITY` must contain `Empty`.
  * `buffer'[i]` becomes `cmd`.
  * `writeIndex' = writeIndex + 1`.
  * `produced' = Append(produced, cmd)`.

Other policies (e.g. overwrite-oldest) can be modeled as alternative actions in
future variants.

### 3.2 Consumer actions

**`ConsumerDequeue`**

Represents a consumer attempt to dequeue a command.

* If `readIndex = writeIndex` (ring empty):

  * No command is available; state unchanged.
* Otherwise:

  * Slot index `i == readIndex % CAPACITY` must contain a command `cmd`.
  * `buffer'[i] = Empty`.
  * `readIndex' = readIndex + 1`.
  * `consumed' = Append(consumed, cmd)`.

---

## 4. Safety Properties (Target)

The formal model is intended to prove at least the following invariants.

1. **TypeOK**

   All variables remain in their declared domains.

2. **NoOverwrite**

   The producer never overwrites unread commands:

   ```tla
   LiveCount == writeIndex - readIndex
   NoOverwrite == LiveCount <= CAPACITY
   ```

   Together with the enqueue rules, this ensures that a write never targets a
   non-empty slot that has not yet been consumed.

3. **NoPhantomRead**

   Every consumed command must originate from a successful enqueue:

* Each element of `consumed` appears somewhere in `produced`.
* No value is read from a slot that was never written by the producer.

4. **FIFOOrdering**

   Consumption order matches production order:

   ```tla
   FIFOOrdering ==
       consumed = SubSeq(produced, 1, Len(consumed))
   ```

5. **SingleOwnership**

   For any slot index `i`:

* At most one command is “live” in that slot at a time.
* After a command is consumed, the slot returns to `Empty` before reuse.

6. **CapacityBound**

   The number of live commands in the ring never exceeds `CAPACITY`:

   ```tla
   LiveCount <= CAPACITY
   ```

---

## 5. Liveness Properties (Target)

Under suitable fairness assumptions, the following liveness properties are
intended:

* **EventuallyConsumable**

  If a command is successfully enqueued and the consumer continues to step,
  that command eventually becomes available and is consumed.

* **NoStuckProducer**

  If at least one slot is free and the producer attempts to enqueue, the model
  eventually admits a successful `ProducerEnqueue` step.

* **NoStuckConsumer**

  If at least one command is live in the ring and the consumer attempts to
  dequeue, the model eventually admits a successful `ConsumerDequeue` step.

Liveness will be constrained in the `.cfg` file by limiting:

* Maximum total steps (behavior length).
* Maximum number of produced commands.

---

## 6. Relationship to Implementation

The formal model is intended to correspond to the SPSC ring in
`@seqlok/commands` as follows:

* `buffer` corresponds to the underlying `SharedArrayBuffer` / typed array used
  to store encoded commands.
* `writeIndex` and `readIndex` correspond to producer and consumer cursors
  stored in the ring header.
* `produced` / `consumed` correspond to logical histories that can be
  reconstructed from instrumentation in tests.

The model is not required to match internal encodings (e.g. sentinel opcodes);
it is required only to match the externally observable behavior described by
the properties above.

---

## 7. Expected TLA+ Module Skeleton (Non-normative)

An eventual TLA+ module is expected to follow this general structure:

```tla
---- MODULE CommandRingProtocol ----
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    CAPACITY

VARIABLES
    buffer, writeIndex, readIndex,
    produced, consumed, rejected

vars == << buffer, writeIndex, readIndex, produced, consumed, rejected >>

TypeOK == ...
Init == ...
ProducerEnqueue(cmd) == ...
ConsumerDequeue == ...

Next ==
    \/ \E cmd \in Command : ProducerEnqueue(cmd)
    \/ ConsumerDequeue

NoOverwrite == ...
FIFOOrdering == ...
NoPhantomRead == ...
CapacityBound == ...
SingleOwnership == ...

Safety ==
    TypeOK /\ NoOverwrite /\ FIFOOrdering /\ NoPhantomRead /\ CapacityBound /\ SingleOwnership

Fairness == WF_vars(Next)

EventuallyConsumable == ...
NoStuckProducer == ...
NoStuckConsumer == ...

Spec == Init /\ [][Next]_vars /\ Fairness

THEOREM Spec => []Safety
THEOREM Spec => EventuallyConsumable

====
```

This skeleton is illustrative; the authoritative behavior is defined by the
state, actions, and properties described in the previous sections.
