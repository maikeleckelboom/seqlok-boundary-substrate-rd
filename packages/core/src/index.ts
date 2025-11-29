/**
 * @fileoverview
 * Core module for Seqlok - Shared memory synchronization for real-time applications.
 *
 * @remarks
 * - Re-exports all public APIs for the @seqlok/core package.
 * - Organized into logical sections: SPEC, PLAN, BACKING, BINDING, HANDOFF, and ERRORS.
 * - This is the main entry point for consumers of the library.
 */

// SPEC
export {
  defineSpec,
  type ParamBuilders,
  type MeterBuilders,
} from "./spec/define";
export type { SpecInput } from "./spec/types";

// PLAN
export { planLayout } from "./plan/layout";

// BACKING
export { allocateShared } from "./backing/allocate-shared";
export { allocateSharedPartitioned } from "./backing/allocate-shared-partitioned";
export { allocateWasmShared } from "./backing/allocate-wasm-shared";

// BINDING
export { bindController } from "./binding/controller";
export { bindProcessor } from "./binding/processor";
export { bindObserver } from "./binding/observer";

// BINDING TYPES
export type {
  ControllerBinding,
  ProcessorBinding,
  ObserverBinding,
  ControllerParams,
  ProcessorParams,
  ObserverParams,
  ControllerMeters,
  ProcessorMeters,
  ObserverMeters,
  ParamValueFor,
  ScalarParamPatch,
  MeterValueFor,
  ParamsSnapshot,
  MetersSnapshot,
  SnapshotParamsObject,
  SnapshotMetersObject,
  SnapshotParamsOptions,
  SnapshotMetersOptions,
  IntoForParams,
  IntoForMeters,
  ControllerOptions,
  ProcessorOptions,
  ObserverOptions,
  RangePolicy,
} from "./binding/common/types";

// HANDOFF
export { buildHandoff, receiveHandoff, verifyHandoff } from "./handoff/handoff";
export type { Handoff, HandoffPacking, ReceivedHandoff } from "./handoff/types";

// ENUM UTILITIES
export {
  enumArrayToLabels,
  enumIndexFromLabel,
  enumLabelFromIndex,
  enumValues,
  enumLabelsToArray,
  enumPaletteFor,
  type EnumLabel,
  type EnumKeyOf,
} from "./spec/enums";

// TYPE UTILITIES
export type {
  ParamValues,
  MeterValues,
  ProcessorParamView,
  ProcessorMeterView,
  SnapshotOf,
  SnapshotMetersOf,
} from "./types";

// CONTEXT
export type { SharedContext } from "./context/types";
export { createSharedContext } from "./context/create";

// ERRORS
export { ENV_ERRORS } from "./errors/codes/env";
export { BACKING_ERRORS } from "./errors/codes/backing";
export { SPEC_ERRORS } from "./errors/codes/spec";
export { PLAN_ERRORS } from "./errors/codes/plan";
export { BINDING_ERRORS } from "./errors/codes/binding";
export { HANDOFF_ERRORS } from "./errors/codes/handoff";
