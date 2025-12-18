import { describe, expect, it } from "vitest";

import { StreamRing, allocateStreamRing } from "../src/index";

describe("streambuf smoke", () => {
  it("allocates and attaches", () => {
    const prod = allocateStreamRing({ capacity: 16, type: Float32Array });
    const sab = prod.backing.sab;

    const cons = StreamRing.attach({ sab, type: Float32Array });

    expect(cons.capacity).toBe(16);
    expect(cons.typeName).toBe("float32");
  });
});
