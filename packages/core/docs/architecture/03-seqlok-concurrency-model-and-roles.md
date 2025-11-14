# Seqlok: Concurrency Model & Roles

> _How Seqlok coordinates Controllers, Processors, and shared memory._

This document describes **who is allowed to touch what**, **how Seqlok uses seqlocks**, and **what is actually
guaranteed** when you call things like `within`, `publish`, and `snapshot`.

It's the canonical reference for "what does this library promise, and under which conditions?".

---

## High-Level Model

Seqlok organizes shared state into two **domains**:

- **Params** – control inputs flowing **from Controller → Processor**
- **Meters** – telemetry outputs flowing **from Processor → Controller**

Each domain is:

- Stored in **shared memory** (SharedArrayBuffer or shared `WebAssembly.Memory`)
- Guarded by its own **seqlock** (sequence lock)
- Accessed under strict **SWMR** (Single-Writer / Multiple-Reader) rules

On top of that, Seqlok defines three **roles**:

```text
Controller:
  - Writes params
  - Reads meters

Processor:
  - Reads params
  - Writes meters

Consumers:
  - Read meters (via Controller or aggregators)
```

If you remember only one thing:

> **Controller owns inputs, Processor owns outputs, and everyone else is read-only.**

---

## Roles

### Controller

The **Controller** typically lives on the main thread (browser) or a host thread (Node):

- Writes to **params**
- Reads from **meters**
- Never writes meters
- Never reads params with a seqlock (it _can_, technically, but that’s not the hot path)

Example:

```ts
const spec = defineSpec(/* ... */);
const plan = planLayout(spec);
const backing = allocateShared(plan);
const controller = bindController(spec, backing);

// Controller responsibilities:
controller.params.set('gain', 0.8);
controller.params.update({ cutoff: 1200, resonance: 0.7 });

const meters = controller.meters.snapshot();
console.log(meters.peak, meters.rms);
```

Conceptually, the Controller is **“the human’s hand on the device”**: UI, automation, DAW host, etc.

---

### Processor

The **Processor** lives in a Worker, AudioWorklet, Wasm module, or some other engine-like context:

- Reads **params** using `within`
- Writes **meters** using `publish` / `stage`
- Never writes params
- Never reads meters without going through the meter seqlock

Example (AudioWorklet-style):

```ts
class MyProcessor {
  constructor(private readonly processor: ProcessorBinding<typeof spec>) {}

  process(input: Float32Array[], output: Float32Array[]): boolean {
    this.processor.params.within((params) => {
      const { gain, cutoff } = params;

      const result = this.dsp.process(input, output, gain, cutoff);

      this.processor.meters.publish((m) => {
        m.peak(result.peak);
        m.rms(result.rms);

        m.spectrum.stage((buf) => {
          buf.set(result.spectrum); // array meter updated atomically
        });
      });
    });

    return true;
  }
}
```

The Processor is **“the device brain”**: runs tight loops, does DSP / simulation, and must obey real-time constraints.

---

### Consumers

**Consumers** are anything that reads meters but doesn’t own params or meters:

- UI graphs
- Logging/metrics jobs
- Secondary workers doing analysis

They should:

- Use **controller-facing APIs** (`controller.meters.snapshot()` or higher-level wrappers)
- Never attempt to write into the Seqlok backing directly
- Treat Seqlok as _source-of-truth telemetry_, not as mutable state

Example:

```ts
const meters = controller.meters.snapshot((m) => ({
  peak: m.peak,
  rms: m.rms,
}));

drawMeterUI(meters);
```

---

## Domains and Planes

Seqlok has two logical domains, each backed by several **planes** in memory:

### Param Domain

- **Scalar planes**: e.g. `PF32`, `PI32`, `PB` (floats, ints/enums, booleans)
- **Control plane**: `PU` (param control)

  - Contains seqlock counters for params: `LOCK_P`, `SEQ_P`
  - May hold additional meta indices

### Meter Domain

- **Scalar planes**: `MF32`, `MU32`, `MF64`, etc.
- **Control plane**: `MU` (meter control)

  - Contains seqlock counters for meters: `LOCK_M`, `SEQ_M`
  - May hold additional meta indices

Each domain has:

- One **writer** (Controller for params, Processor for meters)
- Zero or more **readers**
- Exactly one **seqlock** for coherence of that domain

There is **no single cross-domain seqlock**. Params and meters are separate, each with its own versioning and locking
discipline.

---

## Param Flow (Controller → Processor)

### Controller: Writes

The Controller updates param values through a high-level API that hides Atomics:

```ts
// Single-field write
controller.params.set('gain', 0.7);

// Multi-field write (batch)
controller.params.update({
  gain: 0.9,
  cutoff: 1500,
});

// Optional: staged array updates if/when supported
controller.params.stage('bands', (arr) => {
  // write all bands here
});
```

Under the hood, the param writer:

1. Begins a param write epoch:

- Marks the param `LOCK_P` as "writing" (odd value).

2. Writes the relevant scalar and array values into their planes.
3. Ends the epoch:

- Sets `LOCK_P` back to "quiescent" (even value).
- Bumps `SEQ_P` to indicate a new logical version.

The Controller is free to call `set` / `update` at any time; the seqlock ensures readers either see the **old** state or
the **new** state, but never an in-between mix.

---

### Processor: Reads via `within`

On the Processor side, **all coherent param reads** go through:

```ts
processor.params.within((params) => {
  // params is a snapshot for the duration of this callback
});
```

Semantics:

- `within(cb)`:

  - Uses the param seqlock (`LOCK_P`, `SEQ_P`) to obtain a **coherent view**.
  - Retries internally if the Controller is mid-write.
  - Passes `cb` a `params` view where:

    - **Scalars** are captured values (`number`, `boolean`, enum variants as strings)
    - **Arrays** are ephermal view types (e.g. `Readonly<Float32Array>`-like) that are only intended for use _inside_
      the callback

The callback is **synchronous**:

- You must not `await` inside `within`.
- You must not retain references to the `params` object or its views for later use.

**Contract:** Treat the `params` view as living exactly for the duration of that callback.

---

### Param Invariants

With correct usage:

- Each call to `within` sees a param snapshot that corresponds to a single Controller state (as of some `SEQ_P`).
- Snapshots are **monotonic** in version:

  - Later calls to `within` see equal or greater `SEQ_P`, never older.

- No `within` callback sees a mix of two different writes; at worst it spins and retries until one is stable.

Seqlok does **not**:

- Guarantee that every single intermediate `update` is visible to the Processor.
- Guarantee any specific "age" of the snapshot, only that it is coherent.

---

## Meter Flow (Processor → Controller)

### Processor: Writes via `publish` and `stage`

On the Processor side, all meter writes go through:

```ts
this.processor.meters.publish((m) => {
  m.peak(result.peak);
  m.rms(result.rms);

  m.spectrum.stage((buf) => {
    buf.set(result.spectrum);
  });
});
```

Semantics:

- `publish(cb)`:

  - Begins a meter write epoch (using `LOCK_M`).
  - Provides a **mutable view** `m` where:

    - Scalar setters (`m.peak(value)`, `m.rms(value)`, etc.) record values in the meter planes.
    - Array setters use `stage`:

      - `m.spectrum.stage(buf => { /* write entire array */ })`
      - The body of `stage` is typically a single `buf.set(...)` or equivalent.

  - Ends the epoch by:

    - Marking `LOCK_M` as quiescent.
    - Bumping `SEQ_M` to a new version number.

Multiple `publish` calls per audio quantum are **allowed**. Each one represents an atomic “meter commit” from the
Controller's point of view.

For example:

```ts
processor.params.within((params) => {
  const filtered = this.filter.process(input, params.cutoff);

  // First commit
  processor.meters.publish((m) => {
    m.filterOutRms(this.analyze(filtered));
  });

  const driven = this.drive.process(filtered, params.drive);

  // Second commit
  processor.meters.publish((m) => {
    m.finalOutRms(this.analyze(driven));
  });

  return driven;
});
```

Each `publish` creates a distinct meter snapshot; both are **derived from the same param snapshot** captured by
`within`.

---

### Controller: Reads via `snapshot`

On the Controller side, all coherent meter reads go through:

```ts
const meters = controller.meters.snapshot();
// or with projection
const meters = controller.meters.snapshot((m) => ({
  peak: m.peak,
  rms: m.rms,
}));
```

Semantics:

- `snapshot(cb?)`:

  - Uses the meter seqlock (`LOCK_M`, `SEQ_M`) to read a coherent view.
  - Retries internally if the Processor is mid-write.
  - If called with no arguments, returns a full meter object.
  - If given a projection callback, returns whatever you derive from the meter view (`cb` is read-only wrt Seqlok).

Again, the callback (if provided) is **synchronous**, and you must not hold onto internal view references outside the
callback.

---

### Meter Invariants

With correct usage:

- Each `snapshot` returns meter values corresponding to a single `SEQ_M`.
- Repeated snapshots see monotonically increasing or equal `SEQ_M`.
- No snapshot sees a half-written array (e.g. half old spectrum, half new).
- Multiple `publish` calls between snapshots are allowed; the Controller just sees the "latest committed" view at the
  time of snapshot.

---

## Quantum Scopes & Nested Calls

A very common pattern (especially in audio) is:

```ts
process(inputs, outputs);
{
  this.processor.params.within((params) => {
    // 1. Read coherent params
    const result = this.dsp.process(inputs, outputs, params);

    // 2. First meter commit: basic level info
    this.processor.meters.publish((m) => {
      m.peak(result.peak);
      m.rms(result.rms);
    });

    // 3. Extra analysis
    const more = this.analyze(result);

    // 4. Second meter commit: more detailed info
    this.processor.meters.publish((m) => {
      m.spectralCentroid(more.centroid);
    });
  });

  return true;
}
```

Important points:

- All `publish` calls inside the `within` callback are **logically derived** from the same param snapshot.
- They are **not** grouped into a single param+meter "transaction"; params and meters have independent seqlocks.
- Each `publish` is its own atomic meter commit, seen as such by the Controller.

This is the **“quantum scope”** mental model:

> One `within` defines the param snapshot window.
> Any number of `publish` calls inside that `within` compute and commit meters derived from that snapshot.

Seqlok guarantees:

- Param reads inside that `within` are coherent.
- Each meter commit is coherent.
- The pairing (**this snapshot → these meter commits**) is _causal_ in your code, not enforced as a single hardware
  transaction.

---

## What Seqlok Guarantees (and Does Not)

### Guarantees

Within the documented roles and APIs, Seqlok guarantees:

1. **Per-domain coherence via seqlock**

- Param snapshots from `within` are internally consistent.
- Meter snapshots from `snapshot` are internally consistent.

2. **SWMR discipline per domain**

- Exactly one writer for params, one writer for meters (from Seqlok's perspective).

3. **Monotonic versions**

- Param `SEQ_P` and meter `SEQ_M` are monotonically increasing.
- Readers never see a snapshot from "before" the last one they obtained (assuming calls are ordered).

4. **Atomic meter commits**

- All meter changes within one `publish` are committed as a unit.
- Controllers never see half-updated meters from a single `publish`.

5. **No allocations on hot read paths (inside Seqlok)**

- `within` / `snapshot` / `publish` do not allocate user-visible objects in the hot path, beyond the callback
  scaffolding you write yourself.

### Non-Guarantees

Seqlok does **not** guarantee:

1. **Fairness between readers and writers**

- In pathological cases where the writer saturates the seqlock, readers may spin more.
- Design intent is that writes are relatively infrequent compared to reads.

2. **Cross-domain transactions**

- There is no atomic "params + meters must move together" transaction.
- Params and meters are separate; your code establishes the causal relationships.

3. **Async safety inside callbacks**

- If you `await` inside `within` or `publish`, you violate the design; behavior is undefined and can break invariants.

4. **No misuse of views**

- JS cannot prevent you from storing a reference to an internal view and using it later.
- The **contract** is that you won't; library behavior assumes usage follows the scope rules.

---

## Execution Examples

### AudioWorklet Pattern

```ts
// Controller (main thread)
const spec = defineSpec(/* ... */);
const plan = planLayout(spec);
const backing = allocateShared(plan);
const controller = bindController(spec, backing);

// Pass backing/handoff to the AudioWorklet
audioContext.audioWorklet.addModule('processor.js').then(() => {
  const node = new AudioWorkletNode(audioContext, 'my-processor', {
    processorOptions: { seqlok: buildHandoff(spec, backing) },
  });

  // UI → params
  slider.oninput = (e) => {
    controller.params.set('gain', e.valueAsNumber);
  };

  // meters → UI
  function updateMeters() {
    const m = controller.meters.snapshot();
    ui.setPeak(m.peak);
    ui.setRms(m.rms);
    requestAnimationFrame(updateMeters);
  }

  updateMeters();
});
```

```ts
// Processor (AudioWorkletGlobalScope / worker)
class MyProcessor extends AudioWorkletProcessor {
  private readonly binding: ProcessorBinding<typeof spec>;

  constructor(opts: any) {
    super();
    this.binding = bindProcessor(spec, receiveHandoff(opts.processorOptions.seqlok));
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    this.binding.params.within((params) => {
      const out = this.dsp.process(inputs[0][0], outputs[0][0], params.gain);

      this.binding.meters.publish((m) => {
        m.peak(out.peak);
        m.rms(out.rms);
      });
    });

    return true;
  }
}
```

This is the canonical "Controller ↔ Processor" Seqlok pipeline in action.

---

## Design Invariants (for Contributors)

Internally, the concurrency model relies on several invariants that **must not be broken**:

1. **All shared-state reads/writes go through bindings**

- No module should directly poke `Atomics` on data planes except the lowest-level primitives.

2. **Roles are enforced at the API level**

- `bindController` must not expose meter write capabilities.
- `bindProcessor` must not expose param write capabilities.

3. **Callbacks are synchronous**

   - `within`, `publish`, `snapshot` must not be `async` (no promises returned, no `await` intended inside).

4. **Seqlock state is always in single control plane per domain**

- No per-field seqlocks.
- One param seqlock, one meter seqlock per backing.

5. **Specs are structural, not behavioral**

- No "behavior flags" that change concurrency semantics per field.
- Concurrency semantics are always the same: snapshot for params, commit for meters.

If you extend Seqlok's capabilities, check any new feature against these invariants first.

---

## Summary

The concurrency model of Seqlok can be summarized in one line:

> **One writer per domain, shared memory guarded by seqlocks, exposed through scoped
> callbacks (`within` / `publish` / `snapshot`) that make coherent use the default.**

Everything else — planes, specs, backing, bindings — exists to make that model:

- **Fast enough** for real-time code
- **Safe enough** for shared memory
- **Clear enough** that you can reason about it at 2AM without hating future-you

Here's a Markdown-ready chunk you can drop straight into your docs (e.g. `concurrency-model-and-roles.md` under a "FAQ" / "Common questions" section).

### FAQ: Does polling meters with `requestAnimationFrame` hold locks or add audio latency?

**Short answer:** No.

`controller.meters.snapshot()` is a **lock-free reader** over a seqlock-guarded meter domain. It never takes a mutex and never blocks the writer.

On the processor side:

- `processor.meters.publish(cb)` performs the seqlock write sequence:
  - bump the version to an **odd** value (write in progress),
  - write the meter values,
  - bump the version to an **even** value (write complete).

On the controller side:

- `controller.meters.snapshot()` only uses **atomic loads** of that version plus plain typed-array reads.
- If it observes an odd version or a version change during the read, it simply **retries** on the UI thread.

Readers do not "hold" a lock. They just retry until they observe a stable, even version. The writer never waits for them.

A typical UI polling loop looks like this:

```ts
function renderMeters(): void {
  const { rms, peak } = controller.meters.snapshot();
  updateMeters(rms, peak);
  requestAnimationFrame(renderMeters);
}

requestAnimationFrame(renderMeters);
```

This pattern is what Seqlok is designed for:

- The **audio side** publishes meters at audio cadence.
- The **UI** samples meters at frame rate (or whatever cadence you choose).
- The seqlock ensures each snapshot is either:

  - a coherent view of one publish, or
  - retried until it becomes coherent.

Polling "very fast" (e.g. high-refresh displays) has two effects:

- Slightly more **main-thread** work (more snapshots, more cache traffic).
- No additional **audio-thread** latency: the audio callback never waits on UI readers.

The only way this hurts audio is the boring one: if the main thread is doing so much work that the entire CPU is saturated and the OS can’t schedule the audio thread in time. That is a general CPU budget problem, not a lock-contention problem.

**Key takeaway:**
UI-side `meters.snapshot()` calls are lock-free readers. Using `requestAnimationFrame` to poll meters does _not_ “hold locks” and does _not_ introduce extra audio latency by itself.
