import { createError } from './error';

import type {
  BindingInvalidValueDetails,
  BindingParamRangeDetails,
  BindingUnknownKeyDetails,
  BindingSnapshotIntoTypeMismatchDetails,
  BindingSnapshotIntoLengthMismatchDetails,
} from './codes/binding';
import type { RuntimeUnsupportedDetails } from './codes/runtime';

export function throwRuntimeUnsupported(
  feature: RuntimeUnsupportedDetails['feature'] & (string & {}),
  reason: string,
  cause?: unknown,
): never {
  throw createError(
    'runtime.unsupported',
    `${feature} unavailable`,
    { feature, reason } satisfies RuntimeUnsupportedDetails,
    cause,
  );
}

export function throwUnknownKey(
  scope: 'params' | 'meters',
  key: string,
  known: readonly string[],
): never {
  throw createError('binding.unknownKey', `Unknown ${scope} key "${key}"`, {
    scope,
    key,
    known,
  } satisfies BindingUnknownKeyDetails);
}

export function throwParamRange(
  key: string,
  min: number,
  max: number,
  received: number,
): never {
  throw createError('binding.paramRange', `Param "${key}" out of range`, {
    key,
    min,
    max,
    received,
  } satisfies BindingParamRangeDetails);
}

export function throwInvalidParamValue(
  key: string,
  expected?: unknown,
  received?: unknown,
): never {
  throw createError('binding.paramInvalidValue', `Param "${key}" has invalid value`, {
    key,
    expected,
    received,
  } satisfies BindingInvalidValueDetails);
}

export function throwIntoType(
  key: string,
  expectedType: string,
  receivedType: string,
  expectedLength: number,
  receivedLength: number,
): never {
  throw createError(
    'binding.snapshotIntoTypeMismatch',
    `Into buffer type mismatch for "${key}"`,
    {
      key,
      expectedType:
        expectedType as BindingSnapshotIntoTypeMismatchDetails['expectedType'],
      receivedType,
      expectedLength,
      receivedLength,
    } satisfies BindingSnapshotIntoTypeMismatchDetails,
  );
}

export function throwIntoLength(
  key: string,
  expectedType: string,
  expectedLength: number,
  receivedLength: number,
): never {
  throw createError(
    'binding.snapshotIntoLengthMismatch',
    `Into buffer length mismatch for "${key}"`,
    {
      key,
      expectedType:
        expectedType as BindingSnapshotIntoLengthMismatchDetails['expectedType'],
      receivedType: expectedType,
      expectedLength,
      receivedLength,
    } satisfies BindingSnapshotIntoLengthMismatchDetails,
  );
}
