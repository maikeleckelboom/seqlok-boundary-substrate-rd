/**
 * @file Typed-array tagging utilities for @seqlok/streambuf.
 * @license MIT
 */
import { panic } from "@seqlok/base";

export const STREAMBUF_HEADER_WORDS = 16;
export const STREAMBUF_HEADER_BYTES: number = STREAMBUF_HEADER_WORDS * 4;

export type NumberTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export interface NumberTypedArrayConstructor<
  T extends NumberTypedArray = NumberTypedArray,
> {
  readonly BYTES_PER_ELEMENT: number;
  readonly name: string;

  new (length: number): T;
  new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
}

export enum StreambufTypeTag {
  Int8 = 1,
  Uint8 = 2,
  Uint8Clamped = 3,
  Int16 = 4,
  Uint16 = 5,
  Int32 = 6,
  Uint32 = 7,
  Float32 = 8,
  Float64 = 9,
}

export type StreambufTypeTagName =
  | "int8"
  | "uint8"
  | "uint8clamped"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "float32"
  | "float64";

// Compare number-to-number to satisfy @typescript-eslint/no-unsafe-enum-comparison.
const TYPE_TAG_MIN: number = StreambufTypeTag.Int8 as number;
const TYPE_TAG_MAX: number = StreambufTypeTag.Float64 as number;

export function isStreambufTypeTag(tag: number): tag is StreambufTypeTag {
  return Number.isInteger(tag) && tag >= TYPE_TAG_MIN && tag <= TYPE_TAG_MAX;
}

export function typeTagForConstructor(
  ctor: NumberTypedArrayConstructor,
): StreambufTypeTag | undefined {
  if (ctor === Int8Array) {
    return StreambufTypeTag.Int8;
  }
  if (ctor === Uint8Array) {
    return StreambufTypeTag.Uint8;
  }
  if (ctor === Uint8ClampedArray) {
    return StreambufTypeTag.Uint8Clamped;
  }
  if (ctor === Int16Array) {
    return StreambufTypeTag.Int16;
  }
  if (ctor === Uint16Array) {
    return StreambufTypeTag.Uint16;
  }
  if (ctor === Int32Array) {
    return StreambufTypeTag.Int32;
  }
  if (ctor === Uint32Array) {
    return StreambufTypeTag.Uint32;
  }
  if (ctor === Float32Array) {
    return StreambufTypeTag.Float32;
  }
  if (ctor === Float64Array) {
    return StreambufTypeTag.Float64;
  }
  return undefined;
}

export function tryTypeNameForTag(
  tag: number,
): StreambufTypeTagName | undefined {
  if (!isStreambufTypeTag(tag)) {
    return undefined;
  }

  switch (tag) {
    case StreambufTypeTag.Int8:
      return "int8";
    case StreambufTypeTag.Uint8:
      return "uint8";
    case StreambufTypeTag.Uint8Clamped:
      return "uint8clamped";
    case StreambufTypeTag.Int16:
      return "int16";
    case StreambufTypeTag.Uint16:
      return "uint16";
    case StreambufTypeTag.Int32:
      return "int32";
    case StreambufTypeTag.Uint32:
      return "uint32";
    case StreambufTypeTag.Float32:
      return "float32";
    case StreambufTypeTag.Float64:
      return "float64";
  }
}

export function typeNameForTag(tag: StreambufTypeTag): StreambufTypeTagName {
  const name = tryTypeNameForTag(tag);
  if (name === undefined) {
    // Should never happen for StreambufTypeTag, but keeps runtime behavior explicit.
    panic(`Unknown StreambufTypeTag: ${String(tag)}`);
  }
  return name;
}
