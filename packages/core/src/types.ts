/**
 * Public DX type aliases: flattened, hover-friendly views for consumers.
 * These wrap the canonical shape/value types without changing semantics.
 *
 * - ParamValues / MeterValues: controller-visible value shapes
 * - ProcessorParamView / ProcessorMeterView: processor-side coherent views
 * - SnapshotOf / SnapshotMetersOf: precise subsets for tuple key selections
 */

import type {
  MeterShape,
  MeterValueFor,
  ParamShape,
  ParamValueFor,
} from './binding/types';
import type { MeterKeys, ParamKeys, SpecInput } from './spec/types';

/** Controller-visible param values (arrays readonly, enums are label unions). */
export type ParamValues<S extends SpecInput> = {
  [K in ParamKeys<S>]: ParamValueFor<S, K>;
};

/** Controller-visible meter values (arrays readonly). */
export type MeterValues<S extends SpecInput> = {
  [K in MeterKeys<S>]: MeterValueFor<S, K>;
};

/** Processor-side coherent param view (arrays are mutable scratch views). */
export type ProcessorParamView<S extends SpecInput> = ParamShape<S>;

/** Processor-side coherent meter view (arrays are mutable scratch views). */
export type ProcessorMeterView<S extends SpecInput> = MeterShape<S>;

/** Subset shape for params.snapshot({ keys }). */
export type SnapshotOf<S extends SpecInput, K extends readonly ParamKeys<S>[]> = {
  [P in K[number]]: ParamValueFor<S, P>;
};

/** Subset shape for meters.snapshot({ keys }). Values may be undefined. */
export type SnapshotMetersOf<S extends SpecInput, K extends readonly MeterKeys<S>[]> = {
  [P in K[number]]: MeterValueFor<S, P> | undefined;
};
