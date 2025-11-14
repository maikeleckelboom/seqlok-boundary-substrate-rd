/**
 * Centralized error type exports.
 *
 * All error types are re-exported from their respective modules.
 * This file serves as a convenient single import point for error types.
 */
export type {
  ErrorCode,
  ErrorPayload,
  ErrorDetails,
  ErrorMeta,
  TypedArrayName,
} from './registry';

export { ERROR_META } from './registry';

export type { HealthInterpretation } from './health';
export { interpretHealth } from './health';

export type * from './codes/primitives';
export type * from './codes/runtime';
export type * from './codes/layout';
export type * from './codes/backing';
export type * from './codes/handoff';
export type * from './codes/binding';
export type * from './codes/orchestration';
export type * from './codes/diagnostics';
export type * from './codes/internal';
export type * from './codes/spec';
