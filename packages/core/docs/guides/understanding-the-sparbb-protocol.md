# The SPARBB Protocol

**SPARBB** is the six-step protocol that Seqlok follows for all shared-memory
bindings:

**S**pec → **P**lan → **A**llocate → **R**elay → **B**ind₁ → **B**ind₂

It describes how a param/meter schema becomes:

* a **controller** on the owner side (UI / host), and
* one or more **consumer bindings** (processor, observers, analyzers) on the other side,

all over a single planned backing.

There are no shortcuts in `@seqlok/core`: every binding follows SPARBB in order.

---

## 1. Stage overview

At a high level:

1. **S – Spec**
   Describe *what exists*: params + meters and their types.

2. **P – Plan**
   Compute *how it is laid out* in memory.

3. **A – Allocate**
   Allocate backing memory that matches the plan.

4. **R – Relay**
   Wrap backing + layout into a handoff envelope and relay it across a trust boundary.

5. **B₁ – Bind (Controller)**
   Bind owner-side controller: param writers + meter readers.

6. **B₂ – Bind (Consumers, N≥1)**
   Bind one or more consumer roles: processors, observers, telemetry.

A key invariant:

> **`planLayout` is called exactly once per spec.
> All later stages consume a `Plan`; none of them recompute it.**

---

## 2. Canonical TypeScript flow (1× B₁, N× B₂)

```ts
import {
  defineSpec,
  planLayout,
  allocateShared,
  allocateSharedPartitioned,
  allocateWasmShared,
  buildHandoff,
  receiveHandoff,
  bindController,
  bindProcessor,
  // future: bindObserver, bindTelemetry, ...
} from '@seqlok/core';

// ── S: Spec ────────────────────────────────────────────────────────────────────

const spec = defineSpec(({ param, meter }) => ({
  params: {
    rate: param.f32({ min: 0.5, max: 2 }),
    mode: param.enum(['a', 'b']),
  },
  meters: {
    peak: meter.f32(),
  },
}));

// ── P: Plan ────────────────────────────────────────────────────────────────────

const plan = planLayout(spec);

// ── A: Allocate ────────────────────────────────────────────────────────────────

const backing = allocateShared(plan);
// or: const backing = allocateSharedPartitioned(plan);
// or: const backing = allocateWasmShared(plan);

// ── R: Relay (host side) ──────────────────────────────────────────────────────

const handoff = buildHandoff(plan, backing);

// ── B₁: Bind controller (host side) ───────────────────────────────────────────

const controller = bindController(spec, plan, backing);

// ── R: Relay (worker side) ────────────────────────────────────────────────────

const received = receiveHandoff(handoff);

// ── B₂: Bind consumers (worker side) ──────────────────────────────────────────

// Primary consumer (audio / game loop / worker)
const processor = bindProcessor(received);

// Future additional consumers on the same backing:
// const observer  = bindObserver(received);
// const telemetry = bindTelemetry(received);
```

Notes:

* The **order** within `[R, B₁]` on the host is flexible: you can bind the
  controller before or after `buildHandoff` as long as you stay in SPARBB
  domain order. The protocol itself is about which *domains* are allowed to
  depend on which, not a strict call stack.
* On the worker side, `receiveHandoff` is always the entry point before any
  B₂ bindings.

---

## 3. Stage-by-stage semantics

### 3.1 S – Spec (Schema)

**Domain:** schema / intent.
**Input:** none (host code).
**Output:** `Spec<S>` (internal type parameterised by the user’s shape).

Responsibilities:

* Define **params** (control inputs) and **meters** (observability outputs).
* Capture only *types* and *ranges*, not layout or backing.

Constraints:

* Numeric params use the range-only DSL: `{ min, max }`.
  No `default`, `step`, or `origin` fields at the spec layer.
* Any default values, snapping, and UX behaviors live in the application / UI.

Example:

```ts
const spec = defineSpec(({ param, meter }) => ({
  params: {
    gain: param.f32({ min: 0, max: 2 }),
    mode: param.enum(['normal', 'granular']),
  },
  meters: {
    peak: meter.f32(),
  },
}));
```

Error namespace: `spec.*`.

---

### 3.2 P – Plan (Layout)

**Domain:** layout & memory planning.
**Input:** `spec`.
**Output:** `Plan<S>`.

Responsibilities:

* Decide **plane structure** (which fields live in which typed arrays).
* Assign byte offsets and lengths.
* Compute total memory requirements.

Constraints:

* Pure function: deterministic for a given `spec`.
* No allocation here; it just computes numbers and shapes.

Example:

```ts
const plan = planLayout(spec);
```

Error namespace: `plan.*`.

Implementation rule:

> Only SPARBB Stage P is allowed to call `planLayout`.
> All later stages must receive a `Plan` instead of reconstructing it.

---

### 3.3 A – Allocate (Backing)

**Domain:** actual memory.
**Input:** `Plan<S>`.
**Output:** `Backing` (SAB or Wasm memory views).

Responsibilities:

* Allocate buffers that match the plan's plane sizes.
* Construct typed views (`Float32Array`, `Int32Array`, etc.).

The main allocators:

```ts
const contiguous = allocateShared(plan);                // single SAB, contiguous
// or
const partitioned = allocateSharedPartitioned(plan);    // one SAB per plane
// or
const wasmShared = allocateWasmShared(plan);            // backed by WebAssembly.Memory
```

Error namespace: `backing.*`.

---

### 3.4 R – Relay (Handoff)

**Domain:** crossing trust boundaries.
**Inputs:** `Plan<S>`, `Backing`.
**Outputs:** `Handoff<S>` (sender side), `ReceivedHandoff<S>` (receiver side).

Responsibilities:

* Package the backing + layout into a **serializable envelope**.
* Validate that what arrives on the other side is coherent with the plan.
* Own the **“envelope protocol”**: nothing else reaches across the boundary.

Host side:

```ts
const handoff = buildHandoff(plan, backing);
```

Worker side:

```ts
const received = receiveHandoff(handoff);
```

`ReceivedHandoff<S>` is the *normalized view* of the backing, ready to be used
by B₂ bindings.

`Handoff<S>` itself should be treated as an **opaque transport envelope**:

* Application code obtains it from `buildHandoff(plan, backing)`.
* Application code consumes it via `receiveHandoff(handoff)`.
* All layout and spec metadata is read from the embedded `Plan<S>`; the envelope
  does not duplicate or reinterpret that information.

Spec/layout compatibility across processes is enforced via:

* `plan.hash` — a deterministic structural hash for the spec.
* `verifyHandoff(localPlan, received.plan)` — optional guard for multi-process
  setups that must prove spec parity.

Error namespace: `handoff.*`.

Internal rule:

* Helpers like `reconstructViews` stay inside the handoff layer; public
  consumers only see `Handoff` / `ReceivedHandoff`.

---

### 3.5 B₁ – Bind₁ (Controller)

**Domain:** owner-side binding.

**Inputs:**

* `spec` — for typed API shape (keys, enums, etc.).
* `plan` — for introspection / diagnostics and to guarantee compatibility.
* `backing` — the actual memory.

**Output:** `ControllerBinding<S>`.

Responsibilities:

* Provide **param writers** on the host side:

  * `params.set(key, value)`
  * `params.update(patch)` – single LU bump
  * `params.stage(key, cb(view))` – RAII array writes, single LU bump

* Provide **meter readers**:

  * `meters.snapshot(...)` as the canonical read API

    * positional form
    * object form `{ keys, into }`

  The controller does not expose seqlock details directly; versioning and
  retry semantics are handled internally and surfaced only via the snapshot API.

Signature:

```ts
const controller = bindController(spec, plan, backing);
```

The `plan` argument here is intentional:

* B₁ is allowed to know the layout for richer host-side tooling and diagnostics.
* It still does **not** compute the plan; it only consumes it.

Error namespace: `binding.controller.*`.

---

### 3.6 B₂ – Bind₂ (Consumers, N≥1)

**Domain:** consumer-side bindings on the receiver side.

**Inputs:**

* `ReceivedHandoff<S>` — validated backing + layout (includes `Plan<S>`).

**Output:**

* One or more bindings over the same backing, for different roles.

Today's canonical consumer:

```ts
const processor = bindProcessor(received);
```

`ProcessorBinding<S>` is allowed to:

* Read params via **coherent windows**:

  ```ts
  processor.params.within((params) => {
    // Scalars are copied values captured at the version
    const gain = params.gain;
    const mode = params.mode;

    // Arrays are scratch views valid only inside the callback
    const eqCurve = params.eqCurve;
    // ...
  });
  ```

* Publish meters via a **single MU-scoped callback**:

  ```ts
  processor.meters.publish((meters) => {
    meters.peak(currentPeak);
    meters.stage('spectrum', (view) => {
      view.set(currentSpectrum);
    });
  });
  ```

Error namespace: `binding.processor.*`.

The protocol explicitly allows **N≥1** B₂ bindings off the same `ReceivedHandoff<S>`:

* `bindProcessor(received)` – primary SWMR writer of meters.
* `bindObserver(received)` – hypothetical read-only binding (params + meters).
* `bindTelemetry(received)` – hypothetical binding that exports state elsewhere.

Each binding:

* Shares the same underlying planes.
* Respects the same seqlock / SWMR guarantees.
* Differs only in *capabilities* (what you can read/write).

From the SPARBB point of view:

> **B₂ is not a single function.
> It is a family of role-specific bindings on top of `ReceivedHandoff<S>`.**

---

## 4. Multiple B₂ bindings in practice

Example pattern with multiple consumer roles on a single handoff:

```ts
// Host ─────────────────────────────────────────────────────────────────────────

const spec = defineSpec(({ param, meter }) => ({
  params: {
    rate: param.f32({ min: 0.5, max: 2 }),
  },
  meters: {
    rms: meter.f32(),
  },
}));

const plan = planLayout(spec);
const backing = allocateShared(plan);
const handoff = buildHandoff(plan, backing);

const controller = bindController(spec, plan, backing);

// Worker ───────────────────────────────────────────────────────────────────────

const received = receiveHandoff(handoff);

// Primary engine
const processor = bindProcessor(received);

// Hypothetical additional roles
// const observer  = bindObserver(received);
// const telemetry = bindTelemetry(received);

// All three share the same seqlock-protected planes.
```

Typical uses:

* **Processor** drives audio: reads params, writes meters.
* **Observer** runs in a visualization worker: reads params/meters to feed WebGPU.
* **Telemetry** streams snapshots to a remote debugger or log sink.

No copies, no extra handoffs: just more B₂ roles on the existing SPAR backbone.

---

### 4.1 Observer role (future B₂ binding)

A future `bindObserver(received)` would formalize a **read-only B₂ role**:

* **Inputs:**

  * `received: ReceivedHandoff<S>` — same handoff used by the processor.
* **Capabilities:**

  * Read params via a coherent window API (similar to `processor.params.within`).
  * Read meters via snapshot-style calls (similar to controller `meters.snapshot`).
* **Restrictions:**

  * No param writes.
  * No meter writes.
  * No seqlock manipulation; it is a pure SWMR reader.

Conceptually, an observer:

* Runs on top of the same seqlock-protected planes.
* Is structurally identical to a processor's read-side view, but with the write
  surface removed.
* Is the natural fit for visual analyzers, spectrum widgets, HUD overlays, etc.

SPARBB treats this as "just another B₂ role": it binds off the same
`ReceivedHandoff<S>` and never performs allocation, planning, or relaying.

---

## 5. Cross-language SPARBB

The same six stages apply in C/C++/Rust bindings that want to be Seqlok-compatible:

```cpp
// C++ sketch (API names illustrative)

// S
Spec       define_spec(/* ... */);

// P
Plan       plan_layout(const Spec& spec);

// A
Backing    allocate_shared(const Plan& plan);
// or: Backing allocate_shared_partitioned(const Plan& plan);
// or: Backing allocate_wasm_shared(const Plan& plan);

// R
Handoff    build_handoff(const Plan& plan, const Backing& backing);
Received   receive_handoff(const Handoff& handoff);

// B₁
Controller bind_controller(const Spec& spec,
                           const Plan& plan,
                           const Backing& backing);

// B₂
Processor  bind_processor(const Received& received);
// Observer  bind_observer(const Received&);
// Telemetry bind_telemetry(const Received&);
```

Any implementation that:

* follows **S → P → A → R → B₁ → B₂** in this domain order, and
* respects the same SWMR / seqlock semantics,

is a valid SPARBB implementation, even if the exact function names differ.

---

## 6. Design rules: SPARBB as a hard contract

1. **SPARBB ordering is non-negotiable**

  * Spec → Plan → Allocate → Relay → Bind₁ → Bind₂ is the only legal dependency
    chain inside `@seqlok/core`.
  * Higher-level helpers may wrap stages, but they cannot merge or reorder domains.

2. **No hidden planning or allocation**

  * `bindController`, `bindProcessor`, and future B₂ roles must never call
    `planLayout` or allocate backing.
  * They only bind views onto an existing `Plan` + backing / `ReceivedHandoff`.

3. **Final naming / semantics**

  * `defineSpec`, `planLayout`,
    `allocateShared` / `allocateSharedPartitioned` / `allocateWasmShared`,
    `buildHandoff`, `receiveHandoff`,
    `bindController(spec, plan, backing)`, `bindProcessor(received)`.
  * No `setMany`, no `meters.sample`, no DSL defaults/steps/origins.

4. **N×B₂ is encouraged but structured**

  * SPARBB explicitly supports multiple consumer bindings (B₂ roles).
  * Only one role (the processor) may publish meters for a given plane; other roles
    are read-only or use dedicated planes planned up front.

SPARBB is the backbone: as long as every engine, observer, and analyzer stays on
this spine, hot-swap flows, multi-engine setups, and parallel visualizations all
compose cleanly.
