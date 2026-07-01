import { describe, it, expectTypeOf } from "vitest";

import {
  type Backing,
  isPackedBacking,
  isPartitionedBacking,
  isWasmBacking,
  type PackedBacking,
  type PartitionedBacking,
  type WasmBacking,
} from "../../src/backing/types";

import type { HydratePatch as RootHydratePatch } from "../../src";
import type {
  ControllerMeters,
  ControllerParams,
  Ephemeral,
  MeterWriter,
  ParamValueFor,
  ProcessorParams,
} from "../../src/binding/common/types";
import type { SpecInput } from "../../src/spec/types";

describe("Backing Union Type Guards (Signatures)", () => {
  it("isPackedBacking(b: Backing): b is PackedBacking", () => {
    expectTypeOf(isPackedBacking).parameter(0).toEqualTypeOf<Backing>();
    expectTypeOf(isPackedBacking).guards.toEqualTypeOf<PackedBacking>();
  });

  it("isPartitionedBacking(b: Backing): b is PartitionedBacking", () => {
    expectTypeOf(isPartitionedBacking)
      .parameter(0)
      .toEqualTypeOf<Backing>();
    expectTypeOf(
      isPartitionedBacking,
    ).guards.toEqualTypeOf<PartitionedBacking>();
  });

  it("isWasmBacking(b: Backing): b is WasmBacking", () => {
    expectTypeOf(isWasmBacking).parameter(0).toEqualTypeOf<Backing>();
    expectTypeOf(isWasmBacking).guards.toEqualTypeOf<WasmBacking>();
  });
});

describe("Backing Union Discriminants (Extract<> Mapping)", () => {
  it("maps discriminants to exact backing shapes", () => {
    type C = Extract<Backing, { kind: "packed" }>;
    type S = Extract<Backing, { kind: "partitioned" }>;
    type W = Extract<Backing, { kind: "wasm" }>;

    expectTypeOf<C>().toEqualTypeOf<PackedBacking>();
    expectTypeOf<S>().toEqualTypeOf<PartitionedBacking>();
    expectTypeOf<W>().toEqualTypeOf<WasmBacking>();

    // Key property types.
    expectTypeOf<C["sab"]>().toEqualTypeOf<SharedArrayBuffer>();
    expectTypeOf<S["planes"]["PF32"]>().toEqualTypeOf<SharedArrayBuffer>();
    expectTypeOf<W["memory"]>().toEqualTypeOf<WebAssembly.Memory>();
  });
});

describe("Control-Flow Narrowing: Real-Value Runtime Checks", () => {
  it("narrows correctly in each branch", () => {
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
          shared: true,
          initial: 1,
          maximum: 1,
        }),
      },
    ] as const;

    for (const b of cases) {
      if (isPackedBacking(b)) {
        // Exact equality is safe post-narrow.
        expectTypeOf(b).toEqualTypeOf<PackedBacking>();
      } else if (isPartitionedBacking(b)) {
        expectTypeOf(b).toEqualTypeOf<PartitionedBacking>();
      } else if (isWasmBacking(b)) {
        expectTypeOf(b).toEqualTypeOf<WasmBacking>();
      } else {
        const _never: never = b;
      }
    }
  });
});

// TS 5.4+ typed array alias to keep assertions stable across library variations.
type F32RO = Readonly<Float32Array>;

describe("binding (compile-time contracts)", () => {
  interface S extends SpecInput {
    readonly id: "deck";
    readonly params: {
      rate: { kind: "f32"; min: 0.25; max: 4 };
      coeffs: { kind: "f32.array"; length: 16 };
      enabled: { kind: "bool" };
      mode: { kind: "enum"; values: readonly ["a", "b", "c"] };
    };
    readonly meters: {
      rms: { kind: "f32" };
      frame: { kind: "u32" };
      spectrum: { kind: "f32.array"; length: 512 };
    };
  }

  it("ControllerParams.update accepts only scalar params by key, with correct value types", () => {
    type UpdateArg = Parameters<ControllerParams<S>["update"]>[0];

    // Verified robust types without deprecations or mismatches.
    type UpdateKeys = keyof UpdateArg;
    type ScalarKeys = "rate" | "enabled" | "mode";

    // Keys are exactly the scalar keys (no arrays allowed like "coeffs").
    expectTypeOf<UpdateKeys>().toExtend<ScalarKeys>();
    expectTypeOf<ScalarKeys>().toExtend<UpdateKeys>();

    // Value types (optional-or-undefined semantics tolerated).
    expectTypeOf<UpdateArg["rate"]>().toExtend<number | undefined>();
    expectTypeOf<number | undefined>().toExtend<UpdateArg["rate"]>();

    expectTypeOf<UpdateArg["enabled"]>().toExtend<boolean | undefined>();
    expectTypeOf<boolean | undefined>().toExtend<UpdateArg["enabled"]>();

    expectTypeOf<UpdateArg["mode"]>().toExtend<("a" | "b" | "c") | undefined>();
    expectTypeOf<("a" | "b" | "c") | undefined>().toExtend<UpdateArg["mode"]>();
  });

  it("root HydratePatch export accepts scalar and array params", () => {
    type Patch = RootHydratePatch<S>;
    type HydrateKeys = keyof Patch;
    type AllParamKeys = "rate" | "coeffs" | "enabled" | "mode";

    expectTypeOf<HydrateKeys>().toExtend<AllParamKeys>();
    expectTypeOf<AllParamKeys>().toExtend<HydrateKeys>();
    expectTypeOf<Patch["rate"]>().toExtend<number | undefined>();
    expectTypeOf<Patch["coeffs"]>().toExtend<Float32Array | undefined>();
    expectTypeOf<Patch["enabled"]>().toExtend<boolean | undefined>();
    expectTypeOf<Patch["mode"]>().toExtend<("a" | "b" | "c") | undefined>();
  });

  it("MeterWriter has scalar writers and typed stage() for array meters", () => {
    type MW = MeterWriter<S>;

    type StageParams = Parameters<MW["stage"]>;
    type StageKey = StageParams[0];
    type StageCb = StageParams[1];
    type StageArg0 = Parameters<StageCb>[0];

    // Literal key.
    expectTypeOf<StageKey>().toEqualTypeOf<"spectrum">();

    // Callback uses Ephemeral<Float32Array>.
    expectTypeOf<StageCb>().toExtend<(dst: Ephemeral<Float32Array>) => void>();

    // Ephemeral view is still usable as a Float32Array in the body.
    expectTypeOf<StageArg0>().toExtend<Float32Array>();
  });

  it("ControllerMeters.snapshot returns a readonly view with correct shapes", () => {
    type Snap = ReturnType<ControllerMeters<S>["snapshot"]>;
    expectTypeOf<Snap["rms"]>().toEqualTypeOf<number>();
    expectTypeOf<Snap["frame"]>().toEqualTypeOf<number>();
    // Use assignability for typed arrays (TS/lib stability).
    expectTypeOf<Snap["spectrum"]>().toExtend<F32RO>();
  });

  it("ProcessorParams.within exposes readonly values with correct shapes", () => {
    // ProcessorParams.within exposes readonly values with correct shapes.
    type Within = Parameters<ProcessorParams<S>["within"]>[0];
    type ReadView = Parameters<Within>[0];

    expectTypeOf<ReadView["rate"]>().toExtend<number>();

    // Processor arrays are scratch views (mutable), not Readonly<>.
    expectTypeOf<ReadView["coeffs"]>().toExtend<Float32Array>();

    expectTypeOf<ReadView["enabled"]>().toExtend<boolean>();

    // Processor enum scalar is a numeric index (not label union).
    expectTypeOf<ReadView["mode"]>().toExtend<number>();

    // Compile-time check.
    type ModeCtl = ParamValueFor<S, "mode">;
    expectTypeOf<ModeCtl>().toExtend<"a" | "b" | "c">();
  });
});
