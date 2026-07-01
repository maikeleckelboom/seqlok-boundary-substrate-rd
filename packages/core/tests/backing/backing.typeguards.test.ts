import { describe, expect, it } from "vitest";

import {
  isPackedBacking,
  isPartitionedBacking,
  isWasmBacking,
  type Backing,
  type PackedBacking,
  type PartitionedBacking,
  type WasmBacking,
} from "../../src/backing/types";

/**
 * Helper to allocate a SharedArrayBuffer of a specific size.
 * Used to populate mock backing structures.
 */
const allocSab = (bytes: number) => new SharedArrayBuffer(bytes);

describe("Backing Type Guards: Runtime Identification", () => {
  it("correctly identifies and narrows a standard contiguous PackedBacking", () => {
    const b: Backing = { kind: "packed", sab: allocSab(16) };

    expect(isPackedBacking(b)).toBe(true);

    // Verify structural access after narrowing
    expect((b satisfies PackedBacking).sab.byteLength).toBe(16);
  });

  it("correctly identifies and narrows a partitioned backing layout", () => {
    const b: Backing = {
      kind: "partitioned",
      planes: {
        PF32: allocSab(4),
        PI32: allocSab(4),
        PB: allocSab(1),
        PU: allocSab(8),
        MF32: allocSab(4),
        MF64: allocSab(8),
        MU32: allocSab(4),
        MU: allocSab(8),
      },
    };

    expect(isPartitionedBacking(b)).toBe(true);
    expect((b satisfies PartitionedBacking).planes.PB.byteLength).toBe(1);
  });

  it("correctly identifies and narrows a WebAssembly shared memory backing", () => {
    const mem = new WebAssembly.Memory({
      initial: 1,
      maximum: 1,
      shared: true,
    });
    const b: Backing = { kind: "wasm", memory: mem };

    expect(isWasmBacking(b)).toBe(true);
    expect(
      (b satisfies WasmBacking).memory.buffer instanceof
        SharedArrayBuffer,
    ).toBe(true);
  });
});
