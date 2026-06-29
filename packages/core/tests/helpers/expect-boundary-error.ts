import { BoundaryError } from "../../src/errors/error";

import type { ErrorCode, ErrorPayload } from "../../src/errors/registry";

export function expectBoundaryError<C extends ErrorCode>(
  thrown: unknown,
  code: C,
): asserts thrown is BoundaryError<C> {
  if (!(thrown instanceof BoundaryError)) {
    throw new Error(`Expected BoundaryError<${code}>, got ${String(thrown)}`);
  }
  if (thrown.code !== code) {
    throw new Error(`Expected code ${code}, got ${String(thrown.code)}`);
  }
}

export function getDetails<C extends ErrorCode>(
  err: BoundaryError<C>,
): ErrorPayload<C> {
  return err.details;
}
