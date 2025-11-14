/**
 * Binding-domain public types (concise).
 */

import type {
  ArrayMeterKeys,
  ArrayParamKeys,
  MeterKeys,
  ParamKeys,
  ScalarMeterKeys,
  ScalarParamKeys,
  SpecInput,
} from '../spec/types';

/* sequence stamps */
export type PUSeq = number;
export type MUSeq = number;

/* policies */
export type RangePolicy = 'clamp' | 'reject';

/* display helper: never rewrites functions */
type Display<T> = T extends (...args: readonly unknown[]) => unknown
  ? T
  : { [K in keyof T]: T[K] } & {};

/* typed arrays */
export type F32 = Float32Array;
export type F64 = Float64Array;
export type U32 = Uint32Array;
export type I32 = Int32Array;
export type U8 = Uint8Array;

export type RF32 = Readonly<Float32Array>;
export type RF64 = Readonly<Float64Array>;
export type RU32 = Readonly<Uint32Array>;
export type RI32 = Readonly<Int32Array>;
export type RU8 = Readonly<Uint8Array>;

export type Snapshot<T> = Readonly<T>;

/* spec access */
type ParamsOf<S extends SpecInput> = S['params'] extends object ? S['params'] : object;
type MetersOf<S extends SpecInput> = S['meters'] extends object ? S['meters'] : object;

type ParamAt<S extends SpecInput, K extends ParamKeys<S>> = K extends keyof ParamsOf<S>
  ? ParamsOf<S>[K]
  : never;
type MeterAt<S extends SpecInput, K extends MeterKeys<S>> = K extends keyof MetersOf<S>
  ? MetersOf<S>[K]
  : never;

type EnumValuesOf<D> = D extends { values: readonly (infer V)[] } ? V : never;

/* kind universes */
type ParamKind =
  | 'f32'
  | 'i32'
  | 'bool'
  | 'enum'
  | 'f32.array'
  | 'i32.array'
  | 'u8.array'
  | 'bool.array'
  | 'enum.array';

type MeterKind =
  | 'f32'
  | 'u32'
  | 'f64'
  | 'bool'
  | 'f32.array'
  | 'u32.array'
  | 'f64.array'
  | 'bool.array';

/* value maps (processor-side views) */
interface ParamProcMap {
  f32: number;
  i32: number;
  bool: boolean;
  enum: number; // enum scalar → numeric index on processor
  'f32.array': F32;
  'i32.array': I32;
  'u8.array': U8;
  'bool.array': U8;
  'enum.array': I32; // indices
}

interface MeterProcMap {
  f32: number;
  u32: number;
  f64: number;
  bool: boolean;
  'f32.array': F32;
  'u32.array': U32;
  'f64.array': F64;
  'bool.array': U8;
}

/* controller-visible maps */
interface ParamCtlMap {
  f32: number;
  i32: number;
  bool: boolean;
  'f32.array': RF32;
  'i32.array': RI32;
  'u8.array': RU8;
  'bool.array': RU8;
  'enum.array': RI32; // indices
}

interface MeterCtlMap {
  f32: number;
  u32: number;
  f64: number;
  bool: boolean;
  'f32.array': RF32;
  'u32.array': RU32;
  'f64.array': RF64;
  'bool.array': RU8;
}

/* shapes (processor-side read shapes) */
export type ParamShape<S extends SpecInput> = Display<{
  readonly [K in ParamKeys<S>]: ParamAt<S, K> extends {
    kind: infer Kind;
  }
    ? Kind extends ParamKind
      ? ParamProcMap[Kind]
      : never
    : never;
}>;

export type MeterShape<S extends SpecInput> = Display<{
  readonly [K in MeterKeys<S>]: MeterAt<S, K> extends {
    kind: infer Kind;
  }
    ? Kind extends MeterKind
      ? MeterProcMap[Kind]
      : never
    : never;
}>;

/* controller-visible values */
export type ParamValueFor<S extends SpecInput, K extends ParamKeys<S>> =
  ParamAt<S, K> extends {
    kind: infer Kind;
  }
    ? Kind extends 'enum'
      ? EnumValuesOf<ParamAt<S, K>>
      : Kind extends Exclude<ParamKind, 'enum'>
        ? ParamCtlMap[Kind]
        : never
    : never;

export type MeterValueFor<S extends SpecInput, K extends MeterKeys<S>> =
  MeterAt<S, K> extends {
    kind: infer Kind;
  }
    ? Kind extends MeterKind
      ? MeterCtlMap[Kind]
      : never
    : never;

export type ArrayParamView<
  S extends SpecInput,
  K extends ArrayParamKeys<S>,
> = ParamShape<S>[K];

/* coherent scalars */
declare const __coherentHint: unique symbol;
export type CoherentValue<T extends number | string | boolean> = T & {
  readonly [__coherentHint]?: (value: T) => void;
};

type _ScalarFor<
  S extends SpecInput,
  K extends ScalarParamKeys<S>,
> = ParamShape<S>[K] extends number | string | boolean ? ParamShape<S>[K] : never;

export type CoherentParamShape<S extends SpecInput> = Display<
  {
    readonly [K in ScalarParamKeys<S>]: CoherentValue<_ScalarFor<S, K>>;
  } & {
    readonly [K in ArrayParamKeys<S>]: ParamShape<S>[K];
  }
>;

/* Ephemeral brand for callback-scoped views */
export type EphemeralTypedArray = F32 | F64 | I32 | U32 | U8;
declare const __ephemeralBrand: unique symbol;
export type Ephemeral<T extends EphemeralTypedArray> = T & {
  readonly [__ephemeralBrand]: true;
  subarray(begin?: number, end?: number): Ephemeral<T>;
};

/* convenience */
export type RawParamShape<S extends SpecInput> = ParamShape<S>;

/* options */
export interface ControllerOptions {
  readonly rangePolicy?: RangePolicy;
  readonly exclusive?: boolean;
}

export interface ProcessorOptions {
  readonly diagnostics?: boolean;
}

/* bindings */
export interface ControllerBinding<S extends SpecInput> {
  readonly params: ControllerParams<S>;
  readonly meters: ControllerMeters<S>;

  dispose(): void;
}

export interface ProcessorBinding<S extends SpecInput> {
  readonly params: ProcessorParams<S>;
  readonly meters: ProcessorMeters<S>;

  dispose(): void;
}

/* doc alias for params view (matches within) */
export type ProcessorParamsView<S extends SpecInput> = Display<
  {
    readonly [K in ScalarParamKeys<S>]: CoherentValue<_ScalarFor<S, K>>;
  } & {
    readonly [K in ArrayParamKeys<S>]: Ephemeral<ParamShape<S>[K]>;
  }
>;

/* controller patch */
export type ScalarParamPatch<S extends SpecInput> = Readonly<
  Partial<{ [K in ScalarParamKeys<S>]: ParamValueFor<S, K> }>
>;

/* into maps */
type MutableBuffer<T> =
  T extends Readonly<Float32Array>
    ? F32
    : T extends Readonly<Float64Array>
      ? F64
      : T extends Readonly<Uint32Array>
        ? U32
        : T extends Readonly<Int32Array>
          ? I32
          : T extends Readonly<Uint8Array>
            ? U8
            : never;

export type IntoForParams<
  S extends SpecInput,
  KS extends readonly ParamKeys<S>[],
> = Readonly<{
  [K in Extract<KS[number], ParamKeys<S>> as ParamValueFor<
    S,
    K
  > extends Readonly<ArrayBufferView>
    ? K
    : never]?: MutableBuffer<ParamValueFor<S, K>>;
}>;

export type IntoForMeters<
  S extends SpecInput,
  KS extends readonly MeterKeys<S>[],
> = Readonly<{
  [K in Extract<KS[number], MeterKeys<S>> as MeterValueFor<
    S,
    K
  > extends Readonly<ArrayBufferView>
    ? K
    : never]?: MutableBuffer<MeterValueFor<S, K>>;
}>;

/* named options interfaces for improved IntelliSense */
export interface SnapshotMetersOptions<
  S extends SpecInput,
  K extends readonly MeterKeys<S>[],
> {
  /** Optional destination buffers for array meters (zero-alloc path). */
  readonly into?: IntoForMeters<S, K>;
}

export interface SnapshotParamsOptions<
  S extends SpecInput,
  K extends readonly ParamKeys<S>[],
> {
  /** Optional destination buffers for array params (zero-alloc path). */
  readonly into?: IntoForParams<S, K>;
}

/* Controller side */
export interface ControllerParams<S extends SpecInput> {
  set<K extends ScalarParamKeys<S>>(key: K, value: ParamValueFor<S, K>): void;

  update(patch: ScalarParamPatch<S>): void;

  stage<const K extends ArrayParamKeys<S>>(
    key: K,
    callback: (view: Ephemeral<ArrayParamView<S, K>>) => void,
  ): void;

  /** Full snapshot of all params. */
  snapshot(): FullParamsSnapshot<S>;

  /** Array + (optional) options — put this BEFORE the varargs overload. */
  snapshot<const K extends readonly ParamKeys<S>[]>(
    keys: K,
    options?: SnapshotParamsOptions<S, K>,
  ): SnapshotParamsObject<S, K>;

  /** Single-parameter: array OR { keys, into? }. */
  snapshot<const K extends readonly ParamKeys<S>[]>(
    keysOrOptions: K | { readonly keys: K; readonly into?: IntoForParams<S, K> },
  ): SnapshotParamsObject<S, K>;

  /** Into-only (reuse user-provided buffers for full snapshot). */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  snapshot(options: {
    readonly into: IntoForParams<S, readonly ParamKeys<S>[]>;
  }): FullParamsSnapshot<S>;

  version(): PUSeq;
}

export interface ControllerMeters<S extends SpecInput> {
  /** Full snapshot of all meters. */
  snapshot(): FullMetersSnapshot<S>;

  /** Array + (optional) options — put this BEFORE the varargs overload. */
  snapshot<const K extends readonly MeterKeys<S>[]>(
    keys: K,
    options?: SnapshotMetersOptions<S, K>,
  ): SnapshotMetersObject<S, K>;

  /** Varargs last (no second parameter). */
  snapshot<const K extends readonly MeterKeys<S>[]>(
    ...keys: K
  ): SnapshotMetersObject<S, K>;

  /** Single-parameter: array OR { keys, into? }. */
  snapshot<const K extends readonly MeterKeys<S>[]>(
    keysOrOptions: K | { readonly keys: K; readonly into?: IntoForMeters<S, K> },
  ): SnapshotMetersObject<S, K>;

  /** Into-only (reuse user-provided buffers for full snapshot). */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  snapshot(options: {
    readonly into: IntoForMeters<S, readonly MeterKeys<S>[]>;
  }): FullMetersSnapshot<S>;

  /** Monotonic MU sequence value published by the processor. */
  version(): MUSeq;
}

/* processor writer value helpers */
type MeterScalarFor<S extends SpecInput, K extends MeterKeys<S>> = NonNullable<
  S['meters']
>[K] extends {
  kind: 'bool';
}
  ? boolean
  : number;

type MeterArrayFor<S extends SpecInput, K extends MeterKeys<S>> = NonNullable<
  S['meters']
>[K] extends {
  kind: 'f32.array';
}
  ? F32
  : NonNullable<S['meters']>[K] extends { kind: 'f64.array' }
    ? F64
    : NonNullable<S['meters']>[K] extends {
          kind: 'u32.array';
        }
      ? U32
      : NonNullable<S['meters']>[K] extends { kind: 'bool.array' }
        ? U8
        : never;
// Conditional argument for writer.set(...):
// - if K is a scalar key  → number/boolean value
// - if K is an array key  → mutator callback with Ephemeral destination
type _SetArgFor<S extends SpecInput, K extends MeterKeys<S>> =
  K extends ScalarMeterKeys<S>
    ? MeterScalarFor<S, Extract<K, ScalarMeterKeys<S>>>
    : K extends ArrayMeterKeys<S>
      ? (destination: Ephemeral<MeterArrayFor<S, Extract<K, ArrayMeterKeys<S>>>>) => void
      : never;

/* docs alias for writer (mirrors publish signature; not used in it) */
export type MeterWriter<S extends SpecInput> = {
  [K in ScalarMeterKeys<S>]: (value: MeterScalarFor<S, K>) => void;
} & {
  stage<const K extends ArrayMeterKeys<S>>(
    key: K,
    callback: (destination: Ephemeral<MeterArrayFor<S, K>>) => void,
  ): void;

  set<K extends MeterKeys<S>>(key: K, valueOrMutate: _SetArgFor<S, K>): void;
};

/* Processor side */
export interface ProcessorParams<S extends SpecInput> {
  within<T>(
    callback: (
      view: {
        readonly [K in ScalarParamKeys<S>]: CoherentValue<_ScalarFor<S, K>>;
      } & {
        readonly [K in ArrayParamKeys<S>]: Ephemeral<ParamShape<S>[K]>;
      },
    ) => T,
  ): T;

  version(): PUSeq;
}

export interface ProcessorMeters<S extends SpecInput> {
  publish<T>(
    callback: (
      writer: {
        [K in ScalarMeterKeys<S>]: (value: MeterScalarFor<S, K>) => void;
      } & {
        stage<const K extends ArrayMeterKeys<S>>(
          key: K,
          callback: (destination: Ephemeral<MeterArrayFor<S, K>>) => void,
        ): void;

        set<K extends MeterKeys<S>>(key: K, valueOrMutate: _SetArgFor<S, K>): void;
      },
    ) => T,
  ): T;

  version(): MUSeq;
}

/* convenience unions */
export type ScalarParamValue = number | boolean | string;
export type ScalarMeterValue = number;

/* snapshots */
export type ControllerParamsSnapshot<
  S extends SpecInput,
  Keys extends readonly ParamKeys<S>[],
> = SnapshotParamsObject<S, Keys>;

export type ControllerMetersSnapshot<
  S extends SpecInput,
  Keys extends readonly MeterKeys<S>[],
> = SnapshotMetersObject<S, Keys>;

export type FullParamsSnapshot<S extends SpecInput> = Readonly<
  Display<{ [K in ParamKeys<S>]: ParamValueFor<S, K> }>
>;

export type FullMetersSnapshot<S extends SpecInput> = Readonly<
  Display<{ [K in MeterKeys<S>]: MeterValueFor<S, K> }>
>;

type ParamSnapshotKeys<S extends SpecInput, KS extends readonly ParamKeys<S>[]> = Extract<
  KS[number],
  ParamKeys<S>
>;
type MeterSnapshotKeys<S extends SpecInput, KS extends readonly MeterKeys<S>[]> = Extract<
  KS[number],
  MeterKeys<S>
>;

export type SnapshotParamsObject<
  S extends SpecInput,
  KS extends readonly ParamKeys<S>[],
> = Readonly<Display<{ [K in ParamSnapshotKeys<S, KS>]: ParamValueFor<S, K> }>>;

export type SnapshotMetersObject<
  S extends SpecInput,
  KS extends readonly MeterKeys<S>[],
> = Readonly<Display<{ [K in MeterSnapshotKeys<S, KS>]: MeterValueFor<S, K> }>>;
