/**
 * Core spec type system.
 *
 * Authored specs may use nested namespaces. Runtime specs are canonical:
 * they always have an id and flat dot-key param/meter maps.
 */

export type SpecHash = string;

export interface SpecNamespace<T> {
  readonly [key: string]: T | SpecNamespace<T>;
}

export interface ScalarRange {
  readonly min?: number;
  readonly max?: number;
}

export type ScalarParamDef =
  | Readonly<{ kind: "f32" } & ScalarRange>
  | Readonly<{ kind: "i32" } & ScalarRange>
  | Readonly<{ kind: "u32" } & ScalarRange>
  | Readonly<{ kind: "bool" }>
  | Readonly<{ kind: "enum"; values: readonly string[] }>;

export type ArrayParamDef =
  | Readonly<{ kind: "f32.array"; length: number }>
  | Readonly<{ kind: "i32.array"; length: number }>
  | Readonly<{ kind: "u32.array"; length: number }>
  | Readonly<{ kind: "u8.array"; length: number }>
  | Readonly<{ kind: "i8.array"; length: number }>
  | Readonly<{ kind: "i16.array"; length: number }>
  | Readonly<{ kind: "u16.array"; length: number }>
  | Readonly<{ kind: "bool.array"; length: number }>
  | Readonly<{
      kind: "enum.array";
      values: readonly string[];
      length: number;
    }>;

export type ParamDef = ScalarParamDef | ArrayParamDef;

export type ScalarMeterDef =
  | Readonly<{ kind: "f32" }>
  | Readonly<{ kind: "f64" }>
  | Readonly<{ kind: "i32" }>
  | Readonly<{ kind: "u32" }>
  | Readonly<{ kind: "bool" }>
  | Readonly<{ kind: "enum"; values: readonly string[] }>;

export type ArrayMeterDef =
  | Readonly<{ kind: "f32.array"; length: number }>
  | Readonly<{ kind: "f64.array"; length: number }>
  | Readonly<{ kind: "u32.array"; length: number }>
  | Readonly<{ kind: "bool.array"; length: number }>;

export type MeterDef = ScalarMeterDef | ArrayMeterDef;

export type SpecAstInput = Readonly<{
  readonly $schema?: string;
  readonly id?: string;
  readonly params?: SpecNamespace<ParamDef>;
  readonly meters?: SpecNamespace<MeterDef>;
}>;

export interface SpecInput {
  readonly id?: string;
  readonly params?: Readonly<Record<string, ParamDef>>;
  readonly meters?: Readonly<Record<string, MeterDef>>;
}

export type CanonicalSpec = Readonly<{
  readonly id: string;
  readonly params?: Readonly<Record<string, ParamDef>>;
  readonly meters?: Readonly<Record<string, MeterDef>>;
}>;

type DotJoin<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}.${Key}`;

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type FlattenNamespaceImpl<
  NS extends SpecNamespace<Leaf>,
  Leaf,
  Prefix extends string,
> = UnionToIntersection<
  {
    [K in Extract<keyof NS, string>]: NS[K] extends Leaf
      ? { readonly [P in DotJoin<Prefix, K>]: NS[K] }
      : NS[K] extends SpecNamespace<Leaf>
        ? FlattenNamespaceImpl<NS[K], Leaf, DotJoin<Prefix, K>>
        : unknown;
  }[Extract<keyof NS, string>]
>;

export type FlattenNamespace<
  NS extends SpecNamespace<Leaf>,
  Leaf = never,
> = FlattenNamespaceImpl<NS, Leaf, "">;

type WithParams<S extends SpecAstInput> = S extends {
  readonly params?: infer P;
}
  ? NonNullable<P> extends SpecNamespace<ParamDef>
    ? { readonly params: Readonly<FlattenNamespace<NonNullable<P>, ParamDef>> }
    : object
  : object;

type WithMeters<S extends SpecAstInput> = S extends {
  readonly meters?: infer M;
}
  ? NonNullable<M> extends SpecNamespace<MeterDef>
    ? { readonly meters: Readonly<FlattenNamespace<NonNullable<M>, MeterDef>> }
    : object
  : object;

export type CanonicalSpecFromAst<S extends SpecAstInput> = Readonly<
  { readonly id: S["id"] extends string ? S["id"] : string } & WithParams<S> &
    WithMeters<S>
>;

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export type ParamsOf<S extends SpecInput> =
  S["params"] extends Readonly<Record<string, ParamDef>>
    ? S["params"]
    : Readonly<Record<string, never>>;

export type MetersOf<S extends SpecInput> =
  S["meters"] extends Readonly<Record<string, MeterDef>>
    ? S["meters"]
    : Readonly<Record<string, never>>;

export type ParamKeys<S extends SpecInput> = Extract<keyof ParamsOf<S>, string>;

export type MeterKeys<S extends SpecInput> = Extract<keyof MetersOf<S>, string>;

export type ScalarParamKeys<S extends SpecInput> = Extract<
  {
    [K in ParamKeys<S>]: ParamsOf<S>[K] extends ScalarParamDef ? K : never;
  }[ParamKeys<S>],
  string
>;

export type ArrayParamKeys<S extends SpecInput> = Extract<
  {
    [K in ParamKeys<S>]: ParamsOf<S>[K] extends ArrayParamDef ? K : never;
  }[ParamKeys<S>],
  string
>;

export type ScalarMeterKeys<S extends SpecInput> = Extract<
  {
    [K in MeterKeys<S>]: MetersOf<S>[K] extends ScalarMeterDef ? K : never;
  }[MeterKeys<S>],
  string
>;

export type ArrayMeterKeys<S extends SpecInput> = Extract<
  {
    [K in MeterKeys<S>]: MetersOf<S>[K] extends ArrayMeterDef ? K : never;
  }[MeterKeys<S>],
  string
>;
