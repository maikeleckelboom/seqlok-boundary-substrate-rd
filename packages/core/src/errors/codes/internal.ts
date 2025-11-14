import type { ErrorDetails, ErrorMeta } from '../registry';

export type InternalErrorCode =
  | 'internal.assertionFailed'
  | 'internal.unreachable'
  | 'internal.exhaustiveness';

export interface InternalAssertionDetails extends ErrorDetails {
  readonly detail?: string;
}

interface InternalErrorDescriptor<C extends InternalErrorCode> {
  readonly code: C;
  readonly message: string;
  readonly meta: ErrorMeta;
}

// Explicit key union for this domain
export type InternalErrorKey = 'assertionFailed' | 'unreachable' | 'exhaustiveness';

// Per-key descriptor mapping with exact code literals
interface InternalErrorsMap {
  assertionFailed: InternalErrorDescriptor<'internal.assertionFailed'>;
  unreachable: InternalErrorDescriptor<'internal.unreachable'>;
  exhaustiveness: InternalErrorDescriptor<'internal.exhaustiveness'>;
}

/**
 * Internal error descriptors.
 *
 * Layer: invariants & impossible states.
 *
 * NOTE:
 * - INTERNAL_ERRORS_DEF is the literal source of truth.
 * - INTERNAL_ERRORS is explicitly typed for --isolatedDeclarations.
 */
const INTERNAL_ERRORS_DEF: InternalErrorsMap = {
  assertionFailed: {
    code: 'internal.assertionFailed',
    message: 'Internal assertion failed',
    meta: {
      severity: 'fatal',
      recoverable: false,
      safeToExpose: false,
    },
  },
  unreachable: {
    code: 'internal.unreachable',
    message: 'Unreachable code executed',
    meta: {
      severity: 'fatal',
      recoverable: false,
      safeToExpose: false,
    },
  },
  exhaustiveness: {
    code: 'internal.exhaustiveness',
    message: 'Non-exhaustive branch',
    meta: {
      severity: 'fatal',
      recoverable: false,
      safeToExpose: false,
    },
  },
} as const;

export const INTERNAL_ERRORS: InternalErrorsMap = INTERNAL_ERRORS_DEF;

/**
 * Sanity check: ensure InternalErrorCode union matches INTERNAL_ERRORS.*.code.
 *
 * This stays meaningful because InternalErrorsMap is tied to the literal
 * descriptors, not to InternalErrorCode.
 */
type _CodesFromDescriptors = InternalErrorsMap[InternalErrorKey]['code'];
type _CodesExact = InternalErrorCode;
type _InternalCodesMatch = _CodesFromDescriptors extends _CodesExact
  ? _CodesExact extends _CodesFromDescriptors
    ? true
    : never
  : never;

const _internalCodesMatch: _InternalCodesMatch = true;
void _internalCodesMatch;
