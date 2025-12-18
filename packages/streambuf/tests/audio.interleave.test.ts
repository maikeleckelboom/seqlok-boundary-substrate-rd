import { describe, expect, it } from "vitest";

import { deinterleave128, interleave128 } from "../src/index";

function fillPattern(dst: Float32Array, scale: number, bias: number): void {
  for (let i = 0; i < dst.length; i++) {
    dst[i] = i * scale + bias;
  }
}

describe("audio interleave/deinterleave", () => {
  it("roundtrips 2ch planar <-> interleaved", () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);

    fillPattern(left, 0.01, 1.0);
    fillPattern(right, 0.02, -1.0);

    const interleaved = new Float32Array(256);
    interleave128([left, right], interleaved);

    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    deinterleave128(interleaved, [outL, outR]);

    expect(Array.from(outL)).toEqual(Array.from(left));
    expect(Array.from(outR)).toEqual(Array.from(right));
  });

  it("throws when the interleaved buffer is too small", () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);

    expect(() => {
      interleave128([left, right], new Float32Array(255));
    }).toThrow();
  });

  it("throws when the planar output buffers are too small", () => {
    const interleaved = new Float32Array(256);

    expect(() => {
      deinterleave128(interleaved, [
        new Float32Array(127),
        new Float32Array(128),
      ]);
    }).toThrow();
  });
});
