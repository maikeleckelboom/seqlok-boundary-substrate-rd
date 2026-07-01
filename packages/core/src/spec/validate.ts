import { createError } from "../errors/error";
import { isPlainObject } from "../internal/is-plain-object";

import type { SpecAstInput } from "./types";

export interface ScalarRangeInput {
  readonly min?: number;
  readonly max?: number;
}

export interface ScalarRangeOptions {
  readonly integer?: boolean;
  readonly unsigned?: boolean;
}

export function createRangeInput(min?: number, max?: number): ScalarRangeInput {
  if (min !== undefined && max !== undefined) {
    return { min, max };
  }
  if (min !== undefined) {
    return { min };
  }
  if (max !== undefined) {
    return { max };
  }
  return {};
}

export function assertValidateScalarRange(
  key: string,
  { min, max }: ScalarRangeInput,
  options: ScalarRangeOptions = {},
): void {
  for (const [name, value] of [
    ["min", min],
    ["max", max],
  ] as const) {
    if (value === undefined) {
      continue;
    }
    if (Number.isNaN(value)) {
      throw createError("spec.rangeInvalid", `${name} cannot be NaN`, {
        key,
        [name]: value,
        reason: "nan",
      });
    }
    if (!Number.isFinite(value)) {
      throw createError("spec.rangeInvalid", `${name} must be finite`, {
        key,
        [name]: value,
        reason: "infinite",
      });
    }
    if (options.integer === true && !Number.isInteger(value)) {
      throw createError("spec.rangeInvalid", `${name} must be an integer`, {
        key,
        [name]: value,
        reason: "inverted",
      });
    }
    if (options.unsigned === true && value < 0) {
      throw createError("spec.rangeInvalid", `${name} must be non-negative`, {
        key,
        [name]: value,
        reason: "inverted",
      });
    }
  }

  if (min !== undefined && max !== undefined && !(min < max)) {
    throw createError("spec.rangeInvalid", "Range must satisfy min < max", {
      key,
      min,
      max,
      reason: "inverted",
    });
  }
}

export function parseArrayLen(
  length: number | { readonly length: number },
  key = "array.length",
): number {
  const value = typeof length === "number" ? length : length.length;

  if (
    !Number.isFinite(value) ||
    Number.isNaN(value) ||
    !Number.isInteger(value)
  ) {
    throw createError("spec.arrayInvalid", "Array length must be an integer", {
      key,
      length: value,
      reason: "fractional",
    });
  }

  if (value <= 0) {
    throw createError(
      "spec.arrayInvalid",
      "Array length must be a positive integer",
      {
        key,
        length: value,
        reason: "nonPositive",
      },
    );
  }

  return value;
}

export function asNonEmpty<const V extends readonly string[]>(
  values: V,
  key = "enum.values",
): V {
  if (values.length === 0) {
    throw createError("spec.enumInvalid", "Enum requires at least one value", {
      key,
      values,
    });
  }

  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "string" || value.length === 0) {
      throw createError(
        "spec.enumInvalid",
        "Enum values must be non-empty strings",
        {
          key,
          values,
          invalidIndex: index,
        },
      );
    }
    if (seen.has(value)) {
      throw createError("spec.enumInvalid", "Enum values must be unique", {
        key,
        values,
        duplicate: value,
      });
    }
    seen.add(value);
  }

  return values;
}

const PARAM_KINDS = new Set<string>([
  "f32",
  "i32",
  "u32",
  "bool",
  "enum",
  "f32.array",
  "i32.array",
  "u32.array",
  "u8.array",
  "i8.array",
  "i16.array",
  "u16.array",
  "bool.array",
  "enum.array",
]);

const METER_KINDS = new Set<string>([
  "f32",
  "f64",
  "i32",
  "u32",
  "bool",
  "enum",
  "f32.array",
  "f64.array",
  "u32.array",
  "bool.array",
]);

function failBuilder(key: string, detail: string): never {
  throw createError("spec.builderInvalid", "Spec AST is invalid", {
    key,
    reason: "invalidKind",
    detail,
  });
}

function validateLeaf(
  plane: "params" | "meters",
  key: string,
  value: Record<string, unknown>,
): void {
  const kind = value.kind;
  if (typeof kind !== "string") {
    failBuilder(`${plane}.${key}.kind`, "kind must be a string");
  }

  const allowedKinds = plane === "params" ? PARAM_KINDS : METER_KINDS;
  if (!allowedKinds.has(kind)) {
    failBuilder(`${plane}.${key}.kind`, `unsupported kind ${kind}`);
  }

  const isArray = kind.endsWith(".array");
  if (isArray) {
    if (!("length" in value)) {
      failBuilder(`${plane}.${key}.length`, "array length is required");
    }
    parseArrayLen(value.length as number, `${plane}.${key}.length`);
  }

  if (kind === "enum" || kind === "enum.array") {
    if (!("values" in value) || !Array.isArray(value.values)) {
      failBuilder(`${plane}.${key}.values`, "enum values are required");
    }
    asNonEmpty(value.values as readonly string[], `${plane}.${key}.values`);
  }

  if (kind === "f32" || kind === "i32" || kind === "u32") {
    assertValidateScalarRange(
      `${plane}.${key}`,
      createRangeInput(
        value.min as number | undefined,
        value.max as number | undefined,
      ),
      {
        integer: kind !== "f32",
        unsigned: kind === "u32",
      },
    );
  }
}

function validateNamespace(
  plane: "params" | "meters",
  path: readonly string[],
  node: unknown,
): void {
  if (!isPlainObject(node)) {
    failBuilder(plane, "namespace must be an object");
  }

  for (const [segment, child] of Object.entries(node)) {
    if (segment.length === 0) {
      failBuilder(
        `${plane}.${path.join(".")}`,
        "namespace segments must be non-empty",
      );
    }

    const childPath = [...path, segment];
    if (!isPlainObject(child)) {
      failBuilder(`${plane}.${childPath.join(".")}`, "entry must be an object");
    }

    if (typeof child.kind === "string") {
      validateLeaf(plane, childPath.join("."), child);
    } else {
      if (segment.includes(".")) {
        failBuilder(
          `${plane}.${childPath.join(".")}`,
          "namespace segments cannot contain dots",
        );
      }
      validateNamespace(plane, childPath, child);
    }
  }
}

export function validateSpecAst(spec: unknown): spec is SpecAstInput {
  if (!isPlainObject(spec)) {
    failBuilder("spec", "spec must be an object");
  }

  for (const key of Object.keys(spec)) {
    if (
      key !== "$schema" &&
      key !== "id" &&
      key !== "params" &&
      key !== "meters"
    ) {
      failBuilder(key, "unknown top-level property");
    }
  }

  if (
    spec.$schema !== undefined &&
    (typeof spec.$schema !== "string" || spec.$schema.length === 0)
  ) {
    failBuilder("$schema", "must be a non-empty string when present");
  }

  if (
    spec.id !== undefined &&
    (typeof spec.id !== "string" || spec.id.length === 0)
  ) {
    failBuilder("id", "must be a non-empty string when present");
  }

  if (spec.params !== undefined) {
    validateNamespace("params", [], spec.params);
  }
  if (spec.meters !== undefined) {
    validateNamespace("meters", [], spec.meters);
  }

  return true;
}
