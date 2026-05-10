# Seqlok: Goals and Non-Goals

**Purpose:** Define what Seqlok is for, what it owns, and what it explicitly refuses to become.

---

## Problem statement

Seqlok exists for systems that need to coordinate state across an execution boundary where the two sides do not live under the same runtime conditions.

Examples:

- **UI / host thread** ↔ **real-time audio processing**
- **main thread** ↔ **compute worker**
- **JavaScript** ↔ **shared WebAssembly memory**
- **engine loop** ↔ **visualization / telemetry surface**

Those boundaries are hard for the same recurring reasons:

- one side wants ergonomics
- the other side wants bounded latency
- the shared state still has to remain coherent enough to reason about

Naive approaches fail in predictable ways:

- `postMessage` copies too much and schedules too loosely
- raw `SharedArrayBuffer + Atomics` is too easy to wire incorrectly
- ad hoc offsets turn into folklore, coupling, and silent drift

Seqlok fills a narrower gap than generic state management:

> an authored contract that becomes a deterministic shared-memory runtime contract, with explicit role bindings across a boundary

Seqlok sits below app semantics and above raw shared-memory primitives.
It is not your domain model.
It is the coordination kernel your domain model can rely on.

---

## Core model

Seqlok begins with an authored contract.

That contract is normalized into a validated runtime contract.
From there, Seqlok derives:

- a deterministic plan
- a backing realization
- an explicit handoff across the boundary
- role-specific bindings

The mental model is:

```text
authored contract
  → defineSpec(...)
    → validated runtime contract
      → planLayout(...)
        → backing
          → handoff
            → accepted handoff
              → role bindings
```

Those role bindings are not only controller and processor.
Seqlok has three first-class roles:

- **Controller** writes params and reads meters
- **Processor** reads params and writes meters
- **Observer** reads params and meters

That is the runtime ownership model the library is shaped around.

---

## Core goals

### 1. Bounded, real-time-friendly coordination

Seqlok is designed so the time-sensitive side of a system can operate against shared state without inheriting general-purpose application-state costs.

That means:

- no lock-based coordination in the hot path
- no hidden kernel allocations inside hot-path primitives
- bounded retry and spin behavior
- deterministic memory layout
- coherent snapshots instead of torn multi-field reads

This is why Seqlok uses per-domain seqlock discipline and explicit role ownership instead of queues pretending to be state.

---

### 2. Coherent shared-state exchange

When a role reads a Seqlok domain coherently, it should see one stable domain view rather than an accidental mixture of old and new bytes.

That matters whenever multiple values only make sense together.

Examples:

- a time ratio and the coefficients derived from it
- a mode enum and the array data interpreted under that mode
- a meter frame that belongs to one processor commit

The goal is not "latest at all costs."
The goal is coherent enough to reason about.

---

### 3. One explicit writer per domain

Seqlok is built on strict per-domain SWMR ownership.

- **Param domain**

  - writer: controller
  - readers: processor, observer

- **Meter domain**
  - writer: processor
  - readers: controller, observer

This is not a usage hint.
It is the law that keeps the concurrency model tractable.

If a use case needs multiple writers to the same domain, that is outside Seqlok's intended shape.

---

### 4. Authored contract first

Seqlok is not "a typed callback DSL."
It begins with an authored contract.

That contract may be authored through:

- a plain object / AST-style shape
- a builder callback for premium TypeScript ergonomics

Those are authoring surfaces, not competing contract systems.

The important boundary is that authored meaning becomes explicit and normalized before planning begins.
That gives Seqlok:

- cleaner ownership
- better tooling possibilities
- a portable contract shape
- one semantic boundary instead of several half-boundaries

---

### 5. Deterministic runtime contract and plan

Given the same authored meaning, Seqlok should produce the same validated runtime contract and the same plan.

That means:

- the same canonical field identity
- the same normalized ranges and shapes
- the same layout plan
- the same compatibility metadata

This is why the contract stays narrow:

- fixed-length arrays
- closed enum vocabularies
- scalar numeric ranges
- no runtime field growth

Determinism here is not aesthetic.
It is what makes handoff, compatibility checks, diagnostics, and multi-agent reasoning possible.

---

### 6. Human-facing authored structure, singular runtime identity

Seqlok accepts nested authored structure because humans need structure.

Example:

```ts
const spec = defineSpec(({ param, meter }) => ({
  id: "lane",
  params: {
    transport: {
      timeRatio: param.f32({ min: 0.25, max: 4 }),
      mode: param.enum(["normal", "granular"]),
    },
    mixer: {
      eqBands: param.f32.array({ length: 8 }),
    },
  },
  meters: {
    output: {
      rms: meter.f32(),
      peak: meter.f32(),
    },
  },
}));
```

But nested authored structure is not the ABI identity model.

Canonical runtime keys are:

```ts
spec.params["transport.timeRatio"];
spec.params["transport.mode"];
spec.params["mixer.eqBands"];
spec.meters["output.rms"];
spec.meters["output.peak"];
```

That split is intentional:

- structural authorship for humans
- one canonical flat identity model for runtime

Seqlok does not tolerate two competing runtime identity systems.

---

### 7. Explicit role bindings across the boundary

Seqlok does not stop at planning memory.
It exposes explicit role bindings that encode the runtime ownership model.

Canonical flow:

```ts
import {
  defineSpec,
  planLayout,
  allocateShared,
  buildHandoff,
  acceptHandoff,
  bindController,
  bindProcessor,
  bindObserver,
} from "@seqlok/core";

const spec = defineSpec(({ param, meter }) => ({
  id: "lane",
  params: {
    transport: {
      timeRatio: param.f32({ min: 0.25, max: 4 }),
    },
  },
  meters: {
    output: {
      rms: meter.f32(),
    },
  },
}));

const plan = planLayout(spec);
const backing = allocateShared(plan);
const handoff = buildHandoff(plan, backing);

const controller = bindController(spec, plan, backing);

const accepted = acceptHandoff(handoff);
const processor = bindProcessor(accepted);
const observer = bindObserver(accepted);
```

This explicitness is a feature.
The library should not blur away where the trust boundary or the role boundary lives.

---

### 8. Strong TypeScript guidance without pretending TypeScript is the authority

Seqlok uses TypeScript heavily so illegal usage is harder to express.

That includes:

- typed authoring surfaces
- typed normalized specs
- typed keys and snapshots
- typed bindings per role

But TypeScript is not the contract authority.
The contract authority is the authored meaning normalized by the semantic boundary.
TypeScript is a guide layer over that, not a substitute for it.

---

### 9. Fail fast at the coordination boundary

Seqlok sits at a dangerous layer:

- shared memory
- explicit layout
- concurrency primitives
- cross-agent compatibility

When invariants break here, quiet recovery is often worse than immediate refusal.

So Seqlok prefers:

- explicit failure
- structured errors
- no silent fallback to fake-safe behavior

That matters especially for:

- incompatible handoffs
- invalid backing realization
- malformed authored input
- illegal role or binding usage

---

## Hard constraints

### Shared memory is not optional

Seqlok assumes actual shared memory support.

That means:

- `SharedArrayBuffer` support when using shared SAB-backed flows
- `Atomics` support
- worker, worklet, or equivalent multi-agent runtime support where applicable

There is no doctrine here for "fake shared mode" via message passing.
That would teach the wrong lessons and dilute the model.

---

### The authored contract is canonical

The authored contract is the canonical specification boundary.

Richer authoring surfaces may exist, but they are convenience layers over that contract.

That means:

- the builder callback is not a second contract system
- the builder callback is not the runtime identity model
- the plain authored object remains conceptually primary even when the builder is more ergonomic in TypeScript

This keeps Seqlok from drifting into builder-only theology.

---

### Schema commitment is real

Once a spec has been normalized, planned, and backed, its contract shape is fixed for that substrate instance.

That means:

- no in-place field addition
- no field-kind mutation
- no array resizing
- no hidden dynamic schema growth

If the contract needs to change, a new contract realization is required.

That constraint is what keeps the plan honest.

---

### Role ownership is fixed

Seqlok's roles are not negotiable per deployment.

- controller writes params
- processor writes meters
- observer is read-only

Different runtimes may host those roles in different places, but the ownership model itself does not drift.

---

## Non-goals

### Not a general-purpose state library

Seqlok is not Redux, Zustand, Jotai, Valtio, Vuex, or a similar app-state system.

It does not aim to own:

- subscriptions
- computed state graphs
- reactivity semantics
- undo/redo
- store middleware
- app-level transactions

Those live above the coordination kernel.

---

### Not a networking protocol

Seqlok is about in-process or shared-memory boundary coordination.

It does not aim to own:

- network transport
- distributed reconciliation
- multi-node replication
- eventually consistent sync

If you need distributed state, use a distributed tool.

---

### Not a persistence format

Seqlok backing memory is not a human-readable or long-term persistence format.

It is a runtime realization optimized for:

- layout determinism
- typed access
- bounded coordination

Persist logical values, not raw backing bytes, unless you are doing something extremely deliberate above the core contract.

---

### Not an actor system or scheduler

Seqlok owns shared-state coordination, not control-flow orchestration.

It does not aim to provide:

- actor semantics
- supervision trees
- task scheduling
- RPC frameworks

You can build those layers on top, but core should not pretend to be them.

---

### Not a replacement for sample-accurate audio scheduling

Seqlok is a strong fit for audio-adjacent coordination, but it does not replace timing models like `AudioParam` where sample-accurate scheduling is the real requirement.

Use Seqlok for:

- device state
- engine configuration
- coherent telemetry
- multi-field boundary state

Use a sample-clock-native tool when you truly need sample-accurate automation.

---

## Comparisons to alternatives

### vs `postMessage`

`postMessage` is good when:

- copies are acceptable
- latency budgets are loose
- coherence across multi-field shared state is not critical

Seqlok is for the narrower case where:

- copies are too expensive or too vague
- shared-memory coordination is warranted
- state needs role ownership and coherent reads

---

### vs raw `SharedArrayBuffer + Atomics`

Raw SAB plus Atomics gives you primitive power with almost no guardrails.

Seqlok adds:

- authored contract
- canonical field identity
- deterministic planning
- explicit role bindings
- structured errors
- coherent domain-level reads and commits

If you want to hand-roll everything, raw primitives remain available.
Then you own every invariant yourself.

---

### vs Web Audio `AudioParam`

`AudioParam` is deeply integrated into the Web Audio graph and designed for sample-accurate automation.

Seqlok is broader and different.
It is better suited for:

- multi-field state
- enums and arrays
- explicit telemetry return paths
- coherent shared-memory coordination beyond one scalar signal

The comparison is useful, but it should not collapse the library back down to "controller ↔ processor only."
Seqlok is a boundary kernel with explicit roles.

---

## Target use cases

Seqlok is a good fit when most of the following are true:

- there is a real execution boundary
- one side has tighter timing or predictability requirements than the other
- a coherent shared-state contract matters
- explicit role ownership matters
- a read-only observer role is useful for telemetry or visualization
- raw shared-memory wiring would be too brittle to own by hand

Good examples include:

- audio engines
- simulation workers
- media pipelines
- engine telemetry surfaces
- visualization workers riding the same substrate

---

## What success looks like

Seqlok is the right tool when you want:

- an authored contract that stays semantically honest
- a deterministic runtime contract and plan
- explicit role bindings instead of implicit ownership folklore
- coherent shared-state exchange across a hard boundary
- one canonical runtime identity model

If you mostly want app-store ergonomics, subscriptions, or generic business-state tools, Seqlok is probably the wrong layer.

That is a good thing.
A coordination kernel should know its boundaries.
