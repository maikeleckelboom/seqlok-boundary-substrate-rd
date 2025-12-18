import { describe, expect, it } from "vitest";

import { allocateStreamRing } from "../src/index";

describe("StreamRing wrap-around", () => {
  it("wraps correctly across the end", () => {
    const ring = allocateStreamRing({ capacity: 7, type: Uint32Array });

    const a = new Uint32Array([1, 2, 3, 4, 5]);
    const b = new Uint32Array([6, 7, 8, 9]);

    expect(ring.push(a)).toBe(5);

    const tmp = new Uint32Array(3);
    expect(ring.pop(tmp, 3)).toBe(3);
    expect(Array.from(tmp)).toEqual([1, 2, 3]);

    expect(ring.push(b)).toBe(4);

    const out = new Uint32Array(6);
    expect(ring.pop(out, 6)).toBe(6);
    expect(Array.from(out)).toEqual([4, 5, 6, 7, 8, 9]);
  });
});
