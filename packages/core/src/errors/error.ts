/**
 * @packageDocumentation
 * Structured error primitives for Seqlok.
 *
 * Provides:
 * - {@link SeqlokError}: typed error with `code`, `scope`, and structured `details`.
 * - {@link err}: small factory helper for concise creation.
 * - {@link isSeqlokError}: lightweight type guard (instanceof + structural fallback).
 *
 * @remarks
 * - `details.cause` (if present) is forwarded to the native `Error` initializer
 *   via `{ cause }`, preserving error chaining.
 * - `toJSON()` returns a stable, minimal payload for logs/RPC; it includes `stack`
 *   if available.
 */

import { ERROR_SPEC, type ErrorCode, type ErrorPayload } from './registry';

/**
 * Shape of V8's optional `Error.captureStackTrace`.
 * Second parameter (constructorOpt) is intentionally untyped per V8 signature.
 */
type CaptureStackTrace = (target: object, constructorOpt?: unknown) => void;

/**
 * Use V8's `Error.captureStackTrace` when available to trim constructor/factory
 * frames from the stack. No-ops on engines that do not implement it.
 *
 * @param err  The error instance to capture/adjust stack for.
 * @param ctor The constructor/function to exclude from the top of the stack.
 */
function captureStackTraceIfAvailable(err: Error, ctor: unknown): void {
  const E = Error as unknown as { captureStackTrace?: CaptureStackTrace };
  if (typeof E.captureStackTrace === 'function') {
    E.captureStackTrace(err, ctor);
  }
}

/**
 * Structured Seqlok error with typed code, scope, and payload.
 *
 * @typeParam C - Error code key from the {@link ERROR_SPEC} registry.
 *
 * @example
 * ```ts
 * throw new SeqlokError('PLAN_ALIGN', 'MF64 must be 8-byte aligned', {
 *   plane: 'MF64',
 *   required: 8,
 *   actual: 4,
 * });
 * ```
 */
export class SeqlokError<C extends ErrorCode = ErrorCode> extends Error {
  /** Literal class name for reliable narrowing and serialization. */
  override readonly name = 'SeqlokError' as const;
  /** Machine-readable error code (registry key). */
  readonly code: C;
  /** Logical scope/category for the code, from the registry. */
  readonly scope: (typeof ERROR_SPEC)[C]['scope'];
  /** Structured, typed payload with contextual details (may include `cause`). */
  readonly details: Readonly<ErrorPayload<C>>;

  /**
   * @param code    Error code (must exist in {@link ERROR_SPEC}).
   * @param message Human-readable description of the error.
   * @param details Optional structured payload; `details.cause` is forwarded to `Error`.
   */
  constructor(code: C, message: string, details?: ErrorPayload<C>) {
    const cause = details?.cause;
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
    this.scope = ERROR_SPEC[code].scope;
    this.details = details ?? ({} as ErrorPayload<C>);
    captureStackTraceIfAvailable(this, SeqlokError);
  }

  /**
   * Stable JSON shape for logs/RPC. Includes `stack` when available.
   *
   * @returns Serializable error payload with name, code, message, scope, details, and optional stack.
   */
  toJSON(): {
    readonly name: 'SeqlokError';
    readonly code: C;
    readonly message: string;
    readonly scope: (typeof ERROR_SPEC)[C]['scope'];
    readonly details: Readonly<ErrorPayload<C>>;
    readonly stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      scope: this.scope,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Factory helper for concise `SeqlokError` creation.
 *
 * @example
 * ```ts
 * return err('ALLOC_INVALID_BACKING', 'unsupported backing', { backingType });
 * ```
 */
export function err<C extends ErrorCode>(
  code: C,
  message: string,
  details?: ErrorPayload<C>,
): SeqlokError<C> {
  return new SeqlokError(code, message, details);
}

/**
 * Type guard for `SeqlokError`.
 *
 * @remarks
 * - Uses `instanceof` first, then a structural fallback (`name` + string `code`)
 *   to handle cross-realm scenarios.
 */
export function isSeqlokError(e: unknown): e is SeqlokError {
  if (e instanceof SeqlokError) {
    return true;
  }
  if (typeof e !== 'object' || e === null) {
    return false;
  }
  const maybe = e as { readonly name?: unknown; readonly code?: unknown };
  return maybe.name === 'SeqlokError' && typeof maybe.code === 'string';
}
