/**
 * @packageDocumentation
 * @module @seqlok/core/error
 *
 * Public error API surface.
 * - **Runtime:** `SeqlokError`, `err`, `isSeqlokError`, and typed throw helpers.
 * - **Types:** `ErrorCode`, `ErrorPayload`, `TypedArrayName`.
 *
 * @remarks
 * - `err(code, message, details?)` constructs a typed `SeqlokError`.
 * - `isSeqlokError(e)` is safe for cross-realm checks and plain-object errors.
 * - `throw*` helpers create precise codes/messages for common failure cases.
 *
 * @example
 * ```ts
 * import { err, isSeqlokError, type ErrorCode } from '@seqlok/core/error';
 *
 * try {
 *   throw err('params.outOfRange', 'rate out of range', { key: 'rate', min: 0.5, max: 2, received: 4 });
 * } catch (e) {
 *   if (isSeqlokError(e)) {
 *     const code: ErrorCode = e.code;
 *     console.error(`[${code}] ${e.message}`, e.details);
 *   } else {
 *     console.error('Unknown error', e);
 *   }
 * }
 * ```
 */

// Runtime error class & constructors
export { SeqlokError, err, isSeqlokError } from './error';

// Runtime helpers that throw typed errors (never return)
export {
  throwHandoffHash,
  throwParamRange,
  throwUnknownKey,
  throwEnvUnsupported,
  throwIntoType,
  throwIntoLength,
} from './helpers';

// Type-only surface
export type { ErrorCode, ErrorPayload, TypedArrayName } from './registry';
