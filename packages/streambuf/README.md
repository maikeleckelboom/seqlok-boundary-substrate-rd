# `@seqlok/streambuf`

Bulk, allocation-avoiding **SWSR** (single-writer / single-reader) stream transport in shared memory.

This is Seqlok’s “big payload” leg:

- `@seqlok/core` → coherent shared state (params/meters)
- `@seqlok/commands` → discrete intent/events
- `@seqlok/streambuf` → sustained byte/sample/frame streams

## What it is

A small set of low-level primitives that let one producer and one consumer move
lots of data through a `SharedArrayBuffer` with **claim/commit** semantics and **no per-operation allocations**.

Primary targets:

- PCM streaming (decoder worker → AudioWorklet)
- Analysis frames (FFT bins, onset windows, loudness windows)
- Progressive waveform products (extremes/LOD tiles, marker batches)

## What it is not

- Not a codec/opcode system (that’s `@seqlok/commands` + product code)
- Not topology (which threads exist) (that’s host wiring)
- Not MWMR primitives (stay SWSR; compose topologies externally)
- Not DSP/decoding/resampling/analysis (product-level)

## Runtime notes

If you’re using this across threads in the browser, you still need the usual
cross-origin isolation headers for `SharedArrayBuffer` (COOP/COEP).

## Quick sketch

```ts
import { allocateStreamRing, StreamRing } from "@seqlok/streambuf";

// Producer thread:
const ring = allocateStreamRing({ capacity: 48_000, type: Float32Array });
postMessage({ sab: ring.backing.sab });

// Consumer thread:
const sab: SharedArrayBuffer = received.sab;
const cons = StreamRing.attach({ sab, type: Float32Array });

// Hot-path write (no allocations):
ring.writeWithOffsets(128, (storage, o0, n0, o1, n1) => {
  for (let i = 0; i < n0; i++) storage[o0 + i] = i;
  for (let i = 0; i < n1; i++) storage[o1 + i] = i;
});

// Hot-path read (no allocations):
cons.readWithOffsets(128, (storage, o0, n0, o1, n1) => {
  // consume without allocating
});
```
