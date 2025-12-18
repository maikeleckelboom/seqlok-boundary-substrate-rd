import { invariant } from "@seqlok/base";

import { createStreambufError } from "./errors/streambuf";

export const QUANTUM_FRAMES = 128;

/**
 * Planar audio blocks (per-channel) for one quantum (128 frames).
 *
 * We allow `undefined` channels at the type level so runtime validation
 * remains meaningful under strict TS/ESLint.
 */
export type AudioBlockPlanar = readonly (Float32Array | undefined)[];

/**
 * Interleaved audio block for one quantum (128 frames) and N channels.
 *
 * Length must be at least `128 * channels`.
 */
export type AudioBlockInterleaved = Float32Array;

/**
 * A readable numeric array where indexed reads may be `undefined`.
 * This is intentionally shaped to stay compatible with `noUncheckedIndexedAccess`.
 */
interface ReadableNumberArray {
  readonly length: number;
  readonly [n: number]: number | undefined;
}

function requireChannels(channels: number, where: string): void {
  invariant(Number.isInteger(channels) && channels >= 1, () =>
    createStreambufError("invalidCount", {
      where,
      returned: channels,
      min: 1,
      max: 0x7fffffff,
    }),
  );
}

function requireMinLength(length: number, min: number, where: string): void {
  invariant(Number.isInteger(length) && length >= min, () =>
    createStreambufError("invalidCount", {
      where,
      returned: length,
      min,
      max: 0x7fffffff,
    }),
  );
}

function requireDefinedChannel(
  ch: Float32Array | undefined,
  where: string,
  index: number,
  channels: number,
): asserts ch is Float32Array {
  invariant(ch !== undefined, () =>
    createStreambufError("invalidCount", {
      where,
      returned: index,
      min: 0,
      max: Math.max(0, channels - 1),
    }),
  );
}

function readOrZero(src: ReadableNumberArray, index: number): number {
  return src[index] ?? 0;
}

function validateAndCollectInputs(inputs: AudioBlockPlanar): Float32Array[] {
  const channels = inputs.length;
  const dense: Float32Array[] = [];

  for (let c = 0; c < channels; c++) {
    const ch = inputs[c];
    requireDefinedChannel(
      ch,
      "audio.interleave128.inputs.channelUndefined",
      c,
      channels,
    );
    requireMinLength(
      ch.length,
      QUANTUM_FRAMES,
      "audio.interleave128.inputs.channelLength",
    );
    dense.push(ch);
  }

  return dense;
}

function validateAndCollectOutputs(outputs: AudioBlockPlanar): Float32Array[] {
  const channels = outputs.length;
  const dense: Float32Array[] = [];

  for (let c = 0; c < channels; c++) {
    const ch = outputs[c];
    requireDefinedChannel(
      ch,
      "audio.deinterleave128.outputs.channelUndefined",
      c,
      channels,
    );
    requireMinLength(
      ch.length,
      QUANTUM_FRAMES,
      "audio.deinterleave128.outputs.channelLength",
    );
    dense.push(ch);
  }

  return dense;
}

/**
 * Interleave planar channels into an interleaved buffer (128 frames).
 *
 * Layout: [frame0_ch0, frame0_ch1, ... frame0_chN-1, frame1_ch0, ...]
 */
export function interleave128(
  inputs: AudioBlockPlanar,
  outInterleaved: AudioBlockInterleaved,
): void {
  const channels = inputs.length;
  requireChannels(channels, "audio.interleave128.channels");

  const expected = QUANTUM_FRAMES * channels;
  requireMinLength(
    outInterleaved.length,
    expected,
    "audio.interleave128.outInterleaved",
  );

  const inCh = validateAndCollectInputs(inputs);

  // Hot loop (no `arr[c]` access, no `!`, no TS2532).
  let w = 0;
  for (let i = 0; i < QUANTUM_FRAMES; i++) {
    for (const ch of inCh) {
      outInterleaved[w++] = readOrZero(ch, i);
    }
  }
}

/**
 * Deinterleave an interleaved buffer into planar outputs (128 frames).
 */
export function deinterleave128(
  inInterleaved: AudioBlockInterleaved,
  outputs: AudioBlockPlanar,
): void {
  const channels = outputs.length;
  requireChannels(channels, "audio.deinterleave128.channels");

  const expected = QUANTUM_FRAMES * channels;
  requireMinLength(
    inInterleaved.length,
    expected,
    "audio.deinterleave128.inInterleaved",
  );

  const outCh = validateAndCollectOutputs(outputs);

  let r = 0;
  for (let i = 0; i < QUANTUM_FRAMES; i++) {
    for (const ch of outCh) {
      ch[i] = readOrZero(inInterleaved, r++);
    }
  }
}
