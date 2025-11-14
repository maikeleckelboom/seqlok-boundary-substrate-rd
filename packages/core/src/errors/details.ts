import type { ErrorDetails } from './registry';
import type { TypedArrayName } from './types';

/**
 * Shared shape for numeric range validations.
 *
 * Used by both spec-time (SpecRangeDetails) and binding-time
 * (BindingParamRangeDetails) range checks.
 */
export interface RangeDetails extends ErrorDetails {
  readonly key: string;
  readonly min?: number;
  readonly max?: number;
  readonly received?: number;
}

/**
 * Shared shape for "into" / snapshot buffer mismatches.
 *
 * Used by backing.into* and binding.snapshotInto* errors.
 */
export interface BufferDetails extends ErrorDetails {
  readonly key: string;
  readonly expectedType: TypedArrayName;
  readonly receivedType: string;
  readonly expectedLength: number;
  readonly receivedLength: number;
}

/**
 * Enum validation details.
 *
 * Used for spec-time enum checking and binding-time value validation.
 */
export interface EnumDetails extends ErrorDetails {
  readonly key: string;
  readonly values: readonly string[];
  readonly received?: string | number;
  readonly duplicate?: string;
  readonly invalidIndex?: number;
}

/**
 * Unknown key in a given logical scope (params/meters/etc).
 */
export interface UnknownKeyDetails extends ErrorDetails {
  readonly scope: 'params' | 'meters';
  readonly key: string;
  readonly known?: readonly string[];
}

/**
 * Allocation details (bytes requested/allocated).
 */
export interface AllocationDetails extends ErrorDetails {
  readonly requestedBytes?: number;
  readonly allocatedBytes?: number;
}

/**
 * Plane operation details (which plane, optional extra context).
 */
export interface PlaneDetails extends ErrorDetails {
  readonly plane: string;
}

/**
 * Coherent read / retry details.
 */
export interface CoherentDetails extends ErrorDetails {
  readonly retries?: number;
  readonly spins?: number;
}

/**
 * Unsupported feature details (runtime/env/domain).
 */
export interface FeatureUnsupportedDetails extends ErrorDetails {
  readonly feature: string;
  readonly reason?: string;
  readonly missing?: readonly string[];
}
