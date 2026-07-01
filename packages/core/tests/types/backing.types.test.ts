import { describe, it, expectTypeOf } from "vitest";

import {
  isPackedBacking,
  isPartitionedBacking,
  isWasmBacking,
} from "../../src/backing/types";

import type {
  Backing,
  PackedBacking,
  PartitionedBacking,
  WasmBacking,
} from "../../src/backing/types";

describe("Backing Types (Compile-Time Contracts)", () => {
  it("discriminated union and guards narrow precisely", () => {
    const cases: Backing[] = [
      { kind: "packed", sab: new SharedArrayBuffer(8) },
      {
        kind: "partitioned",
        planes: {
          PF32: new SharedArrayBuffer(0),
          PI32: new SharedArrayBuffer(0),
          PB: new SharedArrayBuffer(0),
          PU: new SharedArrayBuffer(8),
          MF32: new SharedArrayBuffer(0),
          MF64: new SharedArrayBuffer(0),
          MU32: new SharedArrayBuffer(0),
          MU: new SharedArrayBuffer(8),
        },
      },
      {
        kind: "wasm",
        memory: new WebAssembly.Memory({
          initial: 1,
          maximum: 1,
          shared: true,
        }),
      },
    ];

    for (const b of cases) {
      if (isPackedBacking(b)) {
        expectTypeOf(b).toExtend<PackedBacking>();
      } else if (isPartitionedBacking(b)) {
        expectTypeOf(b).toExtend<PartitionedBacking>();
      } else if (isWasmBacking(b)) {
        expectTypeOf(b).toExtend<WasmBacking>();
      }
    }
  });
});
