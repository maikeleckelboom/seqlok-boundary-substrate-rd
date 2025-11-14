import { createError } from './error';

import type { ErrorCode, ErrorPayload } from './types';

export function invariant<C extends ErrorCode>(
  condition: unknown,
  code: C,
  message: string,
  details: ErrorPayload<C> = {} as ErrorPayload<C>,
): asserts condition {
  if (!condition) {
    throw createError(code, message, details);
  }
}
