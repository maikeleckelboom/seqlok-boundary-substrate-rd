import { describe, expect, it } from "vitest";

import { defineSpec, planLayout } from "../../src";

import type { CanonicalSpecFromAst } from "../../src";

describe("canonical spec compilation", () => {
  it("flattens authored namespaces to deterministic dot keys", () => {
    const spec = defineSpec(({ param, meter }) => ({
      id: "nested-runtime-contract",
      params: {
        transport: {
          tempo: param.f32({ min: 20, max: 300 }),
          bar: {
            beat: param.u32({ min: 0, max: 64 }),
          },
        },
      },
      meters: {
        engine: {
          load: meter.f32(),
          state: meter.enum(["idle", "running"]),
        },
      },
    }));

    expect(Object.keys(spec.params)).toEqual([
      "transport.bar.beat",
      "transport.tempo",
    ]);
    expect(Object.keys(spec.meters)).toEqual(["engine.load", "engine.state"]);
    expect(spec.params["transport.bar.beat"]).toMatchObject({
      kind: "u32",
      min: 0,
      max: 64,
    });
    expect(planLayout(spec).params["transport.bar.beat"]).toMatchObject({
      kind: "u32",
      plane: "PI32",
    });
  });

  it("compiles authored AST and plain canonical object forms equivalently", () => {
    const authored = defineSpec(({ param, meter }) => ({
      id: "ast-plain-equivalence",
      params: {
        audio: {
          gain: param.f32({ min: 0, max: 1 }),
          mode: param.enum(["clean", "drive"]),
        },
      },
      meters: {
        levels: {
          peak: meter.f32(),
          state: meter.enum(["silent", "active"]),
        },
      },
    }));

    const plain = defineSpec({
      id: "ast-plain-equivalence",
      params: {
        "audio.gain": { kind: "f32", min: 0, max: 1 },
        "audio.mode": { kind: "enum", values: ["clean", "drive"] },
      },
      meters: {
        "levels.peak": { kind: "f32" },
        "levels.state": { kind: "enum", values: ["silent", "active"] },
      },
    });

    expect(authored).toEqual(plain);
    expect(planLayout(authored)).toEqual(planLayout(plain));
  });

  it("derives stable anonymous ids from canonical contents", () => {
    const first = defineSpec(({ param }) => ({
      params: {
        nested: {
          value: param.i32({ min: -4, max: 4 }),
        },
      },
    }));
    const second = defineSpec({
      params: {
        "nested.value": { kind: "i32", min: -4, max: 4 },
      },
    });
    const changed = defineSpec({
      params: {
        "nested.value": { kind: "i32", min: -5, max: 4 },
      },
    });

    expect(first.id).toMatch(/^anon_[0-9a-f]{16}$/u);
    expect(second.id).toBe(first.id);
    expect(changed.id).not.toBe(first.id);
  });

  it("exposes flattened keys through CanonicalSpecFromAst", () => {
    const ast = {
      id: "typed-canonical",
      params: {
        group: {
          count: { kind: "u32", min: 0, max: 100 },
          bytes: { kind: "u8.array", length: 4 },
        },
      },
      meters: {
        runtime: {
          status: { kind: "enum", values: ["idle", "busy"] },
        },
      },
    } as const;

    type Canonical = CanonicalSpecFromAst<typeof ast>;
    const spec: Canonical = defineSpec(ast);

    expect(spec.params["group.count"].kind).toBe("u32");
    expect(spec.params["group.bytes"].kind).toBe("u8.array");
    expect(spec.meters["runtime.status"].kind).toBe("enum");
  });
});
