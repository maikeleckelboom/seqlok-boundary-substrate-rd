/**
 * @fileoverview
 * Core error handling for Exclave Boundary.
 *
 * @remarks
 * - Defines the main `BoundaryError` class for all library errors.
 * - Provides type-safe error creation and checking utilities.
 * - Integrates with the error registry for consistent error handling.
 */

import type { ErrorCode, ErrorPayload } from "./registry";

/**
 * Custom error class for @exclave/boundary library errors.
 *
 * @template C - The error code type (must be a valid ErrorCode)
 */
export class BoundaryError<C extends ErrorCode = ErrorCode> extends Error {
  override readonly name = "BoundaryError";
  readonly code: C;
  readonly details: ErrorPayload<C>;
  override readonly cause?: unknown;

  constructor(
    code: C,
    message: string,
    details: ErrorPayload<C>,
    cause?: unknown,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    if (cause !== undefined) {
      this.cause = cause;
    }
    Object.setPrototypeOf(this, BoundaryError.prototype);
  }

  /**
   * Serialize error to JSON (for logging/transfer).
   * Note: details and cause are omitted to avoid circular references.
   */
  toJSON(): { name: string; code: C; message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}

/**
 * Type guard to check if an error is a BoundaryError.
 */
export function isBoundaryError(e: unknown): e is BoundaryError {
  return (
    !!e &&
    typeof e === "object" &&
    (e as { name?: unknown }).name === "BoundaryError"
  );
}

/**
 * Typed error factory function.
 *
 * @param code - Error code (must be a valid ErrorCode)
 * @param message - Human-readable error message
 * @param details - Structured error details (type depends on error code)
 * @param cause - Optional underlying error that caused this error
 * @returns BoundaryError instance
 *
 * @example
 * ```ts
 * throw createError('env.unsupported', 'SharedArrayBuffer unavailable', {
 *   feature: 'SharedArrayBuffer',
 *   reason: 'Check COOP/COEP headers'
 * });
 * ```
 */
export function createError<C extends ErrorCode>(
  code: C,
  message: string,
  details: ErrorPayload<C>,
  cause?: unknown,
): BoundaryError<C> {
  return new BoundaryError(code, message, details, cause);
}
