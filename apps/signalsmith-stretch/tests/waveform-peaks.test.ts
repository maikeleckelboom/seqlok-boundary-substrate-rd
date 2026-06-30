import { describe, expect, it } from "vitest";

import {
  MAX_WAVEFORM_BIN_COUNT,
  resamplePeaksMax,
  resolveWaveformBinCount,
} from "../src/audio/waveform-peaks";

describe("waveform peak helpers", () => {
  it("resolves responsive bins from CSS width and DPR", () => {
    expect(resolveWaveformBinCount(320, 1)).toBe(480);
    expect(resolveWaveformBinCount(800, 2)).toBe(2_400);
  });

  it("clamps responsive bins to the renderer maximum", () => {
    expect(resolveWaveformBinCount(12_000, 4)).toBe(MAX_WAVEFORM_BIN_COUNT);
  });

  it("resamples peaks with a max-window strategy", () => {
    const source = new Float32Array([0.1, 0.8, 0.2, 0.4, 0.9, 0.3]);

    expect(rounded(resamplePeaksMax(source, 3))).toEqual([0.8, 0.4, 0.9]);
  });

  it("upsamples by carrying the source peak for each target window", () => {
    const source = new Float32Array([0.2, 0.7]);

    expect(rounded(resamplePeaksMax(source, 4))).toEqual([0.2, 0.2, 0.7, 0.7]);
  });
});

function rounded(values: Readonly<Float32Array>): number[] {
  return Array.from(values, (value) => Number(value.toFixed(3)));
}
