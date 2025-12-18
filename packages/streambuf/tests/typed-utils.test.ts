import { describe, expect, it } from "vitest";

import {
  StreambufTypeTag,
  tryTypeNameForTag,
  typeNameForTag,
  typeTagForConstructor,
} from "../src/index";

describe("typed utils", () => {
  it("maps constructors -> tags", () => {
    expect(typeTagForConstructor(Int8Array)).toBe(StreambufTypeTag.Int8);
    expect(typeTagForConstructor(Uint32Array)).toBe(StreambufTypeTag.Uint32);
    expect(typeTagForConstructor(Float32Array)).toBe(StreambufTypeTag.Float32);
    expect(typeTagForConstructor(Float64Array)).toBe(StreambufTypeTag.Float64);
  });

  it("maps tags -> names (and rejects unknown tags via try*)", () => {
    expect(tryTypeNameForTag(StreambufTypeTag.Int16)).toBe("int16");
    expect(tryTypeNameForTag(StreambufTypeTag.Uint8Clamped)).toBe(
      "uint8clamped",
    );
    expect(tryTypeNameForTag(0)).toBeUndefined();

    expect(typeNameForTag(StreambufTypeTag.Float64)).toBe("float64");
  });
});
