/**
 * Health interpretation from error metadata.
 * Powers UI error handling and recovery strategies.
 *
 * @module errors/health
 */

import type { ErrorMeta } from './registry';

export interface HealthInterpretation {
  readonly status: 'fatal' | 'error' | 'warning' | 'info';
  readonly label: string;
  readonly hint: string | undefined;
  readonly recoverable: boolean;
  readonly safeToExpose: boolean;
}

/**
 * Interpret error metadata as health status.
 */
export function interpretHealth(meta: ErrorMeta): HealthInterpretation {
  const { severity, recoverable, safeToExpose } = meta;

  const status = severity;

  const labels: Record<typeof severity, string> = {
    fatal: 'Critical',
    error: 'Error',
    warning: 'Warning',
  };
  const label = labels[severity];

  let hint: string | undefined;
  if (severity === 'fatal') {
    hint = recoverable
      ? 'Critical error - may require restart or reconfiguration.'
      : 'Fatal error - cannot recover without intervention.';
  } else if (severity === 'error') {
    hint = recoverable
      ? 'Error occurred - retry or adjustment may succeed.'
      : 'Error - check configuration, inputs, or environment.';
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (severity === 'warning') {
    hint = 'Warning - operation may have degraded performance or partial results.';
  }

  return {
    status,
    label,
    hint,
    recoverable,
    safeToExpose,
  } as const;
}

/**
 * Check if error is safe and meaningful to expose outside the trust boundary.
 */
export function isSafeToExpose(meta: ErrorMeta): boolean {
  return meta.safeToExpose;
}

/**
 * Check if error is plausibly recoverable.
 */
export function isRecoverable(meta: ErrorMeta): boolean {
  return meta.recoverable;
}

/**
 * Get documentation URL for error (if available).
 */
export function getDocsUrl(meta: ErrorMeta): string | undefined {
  return meta.docsUrl;
}
