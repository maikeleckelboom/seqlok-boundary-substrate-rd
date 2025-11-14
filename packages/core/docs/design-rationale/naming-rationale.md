# Naming & Roles in Seqlok

**Audience:** future maintainers, contributors, and “why is it called that?” people.
**Status:** design rationale, not user-facing API docs.

This document explains _why_ the core Seqlok API is named the way it is, and records some of the alternatives we
considered and rejected.

The goal is not to bikeshed forever, but to make sure future changes don't accidentally undo decisions that were made
deliberately.

---

## 1. The Core Pipeline

The core "golden path" looks like this:

```ts
const spec = defineSpec(/* ... */);
const plan = planLayout(spec);
const backing = allocateShared(plan);

export const controller = bindController(spec, backing);
// in a worker / worklet:
export const processor = bindProcessor(spec, backing);

export const handoff = buildHandoff(plan, backing);
```

Conceptually:

1. `defineSpec` – describe the **schema** (params + meters).
2. `planLayout` – derive a **memory plan plan** from the spec.
3. `allocateShared` – allocate the **shared backing memory** (SAB + views).
4. `bindController` / `bindProcessor` – attach **roles** to that backing.
5. `buildHandoff` – serialize the **plan + backing** for cross-thread transfer.

Each verb is chosen to reflect what changes at that step.

---

## 2. `defineSpec` → `planLayout` → `allocateShared`

### `defineSpec`

We stuck with `defineSpec` because:

- It mirrors other DSLs (`defineConfig`, `defineStore`, etc.).
- It reinforces that this is a **declarative description**, not executable code.
- It reads cleanly in the pipeline:

  ```ts
  const spec = defineSpec(/* … */);
  ```

No serious alternatives were better; `createSpec` / `buildSpec` didn't add clarity.

---

### `planLayout` (was `planSpec`)

The function that turns a spec into a `Plan<S>` started life as:

```ts
const plan = planSpec(spec);
```

That name was technically accurate ("plan this spec"), but it isn’t what we actually care about. The important thing is:

> We are planning a **memory plan**.

So we renamed it to:

```ts
const plan = planLayout(spec);
```

Why this is better:

- Makes the **output** explicit: a memory plan plan.
- Reads nicely in the pipeline: spec → plan → backing.

Rejected variants:

- `planSpec(spec)` – kept as an alias during the transition; too spec-centric.
- `planMemory(spec)` – technically correct but too low-level in tone.
- `layoutSpec(spec)` – sounds like UI/plan engine.
- `createPlan(spec)` / `buildPlan(spec)` – generic factory verbs; weaken the “plan” emphasis.

Final decision:

- **Canonical API name:** `planLayout`.
- **Conceptual interpretation:** “derive a memory plan plan from this spec”.

---

### `allocateShared` (not `allocateMemory`)

This step takes a `Plan<S>` and turns it into **real memory**:

```ts
const backing = allocateShared(plan);
```

What matters here:

- We are allocating **shared** memory (`SharedArrayBuffer`), not just any buffer.
- This is the first step where we enter **SAB + Atomics** territory.

Alternatives we considered:

- `allocateMemory(plan)` – too generic; doesn’t signal “this is shared memory”.
- `allocateBacking(plan)` – stutters at the call site: `backing = allocateBacking(plan)`.
- `allocateSharedMemory(plan)` – accurate but too verbose.
- `createBacking(plan)` – softer verb; hides that this is a memory allocation that may fail.

We kept:

- **Name:** `allocateShared`.
- **Rationale:** emphasize _sharedness_, keep the call site clean, and leave room for a future `allocateLocal(plan)` if
  we ever introduce a non-SAB backing.

Example of that future:

```ts
const sharedBacking = allocateShared(plan);
const localBacking = allocateLocal(plan);
```

The current name makes this evolution trivial.

---

## 3. `bindController` vs `bindProcessor` (not `Host`, not `Thread`)

The two core roles in Seqlok are:

- **Controller** – main/UI side, the thing that writes params and reads meters.
- **Processor** – worker/audio side, the thing that reads params and writes meters in a hot loop.

Bindings:

```ts
const controller = bindController(spec, backing); // main thread
const processor = bindProcessor(spec, backing); // worker / audio thread
```

### Why “Controller”?

We chose "controller" because:

- In the MVC-ish sense, it:

  - reacts to UI / events,
  - drives updates to the underlying system,
  - owns the "intent".

- It is the side that:

  - _controls_ params over time,
  - observes meters,
  - orchestrates "what should the processor do".

It pairs very cleanly with "processor":

> One **ControllerBinding**, one **ProcessorBinding** per spec/backing pair.

This makes docs and error messages plain:

> “Each backing may have at most one controller and one processor.”

### Why not "Host" or "Thread"?

We explicitly avoided naming this `bindHost` or `bindThread`:

- `Host` in audio-land usually means **the DAW / plugin host**, which isn’t quite what this binding is. The controller
  is _one participant_ in a system, not a generic "host environment" for many plugins.
- `Thread` is:

  - too low-level (we also bind in Worklets, not just Workers),
  - misleading in environments that aren't strictly "threaded" in the classic sense.

We want the roles to be **semantic**, not implementation-specific. “Controller” and “Processor” describe _what they do_,
not _where they live_.

---

## 4. Param updates: why `update` instead of `setMany`

We experimented with names like `setMany` for param updates, e.g.:

```ts
controller.params.setMany({ gain: 0.5, cutoff: 2000 });
```

We ended up with `update` instead:

```ts
controller.params.update({ gain: 0.5, cutoff: 2000 });
```

Rationale:

- **“setMany”** sounds:

  - very write-only ("blast this map into the backing"),
  - slightly awkward next to other APIs (`publish`, `within`, etc).

- **“update”**:

  - suggests partial patches (you can update a subset),
  - fits better with the mental model: "apply this update to the current param state".

We also want the API to sound consistent when read aloud:

> “Controller params update … Processor meters publish … both sides use within() for coherent views.”

That sentence flows better with `update` than `setMany`.

---

## 5. Handoff: `buildHandoff` (not `Envelope`)

We use:

```ts
const handoff = buildHandoff(plan, backing);
```

The word "handoff" expresses:

- We're preparing a **bundle** of:

  - structural knowledge (plan/plan),
  - and concrete memory (backing),

- that is intended to be **handed off** across a thread boundary to be bound on the other side.

### Why not `Envelope`?

We briefly experimented with names like `buildEnvelope` / `receiveEnvelope`:

```ts
const envelope = buildEnvelope(plan, backing);
worker.postMessage({ type: 'INIT', envelope });
```

The metaphor made some sense:

- It really is an "envelope" containing everything the other side needs.
- You literally "mail" it with `postMessage`.

But in practice this had issues:

- **Too generic** – "envelope" doesn't say _what for_ (network, storage, worker init, etc.).
- **Too object-shaped** – it sounds like a passive data bag, not part of a lifecycle.
- **No directionality** – "envelope" lacks the sense of "ownership handoff" between two parties.

`handoff` reads more like an _event_ in a protocol:

> one side builds a handoff, the other side receives it.

That matches the real semantics:

- There is exactly one moment where control of a backing is handed to a processor.
- After that, both sides refer to the same shared memory, but the _initialization_ is done.

Other rejected alternatives:

- `createHandoff` / `makeHandoff` – generic factory verbs; weaker sense of “this is for cross-thread ownership
  transfer”.
- `serializeBacking` – too low-level; ignores the plan and sounds like “JSON-ify this”.

`buildHandoff` is explicit enough without being verbose, and it describes the direction: we construct a handoff object
to
pair with `receiveHandoff` on the other side.

---

## 6. Why this doc exists

For normal users, the only thing that matters is:

```ts
const spec = defineSpec(/*...*/);
const plan = planLayout(spec);
const backing = allocateShared(plan);
const controller = bindController(spec, backing);
const handoff = buildHandoff(plan, backing);
```

They don't need to know that we once considered `planSpec`, `bindHost`, or `setMany`.

This file exists for:

- Future maintainers who wonder "why didn't we call this X?".
- People proposing API changes, so they can see what's been discussed already.
- Avoiding regressions where a "nice-looking rename" accidentally breaks a deliberate mental model.

If you're changing any of these names, please:

1. Update this document with the new rationale.
2. Record any new alternatives you considered and rejected.

That way, Seqlok's naming stays intentional, not accidental.

---

## 7. Design history: `transaction`, `subscribe`, and the “big host” era

This section is here explicitly for people who ask:

> “Where is `transaction`?”
> “Can I `subscribe` to param changes?"
> “Did you ever have a bigger host API?”

Short answer: yes, we tried those; no, they do not belong in the core.

### 7.1 Early prototypes: `bindHost`, `bindThread`, `setMany`, `subscribe`

In the first prototypes (old `libseqlok` era), the API tried to do two things at once:

1. Define a **shared-memory ABI** between threads.
2. Provide a **little reactive host framework** on top of that.

The "host" binding looked roughly like:

```ts
const host = bindHost(spec, backing);

host.params.set('gain', 0.5);
host.params.setMany({ gain: 0.5, cutoff: 2000 });

host.params.transaction((draft) => {
  draft.gain = 0.5;
  draft.cutoff = 2000;
});

host.params.subscribe('gain', (value) => {
  // called on change, batched in a microtask
});
```

There were also helpers like:

- `setSpan` for array params (copying slices back and forth),
- queued watcher notifications,
- microtask-based batching to avoid hammering subscribers.

Layout strategies (`splitPlanesLayout`, contiguous vs offset layouts, etc.) were also exposed more directly.

This was a **fun** API in small demos, but it had issues:

- It turned Seqlok into a **state management library** instead of a **pipe**.
- It embedded **reactivity semantics** (subscribe/batching) into the core ABI layer.
- It increased surface area and maintenance load for things apps/frameworks already do well.

The experiments were useful to prove the seqlock + shared-memory core, but the layering was wrong.

### 7.2 Why `transaction` is no longer a public primitive

The old host API had an explicit `transaction(fn)`:

```ts
host.params.transaction((draft) => {
  draft.gain = 0.5;
  draft.cutoff = 2000;
});
```

Intent:

- Give the host a **single atomic window** to update multiple params.
- Deliver watchers a **coalesced** view of the change.

In the current design:

- The **atomicity** is handled at the **binding + seqlock** level, not via a public `transaction`.
- Controller operations like `params.update(...)` are defined so that a single call is a coherent commit.
- If you need to stage higher-level "transactions", you build a small helper in your own code:

  ```ts
  function setGainAndCutoff(
    controller: ControllerBinding<typeof spec>,
    gain: number,
    cutoff: number,
  ) {
    controller.params.update({ gain, cutoff });
  }
  ```

We deliberately did **not** ship a public `transaction` API because:

- It tends to grow semantics (nesting, retries, rollback, etc.).
- Different apps want different guarantees (all-or-nothing vs "best-effort and log").
- The underlying model already gives us the atomic commit we need; richer transactional behavior is **policy**, not ABI.

So when someone asks "where is `transaction`?” the answer is:

> The core already commits updates atomically where it matters.
> If you want higher-level transactional semantics, build them on top in userland.

### 7.3 Why `subscribe` was removed

The early host API had:

```ts
host.params.subscribe('gain', (value) => {
  // react to changes
});
```

with features like:

- batched notifications,
- change coalescing per tick,
- “subscriber snapshots” for array params.

We removed this completely from the core because:

1. **Reactivity is a framework concern.**

   UI/tooling environments already have:

- React state / signals,
- Vue refs,
- RxJS streams,
- custom event buses.

Seqlok shouldn't compete with or dictate a reactive model.

2. **It complicates the mental model.**

The controller's job is:

- write params,
- occasionally read meters.

Binding-level `subscribe` makes people think they're getting a mini-store; then you must answer:

- Does subscription ordering matter?
- Are callbacks sync or batched?
- On which thread do they run?
- What if a subscriber throws?

3. **It couples ABI and ergonomics.**

The ABI (shared memory contract) should be independent of "how do I surface this in my UI".I”.
Once you bake `subscribe` into the core, that line blurs.

In the current design, if you want reactivity, the pattern is:

- Use `controller.params.update(...)` as the **commit point**.
- Use **meters** (or your own state) to drive the UI.
- Wrap Seqlok in a small adapter that integrates with your chosen reactive system.

### 7.4 Mapping old ideas to the new world

Quick "before vs now" table for common questions:

| Old prototype idea                | What it did                                 | Current equivalent / story                                                          |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bindHost`                        | Big main-thread binding with extra behavior | `bindController` (slim, focused on params/meters only)                              |
| `bindThread`                      | Worker-side binding                         | `bindProcessor`                                                                     |
| `params.setMany(...)`             | Batch-set multiple params                   | `controller.params.update(patch)`                                                   |
| `params.transaction(fn)`          | Multi-param atomic window + batched signals | Single-call atomic `update`; build higher-level “transaction” in app code if needed |
| `params.subscribe(key, cb)`       | Reactive watcher API                        | Not in core; use your own store / reactive layer on top                             |
| `setSpan` helpers for arrays      | Sugar for partial array writes              | Use `update` with arrays or app-level utilities                                     |
| Manual plan helpers in userland | Pick plan strategy directly               | `planLayout` is the single source of plan truth                                   |

The important shift:

> **Old seqlok:** “a small reactive state library _plus_ a shared memory plan."
> **Current seqlok:** “a boring, predictable **wire** you can build your own abstractions on top of.”

The old repos were valuable experiments. They're not shameful; they're just **too high-level** to live in the core.

The current API keeps:

- the seqlock-backed memory model,
- the typed spec/plan/backing/handoff pipeline,
- atomic updates and coherent reads,

and leaves:

- transactions,
- subscriptions,
- UI/state orchestration,

to layers that already specialize in them.

This section exists so that when someone asks "can you add `transaction` back?" or "why no `subscribe`?”, we can point
here and say:

> We tried that. It belonged in userland, not in the wire.
