# Seqlok Origin & Design History

> A short backstory: what problems Seqlok set out to solve, and which design bets shaped the architecture you see in the rest of these docs.

This document is **background**, not a spec.
The normative design docs start at `01-...`.
Think of this as the director's commentary track.

---

## 1. Where Seqlok came from

Seqlok grew out of a specific pain:

- real-time code runs in its own thread or worklet
- UI lives on the main thread
- `postMessage` plus JSON is too slow, too allocation-heavy, and too vague for hot-path shared state

We wanted:

- shared state between UI and real-time execution
- zero allocation in the hot path
- no locks, but coherent snapshots
- type safety from authored contract to runtime binding

The obvious building blocks were:

- `SharedArrayBuffer` plus typed arrays
- `Atomics`
- a concurrency discipline small enough to reason about

Everything else in Seqlok is layered on top of that starting point.

---

## 2. Early bets that stayed durable

From the beginning, a few decisions proved stable.

### 2.1 Two SWMR domains

We drew a hard line between two domains:

- **params**: controller writes, processor and observer read
- **meters**: processor writes, controller and observer read

This keeps ownership legible.
It also keeps the concurrency story narrow enough to stay honest.

### 2.2 Planned layout instead of offset folklore

We refused to let layout become a pile of implicit offsets and hidden assumptions.

That led to the explicit `spec → plan → backing → handoff → binding` model.

### 2.3 Fail-fast, explicit errors

We chose a fail-fast error model.

- if spec and plan do not match, throw
- if plan and backing do not match, throw
- if the handoff does not pass the trust boundary, throw
- if a role is used illegally, throw

At this layer, silent recovery is usually just delayed corruption.

### 2.4 Layering is non-negotiable

We kept a strict dependency direction:

```text
primitives → spec → plan → backing → handoff → binding → orchestration/helpers
```

The goal is simple:

- no god objects
- no cycles
- no hidden ownership lies

---

## 3. How to read the rest of the docs

If you want the architecture in a sensible order:

1. `01-seqlok-goals-and-non-goals.md`
   Why the library exists and where its boundaries are.

2. `02-seqlok-intellectual-heritage.md`
   The ideas it builds on and the concepts it adapts.

3. `03-seqlok-concurrency-model-and-roles.md`
   The runtime ownership model: controller, processor, observer, params, meters.

4. `04-seqlok-dsl-overview-and-rationale.md`
   The authored-contract model and the authoring surfaces.

5. `07-seqlok-api-shape-rationale.md`
   Why the kernel surface is explicit about `spec → plan → backing → handoff → binding`.

6. `08-seqlok-api-and-naming-rationale.md`
   Why the public names and verbs are what they are.

7. `09-seqlok-api-reference.md`
   The current public surface.

8. `10-seqlok-primitives-and-seqlock.md`
   The primitive concurrency vocabulary.

9. `11-seqlok-backing-and-plane-layout.md`
   How layout becomes actual shared memory.

10. `12-coherent-reads-and-planes.md`
    How roles obtain coherent reads and which guarantees they get.

11. `15-seqlok-error-system-and-fail-fast-philosophy.md`
    Why failures are structured and immediate.

12. `16-seqlok-e2e-flow-visual-guide.md`
    A visual pass over the end-to-end flow.

13. `17-hot-vs-cold-path-design-philosophy.md`
    The temperature doctrine for public API design.

This `00` document is only the bit of story glue before the real doctrine begins.
