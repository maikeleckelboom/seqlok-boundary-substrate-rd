/**
 * @fileoverview @seqlok/core public API (v2.0 - zero duplication)
 *
 * BREAKING CHANGES from v1.x:
 * - `HandoffOf<S>` removed - use `Handoff<S>` directly
 * - `InferSpecFromHandoff` removed - inference is automatic
 * - `bindProcessor(spec, received)` overload removed
 * - Handoff envelope contains no duplicated metadata
 */

export { defineSpec } from './spec/define';
export { planLayout } from './plan/layout';
export { allocateShared } from './backing/allocate';
export { attachWasmShared } from './backing/attach-wasm';
export { bindController } from './binding/controller';
export { bindProcessor } from './binding/processor';
export { buildHandoff, receiveHandoff, verifyHandoff } from './handoff';

export type { SpecInput } from './spec/types';
export type { Handoff, HandoffPacking, ReceivedHandoff } from './handoff';

export { SeqlokError, isSeqlokError, createError } from './errors/error';
export { invariant } from './errors/invariant';
export type {
  ErrorCode,
  ErrorPayload,
  ErrorDetails,
  ErrorMeta,
  TypedArrayName,
} from './errors';
