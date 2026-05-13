/**
 * Spec type system.
 *
 * Core owns the runtime contract produced by defineSpec(...). Schema owns the
 * authored AST before this boundary; these types represent the flat,
 * runtime-facing contract after semantic compilation.
 */

import type {
  MeterDef,
  ParamDef,
  ScalarMeterDef,
  ScalarParamDef,
  SpecAstInput,
  SpecNamespace,
} from "@seqlok/schema";

/**
 * Runtime contract after semantic compilation.
 *
 * - id is required
 * - params and meters are flat dot-key maps
 * - ranges/defaults and anonymous ids have already been resolved
 */
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

/**
 * Runtime contract type derived from an authored AST type.
 */
export type CanonicalSpecFromAst<S extends SpecAstInput> = Readonly<
  { readonly id: S["id"] extends string ? S["id"] : string } & WithParams<S> &
    WithMeters<S>
>;

// Opaque hash brand
declare const __spec_hash_brand: unique symbol;
export type SpecHash = string & { readonly [__spec_hash_brand]: "SpecHash" };

/**
 * Extract params object from spec (returns empty record if absent).
 * CRITICAL: Must return Record<string, never>, NOT never, for exactOptionalPropertyTypes.
 */
export type ParamsOf<S extends CanonicalSpec> =
  S["params"] extends Readonly<Record<string, ParamDef>>
    ? S["params"]
    : Readonly<Record<string, never>>;

/**
 * Extract meters object from spec (returns empty record if absent).
 */
export type MetersOf<S extends CanonicalSpec> =
  S["meters"] extends Readonly<Record<string, MeterDef>>
    ? S["meters"]
    : Readonly<Record<string, never>>;

/**
 * All param keys as string union.
 */
export type ParamKeys<S extends CanonicalSpec> = Extract<
  keyof ParamsOf<S>,
  string
>;

/**
 * All meter keys as string union.
 */
export type MeterKeys<S extends CanonicalSpec> = Extract<
  keyof MetersOf<S>,
  string
>;

/**
 * Scalar param keys (f32, i32, u32, bool, enum).
 */
export type ScalarParamKeys<S extends CanonicalSpec> = {
  [K in ParamKeys<S>]: ParamsOf<S>[K] extends ScalarParamDef ? K : never;
}[ParamKeys<S>];

/**
 * Array param keys (*.array).
 */
export type ArrayParamKeys<S extends CanonicalSpec> = {
  [K in ParamKeys<S>]: ParamsOf<S>[K] extends { readonly length: number }
    ? K
    : never;
}[ParamKeys<S>];

/**
 * Scalar meter keys.
 */
export type ScalarMeterKeys<S extends CanonicalSpec> = {
  [K in MeterKeys<S>]: MetersOf<S>[K] extends ScalarMeterDef ? K : never;
}[MeterKeys<S>];

/**
 * Array meter keys.
 */
export type ArrayMeterKeys<S extends CanonicalSpec> = {
  [K in MeterKeys<S>]: MetersOf<S>[K] extends { readonly length: number }
    ? K
    : never;
}[MeterKeys<S>];
