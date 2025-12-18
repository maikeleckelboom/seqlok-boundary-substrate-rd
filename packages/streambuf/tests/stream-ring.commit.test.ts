import { describe, expect, it } from "vitest";

import { expectStreambufError } from "./expect-streambuf-error";
import { allocateStreamRing } from "../src/index";

function mustReadU32(storage: Uint32Array, index: number): number {
  const v = storage[index];
  if (v === undefined) {
    throw new RangeError(
      `Out-of-bounds typed-array read: index=${String(index)} length=${String(storage.length)}`,
    );
  }
  return v;
}

function readPrefixU32(
  storage: Uint32Array,
  offset0: number,
  length0: number,
  offset1: number,
  length1: number,
  take: number,
): number[] {
  const out: number[] = [];
  if (take <= 0) {
    return out;
  }

  const t0 = Math.min(take, length0);
  for (let i = 0; i < t0; i++) {
    out.push(mustReadU32(storage, offset0 + i));
  }

  const remain = take - t0;
  if (remain <= 0) {
    return out;
  }

  const t1 = Math.min(remain, length1);
  for (let i = 0; i < t1; i++) {
    out.push(mustReadU32(storage, offset1 + i));
  }

  return out;
}

describe("StreamRing commit semantics", () => {
  it("allows partial commits for readWithOffsets", () => {
    const ring = allocateStreamRing({ capacity: 8, type: Uint32Array });

    expect(ring.push(new Uint32Array([10, 11, 12, 13]))).toBe(4);
    expect(ring.availableRead()).toBe(4);

    const commitDesired = 2;
    const captured: number[] = [];

    const consumed = ring.readWithOffsets(4, (storage, o0, n0, o1, n1) => {
      // Important: callback sees the whole claimed window, even if we commit less.
      captured.push(...readPrefixU32(storage, o0, n0, o1, n1, commitDesired));
      return commitDesired;
    });

    expect(consumed).toBe(2);
    expect(captured).toEqual([10, 11]);

    const out = new Uint32Array(4);
    expect(ring.pop(out, 4)).toBe(2);
    expect(Array.from(out.subarray(0, 2))).toEqual([12, 13]);
  });

  it("increments writeSeq only when a write commits > 0", () => {
    const ring = allocateStreamRing({ capacity: 8, type: Uint32Array });

    expect(ring.debug.writeSeq).toBe(0);

    expect(ring.writeWithOffsets(3, () => 0)).toBe(0);
    expect(ring.debug.writeSeq).toBe(0);

    const committed = ring.writeWithOffsets(3, (storage, o0, n0) => {
      if (n0 >= 2) {
        storage[o0] = 123;
        storage[o0 + 1] = 456;
      }
      return 2;
    });

    expect(committed).toBe(2);
    expect(ring.debug.writeSeq).toBe(1);
  });

  it("counts droppedWrites only when writable === 0 and requested > 0", () => {
    const ring = allocateStreamRing({ capacity: 2, type: Uint32Array });

    expect(ring.debug.droppedWrites).toBe(0);

    expect(ring.push(new Uint32Array([1, 2]))).toBe(2);
    expect(ring.availableWrite()).toBe(0);

    expect(ring.push(new Uint32Array([3]))).toBe(0);
    expect(ring.debug.droppedWrites).toBe(1);

    // requested === 0 while full => must NOT increment droppedWrites
    expect(ring.writeWithOffsets(0, () => 0)).toBe(0);
    expect(ring.debug.droppedWrites).toBe(1);
  });

  it("rejects invalid commit counts returned by callbacks", () => {
    const ring = allocateStreamRing({ capacity: 8, type: Uint32Array });

    expectStreambufError(
      () => {
        ring.writeWithOffsets(3, () => 4);
      },
      "streambuf.invalidCount",
      "stream-ring.writeWithOffsets.commit",
    );

    expect(ring.push(new Uint32Array([1, 2, 3]))).toBe(3);

    expectStreambufError(
      () => {
        ring.readWithOffsets(3, () => 4);
      },
      "streambuf.invalidCount",
      "stream-ring.readWithOffsets.commit",
    );
  });

  it("reset clears indices, writeSeq, and droppedWrites", () => {
    const ring = allocateStreamRing({ capacity: 4, type: Uint32Array });

    expect(ring.push(new Uint32Array([1, 2, 3, 4]))).toBe(4);
    expect(ring.push(new Uint32Array([9]))).toBe(0);
    expect(ring.debug.droppedWrites).toBe(1);
    expect(ring.debug.writeSeq).toBe(1);

    ring.reset();

    expect(ring.availableRead()).toBe(0);
    expect(ring.availableWrite()).toBe(4);
    expect(ring.debug.droppedWrites).toBe(0);
    expect(ring.debug.writeSeq).toBe(0);
  });
});
