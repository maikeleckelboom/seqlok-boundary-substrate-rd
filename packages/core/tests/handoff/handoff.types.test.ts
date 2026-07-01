import { describe, it, expectTypeOf } from "vitest";

import { type buildHandoff } from "../../src/handoff/handoff";

import type {
  Backing,
  PackedBacking,
  PartitionedBacking,
  WasmBacking,
} from "../../src/backing/types";
import type { Plan } from "../../src/plan/types";
import type { SpecInput } from "../../src/spec/types";

describe("Handoff v1: Type Barrier Contracts", () => {
  it("buildHandoff second parameter is the Backing union (packed | partitioned | wasm)", () => {
    type SecondParam = Parameters<typeof buildHandoff>[1];
    expectTypeOf<SecondParam>().toEqualTypeOf<Backing>();
    expectTypeOf<Backing>().toEqualTypeOf<SecondParam>();
  });

  it("buildHandoff accepts all Backing variants at the type level", () => {
    type SecondParam = Parameters<typeof buildHandoff>[1];

    expectTypeOf<PackedBacking>().toExtend<SecondParam>();
    expectTypeOf<PartitionedBacking>().toExtend<SecondParam>();
    expectTypeOf<WasmBacking>().toExtend<SecondParam>();
  });

  it("buildHandoff preserves the spec type parameter from the Plan", () => {
    interface S extends SpecInput {
      id: "x";
      params: { gain: { kind: "f32"; min: 0; max: 2 } };
      meters: { peak: { kind: "f32" } };
    }

    type P = Plan<S>;
    type Env = ReturnType<typeof buildHandoff<S>>;

    // The handoff should still be tied to Plan<S> / SpecInput S
    expectTypeOf<Env["plan"]>().toEqualTypeOf<P>();
  });
});
