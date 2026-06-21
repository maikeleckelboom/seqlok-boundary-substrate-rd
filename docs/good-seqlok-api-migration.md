# Good Seqlok API: Migration and Signalsmith Stretch Proof

**Status:** Accepted architecture and migration decision  
**Date:** 2026-06-21  
**Authority:** Canonical direction for the fresh public Seqlok repository and its first public proof  
**Supersedes:** The existing public story built around `params`, `meters`, `controller`, `processor`, `observer`, role bindings, `SharedContext`, `Handoff`, and a multi-package framework topology

## Purpose

This document records the final decisions for migrating Seqlok from its current role-oriented monorepo into a small, strict shared-memory boundary substrate.

It also defines the first and only public proof application: a materially superior Signalsmith Stretch demo.

This is not a compatibility plan for the old API. It is a clean public doctrine. The old repository is a source archive, not an API template.

## Executive decision

Seqlok will be rebuilt through **selective extraction into a fresh public repository**.

The public package will not model runtime roles or audio concepts. It will expose only boundary capabilities:

- versioned layouts;
- exact memory attachment;
- coherent publications;
- bounded command queues;
- lineage and invalidation;
- explicit overflow, stale, version, and layout facts.

The defining rule is:

> **Seqlok does not model roles. Seqlok exposes boundary capabilities.**

The rejected model is:

```text
controller -> params -> processor -> meters -> observer
```

The accepted model is:

```text
writer   -> publication slot -> reader
producer -> command queue    -> consumer

layout identity + lineage determine whether either boundary is valid
```

The first public proof will be a high-quality, browser-based Signalsmith Stretch application. It will use a custom adapter around the pinned Signalsmith C++/WASM engine, an adapter-private AudioWorklet runtime, Seqlok publications and commands, buffer-backed playback, waveform/transport controls, robust seek/loop behavior, runtime diagnostics, and a basic stereo VU display driven by output-level fields in the adapter-owned runtime-status publication.

There will be no flock demo, generic playground, abstract concurrency demo, or second public proof competing for scope.

---

# 1. Seqlok doctrine

## 1.1 What Seqlok is

Seqlok is a deterministic boundary substrate for components that share fixed memory and ordered control without sharing runtime authority.

Seqlok owns:

- canonical fixed-width layout description;
- deterministic layout compilation;
- layout protocol version, layout version, hash, byte length, alignment, and region identity;
- allocation and exact attachment to shared memory;
- typed views over validated regions;
- coherent single-writer publications;
- bounded single-writer/single-reader command queues;
- resource, session, generation, continuity, and sequence identities;
- stale-target rejection;
- resource and session invalidation;
- explicit overflow, busy, stale, mismatch, and invalidation facts;
- bounded, allocation-free hot-path mechanics.

Seqlok guarantees, within its declared topology:

- a successful snapshot was copied from one committed publication state;
- a failed snapshot returns no new value and leaves caller-owned scratch unchanged;
- accepted commands drain in FIFO order;
- command overflow is observable and cannot silently overwrite accepted commands;
- stale resource, session, generation, or continuity targets are rejected before domain code runs;
- attachment fails before typed views are returned when protocol, version, hash, size, or region identity differs;
- hot-path methods have explicit work bounds;
- normal boundary failures are returned as data, not hidden in timing or exceptions.

## 1.2 What Seqlok is not

Seqlok is not:

- an audio framework;
- a plugin framework;
- a parameter system;
- a metering system;
- a product state store;
- a scheduler;
- a transport model;
- an AudioWorklet host;
- a WASM loader;
- an Electron bridge;
- an mmap library;
- a Signalsmith wrapper;
- a renderer abstraction;
- a lifecycle container;
- a worker framework;
- a general serialization framework.

Seqlok core must not own or export:

- audio engine behavior;
- tempo, pitch, rate, formant, tonality, loop, cue, deck, track, or transport semantics;
- musical intent;
- Signalsmith types or commands;
- AudioWorklet classes or registration;
- WASM module or memory construction;
- browser policy or cross-origin setup;
- Electron renderer, preload, IPC, or native bridge APIs;
- arbitrary strings, variants, objects, or variable-length messages in hot shared layouts;
- controller, processor, observer, parameter, or meter roles.

## 1.3 Layer ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| `seqlok/layout` | Fixed-width descriptors, compiled layout identity, offsets, alignment, allocation, attachment, typed views | Domain fields, browser runtime setup, audio buffers |
| `seqlok/core` | Publications, lineage, invalidation, coherent reads/writes, generic diagnostics | Product roles, audio meaning, scheduling policy |
| `seqlok/commands` | Generic envelopes, fixed-width codec contract, bounded SWSR queue, FIFO drain, overflow facts | Signalsmith vocabulary, fan-in, fairness, retries, product routing |
| Signalsmith adapter | Signalsmith C++/WASM integration, AudioWorklet runtime, timing conversion, PCM ownership, command vocabulary, output levels | Seqlok public doctrine, musical product intent |
| Demo/product | Musical intent, UI, waveform, transport, loop, presets, A/B policy, presentation, VU rendering | Shared-memory correctness mechanisms |

The adapter decides what fields and commands mean. Seqlok only guarantees how fixed data crosses the boundary.

---

# 2. Public package shape

Publish one package:

```text
seqlok
├── seqlok/layout
├── seqlok/core
└── seqlok/commands
```

The old `base`, `schema`, `primitives`, `core`, and `commands` concepts may survive as internal folders. They must not survive as independently versioned public packages.

## 2.1 `seqlok/layout`

Public responsibilities:

- fixed-width scalar descriptors;
- fixed-length array descriptors only when required by a proven consumer;
- struct descriptors;
- publication and command-queue region descriptors;
- canonical layout compilation;
- protocol version and layout version;
- stable layout hash;
- total byte length and region table;
- alignment metadata;
- one contiguous shared allocation for v0;
- exact attachment validation;
- typed region views;
- explicit mismatch result types.

V0 scalar types should be deliberately small:

- `u32`;
- `i32`;
- `f32`;
- `f64` only where precision is justified;
- fixed-width pairs for exact 64-bit identities or cursors.

V0 excludes:

- strings;
- unions/variants;
- arbitrary nesting;
- variable-length arrays;
- general JSON serialization;
- public JSON Schema;
- code generation;
- product defaults, ranges, labels, automation metadata, or UI metadata.

## 2.2 `seqlok/core`

Public responsibilities:

- `ResourceId`;
- `SessionId`;
- `GenerationId`;
- `ContinuityId`;
- `SequenceId`;
- lineage values and equality checks;
- resource/session invalidation;
- publication slot construction from a validated region;
- `PublicationWriter<T>`;
- `PublicationReader<T>`;
- strict commit results;
- strict snapshot results;
- generic numeric diagnostics for busy, stale, invalidated, layout mismatch, and version mismatch facts.

A status surface is not a separate Seqlok class. It is an ordinary publication whose fields have adapter-defined status meaning.

## 2.3 `seqlok/commands`

Public responsibilities:

- generic logical command envelope;
- fixed-width wire-header contract;
- adapter-owned payload codec contract;
- bounded SWSR queue;
- producer and consumer capabilities;
- explicit usable capacity;
- FIFO dequeue/drain;
- drop-newest overflow policy;
- overflow counters and attempted sequence facts;
- bounded consumer work.

V0 excludes:

- `CommandBus`;
- producer registration;
- command fan-in;
- fairness;
- retries;
- command routing;
- source lifecycle registry;
- multi-producer or multi-consumer queues.

Multiple producers use separate queues or serialize before crossing the boundary.

## 2.4 Root export

The root `seqlok` import may re-export only the stable nucleus from the three public subpaths. It must not export a convenience runtime, context object, role binding, browser host, or product adapter.

---

# 3. Vocabulary migration

The vocabulary change is architectural, not cosmetic.

| Rejected public concept | Decision | Accepted concept | Reason |
| --- | --- | --- | --- |
| `defineSpec` | Delete | `defineStruct`, `createLayout` | Seqlok defines memory contracts, not product specifications |
| `CanonicalSpec` | Delete | `LayoutDescriptor` | The identity is a shared ABI, not a product schema |
| `planLayout` | Rename/rewrite | `compileLayout` | Produces concrete offsets, sizes, versions, and hash |
| `Plan` | Delete | `CompiledLayout` | Names the artifact precisely |
| `SpecHash` | Delete | `LayoutHash` | Attachment verifies byte layout |
| `params` | Delete from core | Adapter-defined desired/control fields | “Parameter” is domain vocabulary |
| `meters` | Delete from core | Adapter-defined status/output-level fields | “Meter” is product/UI vocabulary |
| `ParamBuilders` / `MeterBuilders` | Delete | Narrow field descriptors | Core only defines fixed-width memory |
| `controller` | Delete | `PublicationWriter`, `CommandProducer` | Capability, not product role |
| `processor` | Delete | `PublicationReader`, `CommandConsumer` | Capability, not audio role |
| `observer` | Delete | `PublicationReader` | A reader does not need a blessed third role |
| `bindController` | Delete | `createPublicationSlot`, explicit writer capability | No hidden role construction |
| `bindProcessor` | Delete | `createPublicationSlot`, explicit reader capability | No audio authority in core |
| `bindObserver` | Delete | Reuse publication reader | No separate hierarchy |
| `SharedContext` | Delete | Explicit compiled layout, attachment, slots, queues | Hidden lifecycle/container magic is rejected |
| `createSharedContext` | Delete | Explicit composition | Consumers own composition |
| `Handoff` | Delete | `LayoutIdentity` plus shared memory | No undeclared transport/lifecycle authority |
| `buildHandoff` | Delete | `allocateLayout` | State the operation |
| `acceptHandoff` | Delete | `attachLayout` | Attachment is explicit and validated |
| `verifyHandoff` | Delete | `validateLayoutIdentity` | Exact contract |
| `CommandMailbox` | Rename/rewrite | `CommandQueue` | Fixed FIFO boundary primitive |
| `CommandBus` | Delete | Separate queues or product-side serialization | Fan-in and routing are consumer topology |
| `stage`, `hydrate`, `within` | Delete | `write`, `commit`, `readInto` | Observable mechanics, no hidden transaction language |
| `returnLatest` fallback | Delete | Explicit `busy` or `stale` result | Failed reads must not masquerade as coherent reads |
| public `base`, `schema`, `primitives` packages | Internalize | Internal implementation folders | Avoid package and semver gravity |
| `worklet-mount` | Remove from core/public v0 | Adapter-private worklet host code | Browser lifecycle is adapter-owned |
| `introspect` | Remove | Later narrow diagnostic readers if earned | Avoid open-ended framework scope |

## 3.1 Important naming boundary

The browser platform class is literally named `AudioWorkletProcessor`. Adapter code may extend that platform class because the browser requires it.

That does **not** permit Seqlok to restore a public `processor` role.

Acceptable adapter-private naming:

```ts
class StretchRuntimeWorklet extends AudioWorkletProcessor {
  // Signalsmith adapter implementation
}
```

Rejected Seqlok-facing naming:

```ts
const processor = bindProcessor(...);
processor.meters.publish(...);
```

Likewise, the demo UI may contain a component named `VuMeter`. That does not justify a `meters` abstraction in Seqlok.

The clean layer statement is:

```text
Seqlok has publications.
The Signalsmith adapter publishes processed-output level status.
The demo UI renders a VU meter.
The browser platform provides AudioWorkletProcessor.
```

---

# 4. Boundary primitives

## 4.1 Publications

A publication carries coherent **latest state**.

Use a publication when:

- intermediate states may be superseded;
- readers need one coherent current snapshot;
- no reader acknowledgement is required for every update;
- the writer is singular;
- readers may be multiple.

Examples in the Signalsmith adapter:

- desired active/rate/pitch/formant state;
- current engine status;
- latency values;
- source-buffer extent;
- processed-output level status;
- cumulative underrun/overflow/error counters.

A publication is not a queue and must not pretend to preserve every intermediate write.

### Exact snapshot invariant

A snapshot is valid only when:

1. the reader observes a committed even sequence before copying;
2. the reader copies all fields into caller-owned scratch;
3. the reader observes the same even sequence after copying;
4. the copied lineage matches the reader’s expected resource, session, generation, and continuity.

Otherwise:

- no snapshot is returned;
- caller-owned scratch remains unchanged;
- the result explicitly reports `busy`, `stale`, `invalidated`, `version-mismatch`, or `layout-mismatch` as applicable.

There is no degraded “latest” fallback.

### Writer contract

The writer:

1. validates values and lineage before beginning the commit;
2. prepares all potentially throwing work before touching the shared sequence;
3. marks the sequence odd;
4. performs bounded, non-throwing numeric writes;
5. marks the sequence with the next even committed value.

If an impossible internal failure occurs after the sequence becomes odd, the slot fails closed and the session is invalidated. The sequence must not be advanced as if a complete value was committed.

## 4.2 Commands

A command carries **ordered discrete intent**.

Use a command when:

- order matters;
- each accepted record must be considered;
- the operation is discrete;
- a lifecycle or timing transition is being requested;
- latest-wins replacement would be incorrect.

Examples in the Signalsmith adapter:

- create/destroy;
- configure/select preset;
- reset;
- seek;
- schedule a transport segment;
- flush;
- add an input chunk descriptor;
- release/drop consumed chunks.

Commands are adapter vocabulary encoded through a generic Seqlok envelope. They are never Seqlok core exports.

### Overflow policy

V0 uses drop-newest:

- accepted older records are never overwritten;
- enqueue returns failure to the producer;
- a persistent overflow counter increments;
- the attempted sequence and capacity are observable;
- recovery policy belongs to the adapter/product.

### Target validation order

Before invoking adapter or engine code, a consumer validates:

1. resource;
2. session;
3. generation;
4. continuity when the command affects temporal state;
5. sequence monotonicity;
6. payload validity.

A seek, reset, destroy, source replacement, or runtime recreation must not depend solely on successful queue delivery to invalidate older work. The authoritative lineage changes first. Physically queued stale commands then self-reject.

## 4.3 Bulk data plane

Bulk PCM is neither a publication nor a command payload.

The Signalsmith adapter owns a separate data plane:

- immutable planar `Float32` chunks;
- adapter-private shared PCM pool;
- fixed numeric chunk handles;
- source-generation-tagged descriptors;
- explicit buffer extent;
- release only after applied acknowledgement.

Seqlok may provide generic layout and queue mechanics. It does not export an audio stream buffer or PCM abstraction in v0.

## 4.4 Diagnostics

Diagnostics are persistent boundary facts, not a lossy event stream.

Use:

- cumulative counters;
- last code;
- last sequence;
- expected/observed identity;
- lineage tags;
- saturation rules.

Do not use:

- stack traces in shared memory;
- strings in the hot path;
- unbounded event logs;
- exceptions for normal overflow/stale/busy outcomes.

---

# 5. Good Seqlok API shape

The following examples define the intended public shape. Exact spelling can change only when implementation evidence improves the contract. The architectural direction cannot change without a new decision record.

## 5.1 Layout definition and attachment

```ts
import {
  commandQueueRegion,
  compileLayout,
  createLayout,
  defineStruct,
  f32,
  f64,
  publicationRegion,
  u32,
} from "seqlok/layout";

const desiredStateStruct = defineStruct({
  active: u32(),
  rate: f64(),
  semitones: f64(),
});

const statusStruct = defineStruct({
  inputFrameLo: u32(),
  inputFrameHi: u32(),
  outputFrameLo: u32(),
  outputFrameHi: u32(),
  inputLatencyFrames: u32(),
  outputLatencyFrames: u32(),
  rmsLeft: f32(),
  rmsRight: f32(),
  peakLeft: f32(),
  peakRight: f32(),
  clipCount: u32(),
  lastAppliedSequenceLo: u32(),
  lastAppliedSequenceHi: u32(),
  lastErrorCode: u32(),
});

const descriptor = createLayout({
  protocolVersion: 1,
  layoutVersion: 1,
  regions: {
    desiredState: publicationRegion(desiredStateStruct),
    status: publicationRegion(statusStruct),
    commands: commandQueueRegion({
      capacity: 64,
      payloadWords: 16,
    }),
  },
});

const compiled = compileLayout(descriptor);
```

Allocation and attachment are separate:

```ts
import {
  allocateLayout,
  attachLayout,
} from "seqlok/layout";

const allocation = allocateLayout(compiled);
const attached = attachLayout(compiled, allocation.buffer);

if (!attached.ok) {
  handleAttachmentFailure(attached);
}
```

`attachLayout` validates before returning typed views:

- protocol version;
- layout version;
- layout hash;
- total bytes;
- base offset and available byte length;
- region count;
- region offsets, lengths, scalar widths, and alignments.

V0 should support attaching at an explicit byte offset inside a larger `SharedArrayBuffer`, but it must not expose WASM-, Electron-, or mmap-specific helpers.

## 5.2 Publication construction

```ts
import { createPublicationSlot } from "seqlok/core";

const desiredState = createPublicationSlot(
  attached.value.regions.desiredState,
);

const status = createPublicationSlot(
  attached.value.regions.status,
);
```

The region carries its inferred struct type. Consumers should not need type assertions to recover publication typing.

## 5.3 Publication write

```ts
const commitResult = desiredState.writer.commit({
  lineage: {
    resourceId,
    sessionId,
    generationId,
    continuityId,
  },
  value: {
    active: 1,
    rate: 1.0,
    semitones: 0,
  },
});

if (!commitResult.ok) {
  handleCommitFailure(commitResult);
}
```

## 5.4 Coherent read

```ts
const desiredScratch = {
  active: 0,
  rate: 1,
  semitones: 0,
};

const readResult = desiredState.reader.readInto(desiredScratch, {
  expectedLineage: {
    resourceId,
    sessionId,
    generationId,
    continuityId,
  },
  maxAttempts: 2,
});

if (readResult.ok) {
  applyDesiredState(desiredScratch);
} else {
  handleReadFailure(readResult);
}
```

The read implementation must preserve `desiredScratch` byte-for-byte on failure. It may copy into internal/preallocated scratch and only copy to the caller after validation, or use another mechanism that proves the same guarantee.

## 5.5 Generic command envelope

```ts
export interface CommandEnvelope<
  TKind extends number,
  TPayload,
> {
  readonly kind: TKind;
  readonly sequenceId: SequenceId;
  readonly resourceId: ResourceId;
  readonly sessionId: SessionId;
  readonly generationId: GenerationId;
  readonly continuityId: ContinuityId;
  readonly payload: TPayload;
}
```

Wire policy:

- fixed-width numeric header;
- exact integer representation;
- zero reserved as invalid/uninitialized;
- sequence ordering scoped to one producer session;
- adapter-owned fixed-width payload codec;
- no JavaScript object crosses the real-time queue;
- no `any` in public TypeScript;
- no Signalsmith command union in Seqlok declarations.

## 5.6 Command queue

```ts
import { createCommandQueue } from "seqlok/commands";

const queue = createCommandQueue(
  attached.value.regions.commands,
  stretchCommandCodec,
);

const enqueueResult = queue.producer.enqueue({
  kind,
  sequenceId,
  resourceId,
  sessionId,
  generationId,
  continuityId,
  payload,
});

if (!enqueueResult.ok) {
  reportCommandEnqueueFailure(enqueueResult);
}
```

The real-time side uses caller-owned scratch and a bounded dequeue budget:

```ts
for (let remaining = 16; remaining > 0; remaining -= 1) {
  const result = queue.consumer.tryDequeueInto(commandScratch);

  if (!result.ok) {
    break;
  }

  applyValidatedCommand(commandScratch);
}
```

No unbounded drain helper is permitted on a real-time path.

---

# 6. Migration from the current repository

## 6.1 Strategy

1. Freeze the current repository’s inspected `dev` state as a private/source archive.
2. Create a fresh public repository and history.
3. Write the public contract before copying implementation.
4. Copy no directory wholesale.
5. Re-derive every public export from this document.
6. Salvage implementation only when it satisfies the new invariant and naming contract.
7. Do not provide compatibility aliases for rejected architecture.

The current root README is explicitly non-authoritative for the new public package because it centers structured `params`/`meters`, `controller`/`processor`/`observer` bindings, `Handoff`, and a multi-package topology.

## 6.2 Salvage and rewrite

Salvage concepts and tests, not package structure:

- low-level assertion/invariant helpers;
- numeric error/fact representation where bounded and appropriate;
- alignment and typed-view arithmetic;
- canonical serialization and stable hashing concepts;
- contiguous shared backing allocation;
- seqlock mechanics;
- SWSR ring mechanics;
- fixed-width command codec ideas;
- platform checks limited to required shared-memory assumptions;
- packing, alignment, wraparound, ABA/interleaving, public-export, and backing tests that still target accepted invariants.

Specific source candidates to inspect and rewrite include:

- `packages/primitives/src/seqlock.ts`;
- SWSR ring implementation files;
- `packages/commands/src/codec.ts`;
- mailbox/ring mechanics, renamed and stripped of old dependencies;
- core layout packing and backing calculations;
- canonical hash implementation lessons;
- selected property and regression tests.

## 6.3 Delete from the new public repository

Do not copy:

- `apps/playground/**`;
- flock demo documents or implementation;
- `packages/core/src/binding/**`;
- `packages/core/src/context/**`;
- the current role-oriented spec DSL;
- params/meters builders and shape mirrors;
- controller/processor/observer bindings and snapshots;
- `SharedContext`;
- `Handoff` as an API/lifecycle concept;
- `CommandBus`;
- public `diagnostics`, `introspect`, `worklet-mount`, or `streambuf` packages;
- Vue/Tailwind demo infrastructure;
- product-shaped examples;
- audio-specific helpers in core;
- stale architecture docs that teach the rejected flow;
- old release topology and prerelease history;
- formal/tooling residue not executed by the new release pipeline.

The archived flock documents remain historical material only. They are not a second proof and must not shape the public API.

## 6.4 Postpone

Postpone until independent evidence requires them:

- public stream buffer;
- partitioned backing;
- WASM-owned backing;
- native mmap helpers;
- Electron helpers;
- worklet mounting;
- introspection/time-travel tooling;
- diagnostic event rings;
- MPMC queues;
- command fan-in;
- arbitrary schema DSL;
- strings, variants, and variable-length shared fields;
- code generation;
- custom Signalsmith frequency maps;
- variable-rate live input;
- plugin/runtime abstractions;
- public Signalsmith adapter package.

---

# 7. Implementation sequence

## Stage 0: Freeze and contract

Create the fresh repository with:

- `README.md`;
- `docs/thesis.md`;
- `docs/invariants.md`;
- `docs/non-goals.md`;
- `docs/layout-abi.md`;
- `docs/public-api.md`;
- `docs/release-gates.md`;
- source pin record for all salvaged code and Signalsmith.

Exit criteria:

- this doctrine is reflected in all public prose;
- forbidden vocabulary appears only in migration/non-goal explanations;
- no code is copied before export and invariant review.

## Stage 1A: Layout and coherent publication nucleus

Implement only:

- fixed-width scalar structs;
- layout and region descriptors;
- canonical compilation;
- protocol version, layout version, hash, byte length, alignment, and region table;
- one contiguous `SharedArrayBuffer` allocation;
- exact attachment validation;
- typed region views;
- resource/session/generation/continuity identities;
- one publication slot;
- strict writer commit;
- strict reader `readInto`;
- resource/session invalidation;
- minimal generic facts.

Do not implement commands yet.

Exit criteria:

- coherent snapshot tests pass under forced interleavings;
- failed reads leave scratch unchanged;
- failed writer preflight changes neither payload nor commit sequence;
- mixed-generation reads are impossible;
- attachment fails before views on any identity mismatch;
- public declarations contain no audio/domain/role vocabulary.

## Stage 1B: Commands

Add:

- generic envelope;
- fixed-width codec contract;
- SWSR queue;
- explicit capacity;
- FIFO dequeue;
- bounded drain/dequeue budget;
- drop-newest overflow fact;
- stale lineage rejection.

Exit criteria:

- FIFO survives wraparound;
- overflow cannot corrupt accepted data;
- resource/session/generation/continuity rejection is deterministic;
- no command vocabulary leaks into core.

## Stage 2: Concurrent fake boundary harness

Create a private test harness using a Worker or equivalent concurrent boundary.

This is not a public demo. It exists only to prove:

- attachment across contexts;
- publication coherence;
- queue order;
- stale/invalidation behavior;
- overflow behavior;
- bounded hot-path operations.

Do not generalize it into a worker/worklet package.

## Stage 3: Custom Signalsmith adapter

Build a private proof package or companion repository that:

- pins an exact Signalsmith upstream commit;
- records the generated WASM artifact hash;
- wraps the C++ engine through an adapter-private ABI;
- hosts the engine in an adapter-private AudioWorklet runtime;
- attaches Seqlok command/publication memory;
- owns PCM chunk memory and timing conversion;
- exposes no Signalsmith type through Seqlok.

The official Signalsmith web release is an upstream behavior oracle and comparison target. It is not the architecture for the serious Seqlok proof because its internal MessagePort protocol hides the boundary Seqlok is intended to prove.

## Stage 4: Buffer-backed superior demo

Implement the first public demo with:

- local file upload/drag-and-drop;
- decoded planar PCM;
- waveform overview;
- play/pause/stop;
- seek and loop range;
- independent stretch rate and semitone controls;
- tonality and formant controls;
- quality/configuration controls where safe;
- original/processed comparison with clearly defined switching behavior;
- input/output latency display;
- buffer extent/readiness state;
- last-applied command and runtime state;
- underrun/overflow/error visibility;
- stereo processed-output VU display.

Live input, export/render, arbitrary automation lanes, and custom frequency maps are not required for the first release. They may be added to the same demo later, after the fixed-file timing model is trusted.

## Stage 5: Timing and failure hardening

Prove:

- cumulative rate accounting;
- frame rounding and long-duration drift bound;
- input/output latency mapping;
- seek/reset continuity behavior;
- source replacement generation behavior;
- loop boundaries;
- end/flush behavior;
- buffer release acknowledgement;
- underrun and overflow policy;
- worklet/runtime restart invalidation;
- browser matrix and deployment requirements;
- hot-path allocation behavior.

## Stage 6: Public release gate

Publish only when the release gates in this document pass. The proof package remains private or separately published only after it has earned an independent consumer.

---

# 8. Signalsmith Stretch as the first and only public proof

## 8.1 Product objective

The proof must be a materially better Signalsmith Stretch experience than the current minimal web demo, not merely a prettier wrapper.

It should make the engine:

- musically useful;
- easy to audition;
- transparent about timing and latency;
- robust under seek, loop, reset, and source replacement;
- inspectable when the boundary rejects, overflows, underruns, or becomes stale;
- professionally presented without turning Seqlok into an audio product API.

## 8.2 Final architecture

```text
Demo renderer/product
  owns UI, waveform, musical intent, transport intent, presets, and VU rendering

Signalsmith host adapter
  decodes/owns PCM chunks, compiles desired state and commands, reads status

Seqlok shared boundary
  desired-state publication
  command queue
  runtime-status publication
  generic diagnostics and lineage

StretchRuntimeWorklet (adapter-private AudioWorklet implementation)
  hosts pinned Signalsmith C++/WASM
  reads desired state and commands
  processes audio
  computes processed-output level facts
  commits runtime status

Web Audio graph
  receives the processed output
```

The platform base class `AudioWorkletProcessor` is present only inside adapter-private browser code. There is no public Seqlok `processor` role.

## 8.3 Integration route

Final decision:

- use the official web release as a behavior oracle, source reference, and optional development comparison;
- use a custom C++/WASM adapter for the actual Seqlok proof;
- pin upstream by exact commit and artifact hash, not package version alone;
- keep all worklet, WASM, Signalsmith, PCM, and browser lifecycle code outside the `seqlok` package.

This is intentionally not the easiest route. It is the route that proves the actual boundary.

## 8.4 Bootstrap versus hot-path transport

The adapter-private `MessagePort` is used only for bootstrap and rare lifecycle communication:

- deliver the shared buffers and expected layout identity once;
- report ready/fatal initialization state when shared publication is not yet available;
- coordinate explicit teardown or recreation.

The port is not the hot telemetry or control path. After attachment:

- desired latest state crosses through a publication;
- ordered discrete intent crosses through the command queue;
- runtime status and output levels return through a publication;
- bulk PCM is addressed through adapter-private shared chunk descriptors.

No per-quantum object messages are part of the proof architecture.

## 8.5 Boundary lanes for the demo

### Desired-state publication

Adapter-owned fields may include:

- active;
- immediate rate;
- semitones;
- tonality limit;
- formant semitones;
- formant compensation;
- formant base;
- loop start/end frames;
- automation generation;
- source generation;
- continuity generation.

These are not Seqlok “params.” They are fields in a Signalsmith adapter publication.

### Command queue

Adapter commands may include:

- create;
- configure;
- select preset;
- reset;
- seek;
- schedule transport segment;
- flush;
- destroy;
- add input chunk;
- release consumed chunk.

These are not Seqlok commands as domain exports. They are adapter-defined records transported by Seqlok.

### Runtime-status publication

Adapter-owned fields may include:

- input frame/time;
- output frame/time;
- processing-center frame;
- input latency frames;
- output latency frames;
- current source extent;
- current resource/session/generation/continuity;
- runtime state code;
- last applied command sequence;
- underrun count;
- overflow count;
- last error code;
- processed-output RMS/peak fields;
- cumulative clip count.

This is an ordinary Seqlok publication. There is no separate `StatusSlot` implementation hierarchy and no `meters` API.

---

# 9. Processed-output levels and the VU display

## 9.1 Final decision

The demo will include a basic stereo VU display.

The proof will **not** use:

- `AnalyserNode` as the final level path;
- per-quantum `MessagePort.postMessage()` telemetry;
- a public Seqlok meter abstraction;
- a public Seqlok processor role;
- a separate class named `MeterProcessor`;
- renderer-side access to the audio callback.

The custom Signalsmith adapter worklet will compute level facts directly from the processed output it already produced and commit those facts into its runtime-status publication.

This avoids an extra audio node, keeps the level calculation aligned with the actual processed output, and proves the Seqlok publication path.

## 9.2 Data path

```text
Signalsmith C++/WASM output
  -> adapter-private level calculation
  -> runtime-status publication
  -> renderer reads latest coherent snapshot on requestAnimationFrame
  -> VuMeter component renders bars/peak hold/clip state
```

The VU display is product/UI language. The shared data is adapter-owned output-level status. Seqlok only knows fixed fields in a publication.

## 9.3 Minimum fields

For the first release:

- `rmsLeft`;
- `rmsRight`;
- `peakLeft`;
- `peakRight`;
- `clipCountTotal`;
- `levelWindowEndFrame` as an exact split cursor;
- current lineage;
- publication commit sequence supplied by Seqlok.

Optional later fields:

- mono RMS/peak;
- true-peak approximation;
- peak-hold values;
- invalid-sample count;
- silence state.

Do not add spectral bands, loudness standards, or elaborate metering to the first release.

## 9.4 Calculation and publication policy

The audio side:

1. reads the actual output quantum length; it never hardcodes 128 frames;
2. sanitizes non-finite samples;
3. accumulates sum-of-squares per channel;
4. tracks maximum absolute sample per channel;
5. aggregates over a fixed frame window suitable for roughly 30–60 status updates per second;
6. commits one coherent status snapshot at the window boundary;
7. preserves cumulative clip facts so a delayed UI cannot erase them;
8. resets only the window accumulators after a successful commit.

The renderer:

- reads once per animation frame;
- converts linear values to dB for display;
- applies presentation smoothing/decay;
- never assumes every audio-side publication will be observed;
- uses cumulative clip count to detect missed clip events;
- does not write back to the audio runtime from the VU component.

Suggested display range:

- floor around `-72 dB`;
- visible range around `-60 dB` to `0 dB`;
- clip indication when the adapter’s declared peak rule is crossed.

These are demo presentation choices, not Seqlok semantics.

## 9.5 Hot-path rules

The worklet path must not:

- allocate arrays, objects, strings, promises, closures, or typed-array views per quantum;
- call `postMessage()` per quantum;
- throw for normal boundary outcomes;
- wait or spin until a publication succeeds;
- use `Atomics.wait`;
- perform unbounded retries;
- resize JS containers or C++ vectors;
- grow WASM memory;
- parse strings or dynamic objects;
- instantiate errors or capture stacks.

One bounded publication attempt is sufficient. If the status commit cannot proceed, the adapter increments a persistent diagnostic and continues audio processing.

---

# 10. Timing and buffer decisions

## 10.1 Fixed-file playback first

The first release is buffer-backed playback.

The adapter owns:

- decoded PCM pool;
- channel layout;
- sample-rate validation;
- planar conversion;
- source chunk handles;
- source generation;
- retained seek/loop horizon;
- buffer extent;
- drop/release acknowledgement.

V0 constraints:

- `Float32` planar PCM;
- fixed channel count per resource;
- mono and stereo explicitly supported;
- decoded sample rate matches the active context/engine rate or is resampled before the real-time path;
- immutable chunks while visible to the worklet;
- no decoding, deinterleaving, allocation, or detachment on the audio thread.

A sequential audio ring is not the first buffer model because fixed-file seek and loop require retained random access. Use an adapter-private immutable chunk pool plus a fixed descriptor table/queue.

## 10.2 Timing ownership

The adapter owns all conversion among:

- AudioContext output frame/time;
- engine processing-center frame;
- input source frame;
- output frame;
- input latency;
- output latency;
- scheduled product intent;
- fixed-file pre-roll;
- end/flush behavior;
- integer process sizes;
- drift correction.

Seqlok may transport numeric fields. It does not interpret them.

## 10.3 Rate accumulation

Do not independently round each quantum as:

```text
inputFrames = round(outputFrames * rate)
```

Use cumulative accounting so integer process sizes average to the requested ratio over time. The exact implementation may use fixed-point arithmetic or another deterministic accumulator, but long-run error must remain bounded and tested.

A correction larger than the declared small rounding bound is a discontinuity and requires a new continuity identity.

## 10.4 Latency

Publish input and output latency separately in frame space.

Do not collapse the internal scheduling model to total latency only. The adapter needs both halves to align source data, processing-center automation, audible output, pre-roll, and end/flush behavior.

---

# 11. Edge-case contract

The following are required design cases, not optional polish.

| Case | Required behavior |
| --- | --- |
| Shared memory unavailable or page not cross-origin isolated | Refuse the Seqlok proof path with a clear setup diagnostic; do not silently switch to a different architecture and call it equivalent |
| Worklet runs before init/attachment | Output defined silence, remain uninitialized, publish nothing, never throw |
| Protocol/layout/version/hash/size mismatch | Attachment fails before any reader/writer capability is created |
| Variable render quantum size | Use actual channel length and advance exact frame cursor accordingly |
| Mono file | Process one channel and report one-channel behavior explicitly; UI may mirror visually but adapter identity remains mono |
| Stereo file | Process two planar channels and publish independent levels |
| Unsupported dynamic channel change | Reject or recreate the resource/session; never reinterpret the same layout silently |
| Non-finite PCM/output sample | Treat according to declared sanitization rule and increment a persistent diagnostic |
| Publication reader catches writer mid-commit | Return `busy`; caller scratch remains unchanged |
| Publication writer preflight fails | Payload and commit sequence remain unchanged |
| Worklet/runtime recreation | New session identity; all old commands/publications self-reject |
| Source replacement | New source generation; old chunk handles and commands self-reject |
| Seek/reset | New continuity identity becomes authoritative before dependent work is queued |
| Queue full | Drop newest; preserve accepted FIFO records; increment persistent overflow fact |
| Late scheduled command | Adapter reports late/rejected/applied-late according to explicit policy; core does not invent recovery |
| Missing source chunk | Output silence for affected frames, increment underrun, never repeat stale audio silently |
| End of fixed file | Drive processing center to end, flush declared tail, publish draining/completed state |
| Loop boundary | Source mapping and continuity behavior are deterministic and fixture-tested |
| UI/render stall | Audio continues; status remains latest; cumulative diagnostics preserve important facts |
| Background/resume | No unbounded catch-up work; UI reattaches/validates lineage before trusting status |
| AudioContext sample-rate or graph recreation | New session; old status and commands are rejected |
| WASM memory growth attempt after activation | Forbidden/fatal adapter diagnostic; runtime is recreated rather than remapping silently |
| Status reader misses level windows | Latest level remains usable; cumulative clip count preserves clip facts |
| Normal hot-path failure | Numeric result/fact, no exception or stack construction |

---

# 12. Invariant test minimum

Before the implementation is trusted, the following tests must exist:

1. layout protocol mismatch rejects before view creation;
2. layout version mismatch rejects before view creation;
3. same byte length with different field type/order fails hash/region validation;
4. identical canonical descriptor produces stable identity;
5. writer commit advances exactly once to an even stable sequence;
6. writer preflight failure changes neither sequence nor payload;
7. forced interleavings never produce a mixed-field snapshot;
8. failed bounded read leaves caller scratch byte-for-byte unchanged;
9. mixed-generation read is rejected;
10. resource invalidation blocks physically queued old work;
11. session recreation rejects old commands and publications;
12. continuity replacement rejects pre-seek/reset work;
13. accepted commands drain FIFO across ring wrap;
14. queue overflow drops newest and preserves accepted records;
15. queue arithmetic survives unsigned counter wrap;
16. consumer work never exceeds declared budget;
17. diagnostic counters survive later publication commits;
18. fake concurrent boundary proves attachment, publication, command, stale, and overflow behavior;
19. Signalsmith pinned-engine smoke test produces finite output and valid frame counts;
20. input/output latency frame conversion matches fixtures;
21. long-run rate accumulation remains within the declared frame bound;
22. source extent reflects add/release operations coherently;
23. chunks cannot be reclaimed before applied acknowledgement;
24. missing input produces silence plus persistent underrun fact;
25. reset/seek race is resolved exclusively by authoritative continuity;
26. source replacement invalidates old handles;
27. output-level RMS/peak calculation matches deterministic fixtures;
28. clip bursts are observable through cumulative clip count even when UI reads slowly;
29. variable render quantum lengths preserve frame cursor and level calculations;
30. hot publication/read and command dequeue loops allocate no JavaScript objects after setup;
31. package declaration scan contains no forbidden core vocabulary;
32. tarball export snapshot contains only documented public subpaths and files.

---

# 13. Public API firewall

The public package and declarations must not contain exports named for:

- controller;
- processor;
- observer;
- params;
- meters;
- deck;
- track;
- cue;
- tempo;
- pitch;
- formant;
- tonality;
- loop;
- transport;
- AudioWorklet;
- WASM;
- Electron;
- mmap;
- Signalsmith;
- renderer;
- plugin;
- engine;
- runtime context;
- command bus;
- shared context;
- handoff.

Contextual exceptions:

- migration/non-goal documentation may name rejected concepts;
- adapter-private proof code may use Signalsmith and Web Audio platform terminology;
- product UI may use musical and VU terminology;
- the public Seqlok package may use generic terms such as `writer`, `reader`, `producer`, `consumer`, `publication`, `command`, `layout`, `region`, `lineage`, `snapshot`, `commit`, `drain`, `overflow`, `stale`, `resource`, `session`, `generation`, and `continuity`.

Add an automated declaration/API snapshot test for this firewall.

---

# 14. Future runtime compatibility without scope expansion

The design should not prevent future native Rust, mmap, Electron, or shared `WebAssembly.Memory` adapters. Those environments reinforce the value of versioned layouts, coherent publications, lineage, and bounded commands.

They do not change the current public scope.

For v0:

- Seqlok operates on `SharedArrayBuffer` and validated byte regions;
- the Signalsmith proof uses separate Seqlok shared memory beside adapter-owned WASM memory;
- AudioWorklet exists only in the proof adapter;
- no Electron/native/mmap path is implemented or demonstrated;
- no `allocateWasmShared`, `mountWorklet`, `mapNativeMemory`, or `createElectronBridge` public API exists.

Later adapters may pass a compatible shared buffer/region into the same attachment contract. Any native ABI work must preserve the exact layout, alignment, atomic, and lineage semantics. That future research must not be allowed to enlarge Stage 1 or dilute the first demo.

---

# 15. Release gates

Do not publish `seqlok` v0.1.0 until all of the following are true:

- one package with only `/layout`, `/core`, and `/commands` is produced;
- no role, audio, worklet, WASM, renderer, plugin, or product semantics leak into public declarations;
- attachment validates protocol version, layout version, hash, byte length, base offset, and region table before returning views;
- failed snapshots return no new value and leave caller scratch unchanged;
- failed writer preflight cannot expose a partial commit;
- resource/session invalidation does not depend on successful command enqueue;
- generation and continuity stale rejection are deterministic;
- queue capacity and overflow semantics are unambiguous;
- hot-path operations are bounded and allocation-audited;
- no unbounded retry/drain API can be accidentally used on the real-time side;
- the official Signalsmith source is pinned by exact commit and generated artifact hash;
- the custom adapter retains input and output latency separately;
- rate accumulation, seek/reset, source replacement, underrun, overflow, buffer release, and end/flush behavior have deterministic tests;
- processed-output levels are published through the adapter status publication, not MessagePort events or `AnalyserNode`;
- VU display fixtures validate RMS, peak, clip preservation, and variable block sizes;
- the proof deployment checks the required shared-memory/browser isolation conditions;
- the tarball contains no playground, flock, worklet host, Signalsmith proof, introspection, stale docs, or old monorepo package residue.

---

# 16. Final decisions at a glance

- **Migration:** selective extraction into a fresh public repository.
- **Public package:** one `seqlok` package.
- **Public surfaces:** `seqlok/layout`, `seqlok/core`, `seqlok/commands`.
- **Core worldview:** capabilities, not roles.
- **Rejected:** controller/processor/observer, params/meters, binding framework, SharedContext, Handoff, CommandBus.
- **Publication meaning:** coherent latest state.
- **Command meaning:** ordered discrete intent.
- **Bulk data:** adapter-owned data plane.
- **Status:** ordinary publication with adapter-defined fields.
- **First implementation:** layout identity plus coherent publication only.
- **Second implementation:** generic bounded commands.
- **First public proof:** Signalsmith Stretch superior demo.
- **Signalsmith route:** custom pinned C++/WASM adapter; official web release only as oracle/comparison.
- **AudioWorklet:** adapter-private browser platform implementation, never a Seqlok export or role.
- **VU:** product UI component fed by adapter-owned processed-output level fields in the runtime-status publication.
- **VU transport:** shared publication, not per-quantum messages and not `AnalyserNode` in the final proof.
- **Initial media mode:** buffer-backed fixed file.
- **Live input:** deferred.
- **Flock:** archived and excluded.
- **WASM-owned backing, native mmap, Electron bridges:** future adapter research, excluded from v0 and the first demo.
- **Suggested first implementation commit:** `feat(core): establish layout and publication nucleus`.

---

# 17. Source basis

This decision is based on:

- the current Seqlok `dev` architecture and its role-oriented README/package graph;
- the completed Seqlok reset and Signalsmith Stretch planning review dated 2026-06-21;
- the Seqlok migration-review baseline `dev` commit `1fc9cfb362d70277c8cd437bf54819b22c7d017e`;
- the Signalsmith source-review baseline commit `57b93f4e9206a089a45387eaa39bdc9f310d3308`;
- the Signalsmith Stretch C++ repository and API documentation;
- the official Signalsmith web demo as the baseline the proof must surpass.

Primary external references:

- Signalsmith Stretch repository: <https://github.com/Signalsmith-Audio/signalsmith-stretch>
- Signalsmith Stretch API/documentation: <https://signalsmith-audio.co.uk/code/stretch/>
- Official Signalsmith Stretch demo: <https://signalsmith-audio.co.uk/code/stretch/demo/>

The upstream Signalsmith source/artifact identity must be re-verified and pinned immediately before implementation begins.
