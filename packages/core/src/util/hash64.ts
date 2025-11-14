/**
 * FNV-1a 64-bit, encoded as lowercase base36.
 *
 * @remarks
 * Not cryptographic. Intended for plan/spec fingerprints and cache keys.
 */
export function fnv1aHash(input: string): string {
  let offsetBasis = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;

  for (let i = 0; i < input.length; i++) {
    offsetBasis ^= BigInt(input.charCodeAt(i) & 0xff);
    offsetBasis = (offsetBasis * fnvPrime) & 0xffffffffffffffffn;
  }

  return offsetBasis.toString(36);
}
