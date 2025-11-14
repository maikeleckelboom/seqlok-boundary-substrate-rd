import type { ErrorDetails, ErrorMeta } from '../registry';

export type DiagnosticsErrorCode =
  | 'diagnostics.counterInvalid'
  | 'diagnostics.featureInvalid';
export type DiagnosticsErrorKey = 'counterInvalid' | 'featureInvalid';

export interface DiagnosticsCounterDetails extends ErrorDetails {
  readonly name: string;
  readonly value: number;
}

export interface DiagnosticsFeatureDetails extends ErrorDetails {
  readonly feature: string;
  readonly detail?: string;
}

interface DiagnosticsErrorDescriptor<C extends DiagnosticsErrorCode> {
  readonly code: C;
  readonly message: string;
  readonly meta: ErrorMeta;
}

interface DiagnosticsErrorsMap {
  counterInvalid: DiagnosticsErrorDescriptor<'diagnostics.counterInvalid'>;
  featureInvalid: DiagnosticsErrorDescriptor<'diagnostics.featureInvalid'>;
}

const DIAGNOSTICS_ERRORS_DEF = {
  counterInvalid: {
    code: 'diagnostics.counterInvalid',
    message: 'Diagnostics counter invalid',
    meta: {
      severity: 'warning',
      recoverable: true,
      safeToExpose: false,
    },
  },
  featureInvalid: {
    code: 'diagnostics.featureInvalid',
    message: 'Diagnostics feature invalid',
    meta: {
      severity: 'warning',
      recoverable: true,
      safeToExpose: false,
    },
  },
} as const satisfies DiagnosticsErrorsMap;

export const DIAGNOSTICS_ERRORS: DiagnosticsErrorsMap = DIAGNOSTICS_ERRORS_DEF;

type _CodesFromDescriptors = DiagnosticsErrorsMap[DiagnosticsErrorKey]['code'];
type _VerifyDiagnosticsCodes = DiagnosticsErrorCode extends _CodesFromDescriptors
  ? _CodesFromDescriptors extends DiagnosticsErrorCode
    ? true
    : never
  : never;
export const _diagnosticsCodesMatch: _VerifyDiagnosticsCodes = true;
