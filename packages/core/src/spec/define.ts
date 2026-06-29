import { canonicalizeSpecAst } from "./canonicalize";
import { asNonEmpty, isPlainObject, parseArrayLen } from "./validate";

import type { CanonicalSpecFromAst, ScalarRange, SpecAstInput } from "./types";

type LenArg<Len extends number> = Len | Readonly<{ length: Len }>;

interface NumericBuilder<K extends string, KArr extends string> {
  (): Readonly<{ kind: K }>;
  <const R extends ScalarRange>(range: R): Readonly<{ kind: K } & R>;
  array<const Len extends number>(
    length: LenArg<Len>,
  ): Readonly<{ kind: KArr; length: Len }>;
}

export type F32ParamBuilder = NumericBuilder<"f32", "f32.array">;
export type I32ParamBuilder = NumericBuilder<"i32", "i32.array">;
export type U32ParamBuilder = NumericBuilder<"u32", "u32.array">;

export interface BoolBuilder {
  (): Readonly<{ kind: "bool" }>;
  array<const Len extends number>(
    length: LenArg<Len>,
  ): Readonly<{ kind: "bool.array"; length: Len }>;
}

interface SimpleArrayBuilder<K extends string> {
  array<const Len extends number>(
    length: LenArg<Len>,
  ): Readonly<{ kind: K; length: Len }>;
}

export type U8ParamBuilder = SimpleArrayBuilder<"u8.array">;
export type I8ParamBuilder = SimpleArrayBuilder<"i8.array">;
export type I16ParamBuilder = SimpleArrayBuilder<"i16.array">;
export type U16ParamBuilder = SimpleArrayBuilder<"u16.array">;

export interface EnumBuilder {
  <const Values extends readonly string[]>(
    values: Values,
  ): Readonly<{ kind: "enum"; values: Values }>;

  <const Values extends readonly string[]>(
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    config: Readonly<{ values: Values }>,
  ): Readonly<{ kind: "enum"; values: Values }>;

  array<const Values extends readonly string[], const Len extends number>(
    options: Readonly<{ values: Values; length: LenArg<Len> }>,
  ): Readonly<{ kind: "enum.array"; values: Values; length: Len }>;
}

export interface MeterEnumBuilder {
  <const Values extends readonly string[]>(
    values: Values,
  ): Readonly<{ kind: "enum"; values: Values }>;

  <const Values extends readonly string[]>(
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    config: Readonly<{ values: Values }>,
  ): Readonly<{ kind: "enum"; values: Values }>;
}

interface MeterNumericBuilder<K extends string, KArr extends string> {
  (): Readonly<{ kind: K }>;
  array<const Len extends number>(
    length: LenArg<Len>,
  ): Readonly<{ kind: KArr; length: Len }>;
}

export type MeterF32Builder = MeterNumericBuilder<"f32", "f32.array">;
export type MeterF64Builder = MeterNumericBuilder<"f64", "f64.array">;
export type MeterI32Builder = () => Readonly<{ kind: "i32" }>;
export type MeterU32Builder = MeterNumericBuilder<"u32", "u32.array">;

export interface ParamBuilders {
  readonly f32: F32ParamBuilder;
  readonly i32: I32ParamBuilder;
  readonly u32: U32ParamBuilder;
  readonly bool: BoolBuilder;
  readonly u8: U8ParamBuilder;
  readonly i8: I8ParamBuilder;
  readonly i16: I16ParamBuilder;
  readonly u16: U16ParamBuilder;
  readonly enum: EnumBuilder;
}

export interface MeterBuilders {
  readonly f32: MeterF32Builder;
  readonly f64: MeterF64Builder;
  readonly i32: MeterI32Builder;
  readonly u32: MeterU32Builder;
  readonly bool: BoolBuilder;
  readonly enum: MeterEnumBuilder;
}

function createNumericParam<K extends string, KArr extends string>(
  kind: K,
  arrayKind: KArr,
): NumericBuilder<K, KArr> {
  function scalar(): Readonly<{ kind: K }>;
  function scalar<const R extends ScalarRange>(
    range: R,
  ): Readonly<{ kind: K } & R>;
  function scalar<const R extends ScalarRange>(range?: R) {
    if (range === undefined) {
      return { kind } as Readonly<{ kind: K }>;
    }
    return { kind, ...range } as Readonly<{ kind: K } & R>;
  }

  const array = <const Len extends number>(length: LenArg<Len>) =>
    ({
      kind: arrayKind,
      length: parseArrayLen(length, `param.${arrayKind}.length`),
    }) as Readonly<{ kind: KArr; length: Len }>;

  return Object.assign(scalar, { array });
}

function createBoolBuilder(): BoolBuilder {
  const scalar = () => ({ kind: "bool" as const });
  const array = <const Len extends number>(length: LenArg<Len>) =>
    ({
      kind: "bool.array" as const,
      length: parseArrayLen(length, "bool.array.length"),
    }) as Readonly<{ kind: "bool.array"; length: Len }>;

  return Object.assign(scalar, { array });
}

function createSimpleArrayParam<K extends string>(
  kind: K,
): SimpleArrayBuilder<K> {
  return {
    array: <const Len extends number>(length: LenArg<Len>) =>
      ({
        kind,
        length: parseArrayLen(length, `param.${kind}.length`),
      }) as Readonly<{ kind: K; length: Len }>,
  };
}

function createEnumBuilder(scope: "param" | "meter"): EnumBuilder {
  const scalar = <const Values extends readonly string[]>(
    valuesOrConfig: Values | Readonly<{ values: Values }>,
  ): Readonly<{ kind: "enum"; values: Values }> => {
    const values = isPlainObject(valuesOrConfig)
      ? valuesOrConfig.values
      : valuesOrConfig;

    return {
      kind: "enum" as const,
      values: asNonEmpty(values, `${scope}.enum.values`),
    };
  };

  const array = <
    const Values extends readonly string[],
    const Len extends number,
  >(
    options: Readonly<{ values: Values; length: LenArg<Len> }>,
  ) =>
    ({
      kind: "enum.array" as const,
      values: asNonEmpty(options.values, `${scope}.enum.array.values`),
      length: parseArrayLen(options.length, `${scope}.enum.array.length`),
    }) as Readonly<{ kind: "enum.array"; values: Values; length: Len }>;

  return Object.assign(scalar, { array });
}

function createMeterEnumBuilder(): MeterEnumBuilder {
  return (<const Values extends readonly string[]>(
    valuesOrConfig: Values | Readonly<{ values: Values }>,
  ): Readonly<{ kind: "enum"; values: Values }> => {
    const values = isPlainObject(valuesOrConfig)
      ? valuesOrConfig.values
      : valuesOrConfig;

    return {
      kind: "enum" as const,
      values: asNonEmpty(values, "meter.enum.values"),
    };
  }) as MeterEnumBuilder;
}

function createNumericMeter<K extends string, KArr extends string>(
  kind: K,
  arrayKind: KArr,
): MeterNumericBuilder<K, KArr> {
  const scalar = () => ({ kind });
  const array = <const Len extends number>(length: LenArg<Len>) =>
    ({
      kind: arrayKind,
      length: parseArrayLen(length, `meter.${arrayKind}.length`),
    }) as Readonly<{ kind: KArr; length: Len }>;

  return Object.assign(scalar, { array });
}

const paramBuilder: ParamBuilders = {
  f32: createNumericParam("f32", "f32.array"),
  i32: createNumericParam("i32", "i32.array"),
  u32: createNumericParam("u32", "u32.array"),
  bool: createBoolBuilder(),
  u8: createSimpleArrayParam("u8.array"),
  i8: createSimpleArrayParam("i8.array"),
  i16: createSimpleArrayParam("i16.array"),
  u16: createSimpleArrayParam("u16.array"),
  enum: createEnumBuilder("param"),
};

const meterBuilder: MeterBuilders = {
  f32: createNumericMeter("f32", "f32.array"),
  f64: createNumericMeter("f64", "f64.array"),
  i32: () => ({ kind: "i32" as const }),
  u32: createNumericMeter("u32", "u32.array"),
  bool: createBoolBuilder(),
  enum: createMeterEnumBuilder(),
};

export function defineSpec<const T extends SpecAstInput>(
  buildOrAst:
    | T
    | ((api: Readonly<{ param: ParamBuilders; meter: MeterBuilders }>) => T),
): CanonicalSpecFromAst<T> {
  const ast =
    typeof buildOrAst === "function"
      ? buildOrAst({ param: paramBuilder, meter: meterBuilder })
      : buildOrAst;

  return canonicalizeSpecAst(ast) as CanonicalSpecFromAst<T>;
}
