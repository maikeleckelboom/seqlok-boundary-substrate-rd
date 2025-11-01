/**
 * @packageDocumentation
 * Error helpers: concise, typed factories that always throw `SeqlokError`.
 *
 * These functions centralize error construction so call sites stay clean and
 * error payloads remain consistent with the registry. Each function returns
 * `never` and throws immediately via {@link err}.
 *
 * @remarks
 * - Codes and payload shapes are defined in the error {@link ./registry | registry}.
 * - Messages are human-readable; structured details carry machine-readable context.
 * - Helpers are small and allocation-minimal; they only build the `details` object.
 */

import { err } from './error';

import type { ErrorPayload, TypedArrayName } from './registry';

/**
 * Throw when the local and remote spec hashes differ during a handoff.
 *
 * @example
 * ```ts
 * if (localHash !== remoteHash) {
 *   throwHandoffHash(localHash, remoteHash, diffString);
 * }
 * ```
 *
 * @param localHash  Hash string computed locally.
 * @param remoteHash Hash string received from the peer.
 * @param diff       Optional diff string to append for diagnostics.
 * @throws SeqlokError<'handoff.hashMismatch'>
 */
export function throwHandoffHash(
  localHash: string,
  remoteHash: string,
  diff?: string,
): never {
  const suffix = diff ? `\nDifferences:\n${diff}` : '';
  throw err(
    'handoff.hashMismatch',
    `Spec hash mismatch: local=${localHash}, remote=${remoteHash}${suffix}`,
    {
      localHash,
      remoteHash,
      diff,
    },
  );
}

/**
 * Throw when a param value lies outside its declared inclusive range.
 *
 * @example
 * ```ts
 * if (value < min || value > max) {
 *   throwParamRange('rate', min, max, value);
 * }
 * ```
 *
 * @param key      Param key.
 * @param min      Inclusive minimum.
 * @param max      Inclusive maximum.
 * @param received The offending value.
 * @throws SeqlokError<'params.outOfRange'>
 */
export function throwParamRange(
  key: string,
  min: number,
  max: number,
  received: number,
): never {
  throw err(
    'params.outOfRange',
    `Param "${key}" value ${String(received)} outside range [${String(min)}, ${String(max)}]`,
    {
      key,
      min,
      max,
      received,
    },
  );
}

/**
 * Throw when a param/meter key is not present in the plan.
 *
 * @example
 * ```ts
 * if (!paramKeys.has(key)) {
 *   throwUnknownKey('params', key, [...paramKeys]);
 * }
 * ```
 *
 * @param scope     Domain of the key ('params' | 'meters').
 * @param key       The unknown key.
 * @param available Optional list of valid keys for diagnostics.
 * @throws SeqlokError<'params.unknownKey' | 'meters.unknownKey'>
 */
export function throwUnknownKey(
  scope: 'params' | 'meters',
  key: string,
  available?: readonly string[],
): never {
  const hasAvail = available !== undefined && available.length > 0;
  const suffix = hasAvail ? ` (available: ${available.join(', ')})` : '';
  if (scope === 'params') {
    const details: { key: string; available?: readonly string[] } = { key };
    if (hasAvail) {
      details.available = available;
    }
    throw err('params.unknownKey', `Unknown param key "${key}"${suffix}`, details);
  } else {
    const details: { key: string; available?: readonly string[] } = { key };
    if (hasAvail) {
      details.available = available;
    }
    throw err('meters.unknownKey', `Unknown meter key "${key}"${suffix}`, details);
  }
}

/**
 * Throw when an environment capability is missing or disabled.
 *
 * @example
 * ```ts
 * if (!self.crossOriginIsolated) {
 *   throwEnvUnsupported('SharedArrayBuffer', 'COOP/COEP not enabled', self.crossOriginIsolated);
 * }
 * ```
 *
 * @param feature              Feature name (e.g., "SharedArrayBuffer").
 * @param reason               Why it's unavailable.
 * @param crossOriginIsolated  Optional flag forwarded for context.
 * @throws SeqlokError<'env.unsupported'>
 */
export function throwEnvUnsupported(
  feature: string,
  reason: string,
  crossOriginIsolated?: boolean,
): never {
  const details: { feature: string; reason: string; crossOriginIsolated?: boolean } = {
    feature,
    reason,
  };
  if (crossOriginIsolated !== undefined) {
    details.crossOriginIsolated = crossOriginIsolated;
  }
  throw err('env.unsupported', `${feature} unavailable: ${reason}`, details);
}

/**
 * Throw when a TypedArray type bound into a plane does not match the expected type.
 *
 * @example
 * ```ts
 * // Expect Float32Array for PF32; received Int32Array → throw
 * throwIntoType('params', 'rate', 'Float32Array', 'Int32Array');
 * ```
 *
 * @param scope         Domain ('params' | 'meters').
 * @param key           Entry key.
 * @param expectedType  Expected typed array constructor name.
 * @param receivedType  Actual constructor name.
 * @throws SeqlokError<'params.intoTypeMismatch' | 'meters.intoTypeMismatch'>
 */
export function throwIntoType(
  scope: 'params' | 'meters',
  key: string,
  expectedType: TypedArrayName,
  receivedType: string,
): never {
  if (scope === 'params') {
    const code = 'params.intoTypeMismatch' as const;
    const details: ErrorPayload<typeof code> = { key, expectedType, receivedType };
    throw err(
      code,
      `Buffer for "${key}" has wrong type: expected ${expectedType}, got ${receivedType}`,
      details,
    );
  } else {
    const code = 'meters.intoTypeMismatch' as const;
    const details: ErrorPayload<typeof code> = { key, expectedType, receivedType };
    throw err(
      code,
      `Buffer for "${key}" has wrong type: expected ${expectedType}, got ${receivedType}`,
      details,
    );
  }
}

/**
 * Throw when a TypedArray length bound into a plane does not match the expected element count.
 *
 * @example
 * ```ts
 * // Expect 64 elements for a 64-length param; received 32 → throw
 * throwIntoLength('params', 'spectrum', 64, 32);
 * ```
 *
 * @param scope           Domain ('params' | 'meters').
 * @param key             Entry key.
 * @param expectedLength  Required element count.
 * @param receivedLength  Actual element count.
 * @throws SeqlokError<'params.intoLengthMismatch' | 'meters.intoLengthMismatch'>
 */
export function throwIntoLength(
  scope: 'params' | 'meters',
  key: string,
  expectedLength: number,
  receivedLength: number,
): never {
  if (scope === 'params') {
    const code = 'params.intoLengthMismatch' as const;
    const details: ErrorPayload<typeof code> = { key, expectedLength, receivedLength };
    throw err(
      code,
      `Buffer for "${key}" has wrong length: expected ${String(expectedLength)}, got ${String(receivedLength)}`,
      details,
    );
  } else {
    const code = 'meters.intoLengthMismatch' as const;
    const details: ErrorPayload<typeof code> = { key, expectedLength, receivedLength };
    throw err(
      code,
      `Buffer for "${key}" has wrong length: expected ${String(expectedLength)}, got ${String(receivedLength)}`,
      details,
    );
  }
}
