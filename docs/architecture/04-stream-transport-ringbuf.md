# Stream Transport: `@seqlok/streambuf`

**Status:** Draft  
**Audience:** Engine + infra implementers, waveform/PCM pipeline implementers  
**Scope:** Where bulk streaming lives in Seqlok, and where it explicitly does *not* live.

## 0. Purpose

`@seqlok/streambuf` provides **high-throughput, allocation-avoiding, shared-memory stream transport** (SWSR) for data
that
is *too large* or *too frequent* to model as Seqlok params/meters.

Primary targets:

- PCM streaming (decoder worker → AudioWorklet)
- Analysis frames (FFT bins, onset strengths, loudness windows)
- Progressive waveform products (extremes/LOD tiles, energy bands, markers batches)

This package exists to keep:

- `@seqlok/core` focused on **typed shared state + coherence** (params/meters)
- `@seqlok/commands` focused on **discrete intent/event transport**
- bulk data movement **out of** params/meters and **out of** command rings

## 1. Non-goals

`@seqlok/streambuf` does **not**:

- define product command schemas, opcodes, or codecs (that’s `@seqlok/commands` and product code)
- define system topology (which threads exist, who owns what) (host wiring / future `@seqlok/compose`)
- provide MWMR primitives (it stays SWSR; MWMR is a topology-level composition pattern)
- perform DSP, decoding, resampling, or waveform analysis itself (product-level code)

## 2. Where it sits in the package graph

`@seqlok/streambuf` is a **Runtime** package.

- Imports: `@seqlok/base`, `@seqlok/primitives`
- Must not import: `@seqlok/core`, `@seqlok/commands`, `@seqlok/hotswap`, `@seqlok/integration`, `@seqlok/introspect`,
  `@seqlok/docs`

Rationale: stream buffers are a **low-level transport primitive**. They should stay usable in any environment that can
provide `SharedArrayBuffer` or `WebAssembly.Memory`, without pulling in Seqlok’s typed-domain system.

### 2.1 Dependency graph update (canonical)

Add `streambuf` to the Runtime layer and connect it only “down”:

```mermaid
flowchart LR
  subgraph Base
    base
  end

  subgraph Runtime
    direction TB
    hotswap
    commands
    core
    streambuf
    primitives
  end

  subgraph Tooling
    direction TB
    introspect
  end

  subgraph Host
    direction TB
    integration
    playground
  end

  primitives --> base
  core --> primitives
  core --> base
  commands --> core
  commands --> primitives
  hotswap --> commands
  hotswap --> core

  streambuf --> primitives
  streambuf --> base

  integration --> hotswap
  integration --> commands
  integration --> core
  integration --> introspect
  playground --> integration
  playground --> introspect

  introspect --> base
  introspect --> primitives
  introspect --> core
  introspect --> commands
  introspect --> hotswap
````

If host code needs `streambuf`, add the arrow explicitly (e.g. `integration --> streambuf`). Do not “reach across” with
relative imports.

## 3. Choosing the right transport

Seqlok has three distinct transport categories. They are not interchangeable.

### 3.1 State: params/meters (`@seqlok/core`)

Use when you need **the latest truth** and coherence:

* playhead position (scalar)
* zoom window, selection window (scalars)
* small fixed arrays (EQ bands, small envelopes)
* current spectrum slice (small fixed array)
* counters / telemetry (meters)

Properties:

* SWMR writer semantics, coherent snapshots
* great for “poll and render”
* not a streaming channel; not suited for large bulk payloads

### 3.2 Discrete intent: command rings (`@seqlok/commands`)

Use when you need **events**:

* seek
* load track
* spawn/prime/swap
* “invalidate cache region”
* mode toggles, discrete state machine transitions

Properties:

* small fixed records
* bounded processing per audio block
* explicit backpressure (no silent drop by default)

### 3.3 Bulk streams: `@seqlok/streambuf`

Use when you need **a lot of bytes** at a sustained rate:

* PCM blocks
* analysis frames
* waveform tiles
* encoded packets (if you want to stream bytes rather than objects)

Properties:

* SWSR stream semantics
* zero-alloc “claim/commit” APIs
* explicit overflow reporting; policy lives in wrappers, not in the primitive

## 4. Core semantics and invariants

### 4.1 SWSR only

Every streambuf instance is:

* exactly one producer
* exactly one consumer

No exceptions.

If you need multiple writers, you build **multiple SWSR streambufs** and fan them into a single hub thread
(topology-level pattern). If you need multiple readers, you replicate the stream or expose derived state via
meters/observer patterns.

### 4.2 No allocations on the hot path

The hot-path API must avoid:

* creating new arrays per operation
* returning new objects per read/write in tight loops

Preferred pattern:

* `claimWrite(n)` returns *views* into the underlying shared buffer (often up to two contiguous regions due to
  wraparound)
* producer writes into those views
* `commitWrite(written)`
* consumer mirrors with `claimRead(n)` / `commitRead(read)`

### 4.3 Explicit pressure surfacing

Base primitive must not “magically” decide what to drop.

* operations return counts (`written`, `read`)
* wrappers may implement policies (drop-oldest, drop-newest, overwrite), but they must be opt-in and visible in naming

## 5. Module surface (proposed)

`@seqlok/streambuf/core`

* SWSR cursor management, claim/commit, wrap handling
* byte layout: indices + capacity + buffer region
* minimal utilities (capacity math, sanity checks)

`@seqlok/streambuf/bytes`

* `ByteRing` over `Uint8Array`

`@seqlok/streambuf/audio`

* `AudioRingF32Interleaved` (frames * channels)
* optional `AudioRingF32Planar` (per-channel planes)
* explicit discontinuity markers (sequence bump / reset flag)

`@seqlok/streambuf/pool` (optional, but likely valuable)

* fixed-size block pool in shared memory
* ring transports `{blockIndex, length, seq, flags}` instead of payload bytes
* enables true “bulk without copying” for large frames

`@seqlok/streambuf/params` (optional)

* a tiny param-change queue (u16 paramId + f32 value + optional frameIndex)

## 6. Relationship to waveform rendering

Waveform rendering typically needs two things:

1. **Big, mostly-immutable assets** (LODs, extremes, markers)
   These should live as normal typed arrays (or SAB-backed arrays) owned by the UI/data layer.

2. **Realtime coordination** (what should be shown now)
   This belongs in `@seqlok/core` params/meters (playhead, zoom, selections) and `@seqlok/commands` (seeks, reloads).

`@seqlok/streambuf` is the bridge when the asset is being produced progressively:

* decoder produces PCM blocks → streambuf
* analyzer computes waveform tiles → either:

  * publish small “latest truth” into meters, and/or
  * stream tile batches via streambuf to a UI accumulator

Rule of thumb:

* If the consumer only needs “latest values”: use meters.
* If the consumer needs every frame/block in order: use streambuf.

## 7. Review checklist (guardrails)

A PR that adds or changes `@seqlok/streambuf` must answer:

* Is this transport SWSR (single producer, single consumer)?
* Is the hot path allocation-free?
* Are overflow/backpressure behaviors explicit?
* Are we accidentally duplicating `@seqlok/commands` semantics (events/codecs)?
* Are we accidentally moving shared-state responsibilities out of `@seqlok/core`?

## 8. Summary

`@seqlok/streambuf` is the **bulk stream transport** leg of the ecosystem:

* `@seqlok/core` → coherent shared state (params/meters)
* `@seqlok/commands` → discrete intent/events
* `@seqlok/streambuf` → high-throughput streaming payloads

Keeping those boundaries sharp is what keeps Seqlok fast, predictable, and extensible.
