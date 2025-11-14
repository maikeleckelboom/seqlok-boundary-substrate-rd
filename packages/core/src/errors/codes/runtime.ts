import type { ErrorDetails, ErrorMeta } from '../registry';

export type RuntimeErrorCode = 'runtime.unsupported' | 'runtime.coopCoepRequired';
export type RuntimeErrorKey = 'unsupported' | 'coopCoepRequired';

export interface RuntimeUnsupportedDetails extends ErrorDetails {
  readonly feature:
    | 'SharedArrayBuffer'
    | 'Atomics'
    | 'WebAssembly'
    | 'WebAssembly.Memory';
  readonly reason?: string;
}

export interface RuntimeCoopCoepDetails extends ErrorDetails {
  readonly context: 'browser' | 'worker';
  readonly hasCoopHeader?: boolean;
  readonly hasCoepHeader?: boolean;
}

interface RuntimeErrorDescriptor<C extends RuntimeErrorCode> {
  readonly code: C;
  readonly message: string;
  readonly meta: ErrorMeta;
}

interface RuntimeErrorsMap {
  unsupported: RuntimeErrorDescriptor<'runtime.unsupported'>;
  coopCoepRequired: RuntimeErrorDescriptor<'runtime.coopCoepRequired'>;
}

const RUNTIME_ERRORS_DEF = {
  unsupported: {
    code: 'runtime.unsupported',
    message: 'Required runtime feature unavailable',
    meta: {
      severity: 'fatal',
      recoverable: false,
      safeToExpose: true,
    },
  },
  coopCoepRequired: {
    code: 'runtime.coopCoepRequired',
    message: 'COOP/COEP headers required for SharedArrayBuffer',
    meta: {
      severity: 'error',
      recoverable: true,
      safeToExpose: true,
    },
  },
} as const satisfies RuntimeErrorsMap;

export const RUNTIME_ERRORS: RuntimeErrorsMap = RUNTIME_ERRORS_DEF;

type _CodesFromDescriptors = RuntimeErrorsMap[RuntimeErrorKey]['code'];
type _VerifyRuntimeCodes = RuntimeErrorCode extends _CodesFromDescriptors
  ? _CodesFromDescriptors extends RuntimeErrorCode
    ? true
    : never
  : never;
export const _verifyRuntimeCodesMatch: _VerifyRuntimeCodes = true;
