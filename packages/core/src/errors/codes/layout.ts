import type { ErrorDetails, ErrorMeta } from '../registry';

export type LayoutErrorCode = 'layout.failed' | 'layout.overflowRisk';

export interface LayoutFailedDetails extends ErrorDetails {
  readonly detail?: string;
}

export interface LayoutOverflowRiskDetails extends ErrorDetails {
  readonly estimatedBytes: number;
  readonly softLimitBytes: number;
}

interface LayoutErrorDescriptor<C extends LayoutErrorCode> {
  readonly code: C;
  readonly message: string;
  readonly meta: ErrorMeta;
}

// Explicit key union for this domain
export type LayoutErrorKey = 'failed' | 'overflowRisk';

// Map each key to its exact code literal
interface LayoutErrorsMap {
  failed: LayoutErrorDescriptor<'layout.failed'>;
  overflowRisk: LayoutErrorDescriptor<'layout.overflowRisk'>;
}

/**
 * Layout error descriptors.
 *
 * Layer: planning (spec → memory plan).
 *
 * NOTE:
 * - We define a private `LAYOUT_ERRORS_DEF` with `as const`.
 * - Then derive `LayoutErrorsMap` explicitly (no generic Record).
 * - Exported `LAYOUT_ERRORS` has an explicit annotation
 *   for --isolatedDeclarations.
 */
const LAYOUT_ERRORS_DEF: LayoutErrorsMap = {
  failed: {
    code: 'layout.failed',
    message: 'Failed to plan memory plan',
    meta: {
      severity: 'error',
      recoverable: false,
      safeToExpose: true,
    },
  },
  overflowRisk: {
    code: 'layout.overflowRisk',
    message: 'Planned memory exceeds soft limit',
    meta: {
      severity: 'warning',
      recoverable: true,
      safeToExpose: true,
    },
  },
} as const;

// Exported constant with explicit annotation (for --isolatedDeclarations)
export const LAYOUT_ERRORS: LayoutErrorsMap = LAYOUT_ERRORS_DEF;

/**
 * Sanity check: ensure LayoutErrorCode union matches LAYOUT_ERRORS.*.code.
 *
 * This remains meaningful because `LayoutErrorsMap` is tied to the literal
 * descriptors, not to LayoutErrorCode.
 */
type _CodesFromDescriptors = LayoutErrorsMap[LayoutErrorKey]['code'];
type _CodesExact = LayoutErrorCode;

export type _LayoutCodesMatch = _CodesFromDescriptors extends _CodesExact
  ? _CodesExact extends _CodesFromDescriptors
    ? true
    : never
  : never;

// Force the check to be instantiated; if it drifts, this line fails.
export const _layoutCodesMatch: _LayoutCodesMatch = true;
void _layoutCodesMatch;
