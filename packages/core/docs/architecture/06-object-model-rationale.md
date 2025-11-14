# Seqlok Object Model & Non-OOP Core Rationale

> Why the Seqlok **kernel** is function-centric and not object-oriented – and why that's intentional, not an accident.

Seqlok's core is deliberately **not** designed as a set of stateful objects or contexts. Instead, it is built on:

- Algebraic data types (`SpecInput`, `Plan<S>`, `Backing`, `Handoff`, bindings)
- Pure or "pure-ish" functions between them
- Explicit module boundaries (`primitives` → `spec` → `plan` → `backing` → `handoff` → `binding`)

Object-oriented APIs are allowed – and expected – **on top** of this (orchestration, framework adapters, app code).
The kernel itself stays functional for reasons of correctness, analyzability, portability, and layering.

This document explains and defends that choice.

---

## 1. Design Principle

**Design principle.** The Seqlok core models concurrency and memory plan using **data + functions**, not “big objects
with methods".

- Kernel APIs are shaped like:

  ```ts
  planLayout(spec); // SpecInput → Plan<S>
  allocateShared(plan); // Plan<S> → Backing
  buildHandoff(plan, backing); // Plan<S> × Backing → Handoff
  bindController(spec, backing); // SpecInput × Backing → ControllerBinding<S>
  bindProcessor(spec, backing); // SpecInput × Backing → ProcessorBinding<S>
  ```

* Higher layers (orchestration, worklet helpers, React/Vue bindings, app code) are free to wrap these in:

  - Factories
  - Context objects
  - Classes
  - Hooks/composables

But the **concurrency kernel** itself is _not_ expressed as:

```ts
const ctx = new SeqlokContext(spec);
ctx.allocate();
const controller = ctx.createController();
const handoff = ctx.buildHandoff();
```

That’s a deliberate trade: ergonomics moves “upwards”, correctness-critical logic stays “flat and explicit”.

---

## 2. Why classic OO is a bad fit for shared-memory concurrency

Traditional OO shines when you want:

- Objects with identity
- Encapsulated mutable state
- Behavioral polymorphism (virtual methods, overrides)
- “Tell, don’t ask”: send messages and let the object decide

Seqlok's problem space is different:

- SharedArrayBuffer + Atomics
- Single-Writer / Multiple-Reader (SWMR) discipline
- Strict plan across threads / workers / runtimes
- Seqlock-style coherence protocols

The questions Seqlok needs to answer are:

- **Spatial:**
  Which bytes belong to which logical field (key → plane → offset)?
- **Temporal:**
  Who is allowed to write them, and in what order (LOCK/SEQ protocol)?
- **Aliasing:**
  How do multiple readers get coherent snapshots without torn reads?
- **Compatibility:**
  Does this `spec` actually match this `backing` and `handoff`?

Those are **memory-model** and **type-theory** questions, not "class hierarchy" questions.

In that context, "hidden mutable state behind method calls" is not a feature – it's a liability.

> **Thesis-style statement.**
> OO's strengths (encapsulation, behavioral polymorphism, dynamic dispatch) do not address Seqlok's primary concerns (
> plan determinism, alias safety, atomic coherence). For a shared-memory concurrency kernel, explicit data and pure-ish
> operations are more valuable than opaque object state.

---

## 3. Functions + data are easier to reason about (and verify)

Seqlok's core operations are intentionally shaped like **total functions** on immutable inputs wherever possible:

- `planLayout(spec): Plan<S>`
- `allocateShared(plan): Backing`
- `buildHandoff(plan, backing): Handoff`
- `bindController(spec, backing): ControllerBinding<S>`
- `bindProcessor(spec, backing): ProcessorBinding<S>`

This has several advantages:

### 3.1. Compositional reasoning

You can treat pipelines as compositions:

```ts
const plan = planLayout(spec);
const backing = allocateShared(plan);
const controller = bindController(spec, backing);
```

Preconditions and postconditions are explicit:

- If `planLayout` succeeds, `plan` encodes a valid non-overlapping plan.
- If `allocateShared(plan)` succeeds, `backing` is large enough and aligned for that plan.
- If `bindController(spec, backing)` succeeds, Seqlok has proven `spec` ↔ `backing` compatibility.

This shape is friendly to:

- Property-based testing
- Formalization (in principle) in Coq/Lean/Isabelle
- Static checks (e.g. TS types reflect exactly the `spec`)

In contrast, a stateful "context" object accumulates hidden state:

```ts
const ctx = new SeqlokContext(spec);
ctx.allocate();
const controller = ctx.createController();
```

Now correctness depends on:

- Implicit ordering (did you forget `allocate()`?)
- Internal caches
- Internal flags like `ctx.isAllocated`

which all live **behind** method boundaries.

### 3.2. Testing and invariants

Tests can exercise pure functions directly:

- Planner invariants (no overlap, correct plane lengths)
- Backing invariants (correct SAB size, plane offsets)
- Seqlock properties (no torn reads under concurrent access)

It's much harder to specify and test invariants against a "god context" object that controls everything and mutates
itself inside each method call.

---

## 4. Cross-runtime and polyglot friendliness

Seqlok targets:

- Browsers (SAB + Workers / AudioWorklet)
- Node / Deno (worker_threads)
- Environments with shared `WebAssembly.Memory`

And you want the core to be:

- Portable to other languages (Rust, C/C++, etc.)
- Re-implementable on the "other side" (e.g. planner in Rust, bindings in JS)
- Usable in headless tools and non-browser contexts

A function/data kernel acts as a **portable spec**:

- `Plan<S>` is a plain data structure describing plan.
- `allocateShared(plan)` is a simple resource construction based on that plan.
- `mapViews(plan, backing)` is a deterministic mapping.

Any language with:

- Integer arithmetic
- Typed arrays / slices
- Atomics or equivalent fences

can re-implement the core behavior against the same invariants.

> **Design goal.**
> No part of Seqlok's correctness should depend on JavaScript's `class` model or method dispatch. The semantics should
> be expressible as "data + functions", so an equivalent implementation in another language is straightforward.

Heavy OO in the kernel pulls in JS-specific concepts (prototype chains, method dispatch semantics, subclassing) that
make porting and verification unnecessarily harder.

---

## 5. Layered architecture vs big objects

Seqlok enforces a strict layering:

- `primitives` – atomics, seqlock
- `spec` – DSL and spec types
- `plan` – planning from spec → plan
- `backing` – allocate/map shared memory
- `handoff` – serialize/verify cross-thread plan + memory
- `binding` – controller/processor bindings over backings
- (above that: **orchestration**, in separate helpers/packages)

Each layer has a small, explicit API and depends on a limited set of lower layers.

The function signatures **express those dependencies**:

- `planLayout(spec)` lives in `plan`
- `allocateShared(plan)` lives in `backing`
- `buildHandoff(plan, backing)` lives in `handoff`
- `bindController(spec, backing)` lives in `binding`

They encode the architecture in their types.

A large OO `Context` or `Engine` object tends to:

- Import multiple layers at once
- Accumulate responsibilities ("plan + allocate + bind + buildHandoff + …")
- Blur where an error actually originates (spec vs plan vs backing vs binding)

Over time, this leads to:

- Tighter coupling
- More "reach through" (one method poking at lower layers directly)
- Harder enforcement of the layer rules you already use in ESLint / TS config

> **Intent.**
> Seqlok's kernel is closer to a well-designed C library with strong types than to a classical OO "engine" object. The
> layers are explicit modules; their relationships are visible in the type signatures.

---

## 6. Where OO _is_ welcome: orchestration and integrations

This is **not** a blanket rejection of object-orientation. It's a **scoping decision**:

- Kernel: **functional, data + functions**, minimal internal state, explicit layering.
- Above kernel: **use whatever abstraction is ergonomic**:

  - Builder/factory helpers
  - Context objects
  - Classes
  - Hooks/composables (React/Vue/etc.)
  - Framework-specific adapters

Examples of places where OO / context styles are perfectly fine:

- `@seqlok/web` – helpers for AudioWorklet / browser orchestration
- `@seqlok/react` – React hooks and providers
- `@seqlok/devtools` – inspector UIs, stateful debug contexts
- App-level "Session" / "Deck" / "Engine" classes in consumer code

These can wrap the core primitives:

```ts
// Example sketch: orchestration helper (could be OO, could be functional)
export function createControllerKit<S extends SpecInput>(spec: S) {
  const plan = planLayout(spec);
  return {
    plan,
    allocateShared: () => allocateShared(plan),
    bindController: (backing: Backing, opts?: ControllerOptions) =>
      bindController(spec, backing, opts),
    buildHandoff: (backing: Backing) => buildHandoff(plan, backing),
  };
}
```

The important part: **this lives on top of the kernel**, not inside it.
If an integration layer goes wrong, the core invariants remain intact.

> **Policy.**
> “OO belongs in orchestration and integration layers, not in the concurrency kernel.”

---

## 7. Reviewer FAQ: "Why not a big context object?"

When reviewers ask:

> “Why not have a `SeqlokContext` that hides spec/plan/backing and just gives me `.allocate()`, `.bind()`,
> `.handoff()`?”

You can answer along these lines:

1. **Correctness & reasoning**

- Function-centric APIs make it easier to specify and test invariants about plan and coherence.
- A context object hides critical state transitions behind method calls, making it harder to reason about correctness.

2. **Shared-memory domain**

- Implicit mutable state is hostile in SAB + Atomics + seqlock scenarios.
- We want explicit flows: `spec → plan → backing → handoff → bindings`.

3. **Layering**

- A big context would necessarily depend on `spec`, `plan`, `backing`, `handoff`, and `binding` all at once,
  collapsing the carefully separated domains.
- Current function signatures encode layer dependencies directly.

4. **Polyglot & portability**

- A data+function kernel is easier to re-implement or verify in other languages.
- No correctness property depends on JavaScript's class semantics.

5. **Ergonomics via composition**

- We provide (or endorse) higher-level helpers/factories that close over `spec`/`plan` to reduce repetition.
- The kernel stays small, explicit, and predictable.

A concise line you can reuse:

> We chose not to make the Seqlok core OO because the problem is about **memory and time**, not “objects and methods”.
> OO is a great tool for orchestration and UI integration; it's the wrong tool for defining a portable, verifiable
> concurrency kernel.

---

## 8. Summary

- The Seqlok **core** is intentionally non-OOP:

  - Data + pure-ish functions
  - Explicit `spec → plan → backing → handoff → bindings` pipeline
  - Clear module boundaries and error domains

- This shape:

  - Matches the needs of shared-memory concurrency
  - Simplifies testing and potential formal reasoning
  - Keeps the design polyglot-friendly
  - Preserves the strict layering enforced elsewhere in the project

- Object-oriented abstractions are encouraged **above** the kernel, where they can improve ergonomics without
  compromising the concurrency model.

In other words: the core is designed like a **portable systems library**; the OO “nice bits” live one layer higher.
