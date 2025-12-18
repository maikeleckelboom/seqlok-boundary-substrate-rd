import { describe, expect, it } from "vitest";

import { allocateStreamRing } from "../src/index";

describe("StreamRing debug snapshot", () => {
  it("reports capacity, counters, and availability", () => {
    const ring = allocateStreamRing({ capacity: 4, type: Uint32Array });

    expect(ring.debug.capacity).toBe(4);
    expect(ring.debug.typeName).toBe("uint32");
    expect(ring.debug.writeSeq).toBe(0);
    expect(ring.debug.droppedWrites).toBe(0);
    expect(ring.debug.availableRead).toBe(0);
    expect(ring.debug.availableWrite).toBe(4);

    expect(ring.push(new Uint32Array([1, 2, 3, 4]))).toBe(4);
    expect(ring.debug.availableRead).toBe(4);
    expect(ring.debug.availableWrite).toBe(0);
    expect(ring.debug.writeSeq).toBe(1);

    // Overflow attempt should drop (writable === 0 path)
    expect(ring.push(new Uint32Array([9]))).toBe(0);
    expect(ring.debug.droppedWrites).toBe(1);

    const out = new Uint32Array(2);
    expect(ring.pop(out, 2)).toBe(2);
    expect(Array.from(out)).toEqual([1, 2]);

    expect(ring.debug.availableRead).toBe(2);
    expect(ring.debug.availableWrite).toBe(2);
  });
});
