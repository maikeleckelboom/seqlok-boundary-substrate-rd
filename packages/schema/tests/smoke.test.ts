import { describe, expect, it } from "vitest";

import schemaArtifact from "../spec-ast/v1.json";
import {
  SPEC_AST_V1_ID,
  SchemaValidationError,
  normalizeSpecAst,
  validateSpecAst,
} from "../src/index";
import * as schema from "../src/index";

describe("schema package smoke", () => {
  it("validates a minimal authored spec", () => {
    const isValid = validateSpecAst({
      id: "smoke",
      params: {
        gain: { kind: "f32", min: 0, max: 1 },
      },
      meters: {},
    });

    expect(SPEC_AST_V1_ID).toBe("https://seqlok.dev/schema/spec-ast/v1.json");
    expect(isValid).toBe(true);
  });

  it("keeps the public runtime surface narrow", () => {
    expect(Object.keys(schema).sort()).toEqual([
      "SPEC_AST_V1_ID",
      "SchemaValidationError",
      "normalizeSpecAst",
      "validateSpecAst",
    ]);
  });

  it("keeps the exported schema id aligned with the artifact", () => {
    expect(schemaArtifact.$id).toBe(SPEC_AST_V1_ID);
  });

  it("rejects unknown authored properties structurally", () => {
    expect(() =>
      validateSpecAst({
        params: {
          gain: { kind: "f32", step: 0.1 },
        },
      }),
    ).toThrow(SchemaValidationError);
  });

  it("does not perform semantic range validation", () => {
    expect(
      validateSpecAst({
        params: {
          inverted: { kind: "f32", min: 10, max: 1 },
        },
      }),
    ).toBe(true);
  });

  it("normalizes only the authored AST layer", () => {
    const normalized = normalizeSpecAst({
      meters: {},
      params: {
        zed: { max: 1, kind: "f32", min: 0 },
        nested: {
          beta: { values: ["b", "a"], kind: "enum" },
          alpha: { length: 2, kind: "u8.array" },
        },
      },
    });

    expect(normalized).toEqual({
      params: {
        nested: {
          alpha: { kind: "u8.array", length: 2 },
          beta: { kind: "enum", values: ["b", "a"] },
        },
        zed: { kind: "f32", max: 1, min: 0 },
      },
    });
  });
});
