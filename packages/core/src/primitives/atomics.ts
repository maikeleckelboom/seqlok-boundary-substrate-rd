/**
 * Minimal atomic helpers shared by Seqlok primitives.
 */

/** SC load of a 32-bit word. */
export function loadU32(a: Uint32Array, i: number): number {
  return Atomics.load(a, i);
}

/** SC fetch-add; returns the old value. */
export function addU32(a: Uint32Array, i: number, delta: number): number {
  return Atomics.add(a, i, delta);
}

/** True iff the low bit is zero. */
export function isEvenU32(n: number): boolean {
  return (n & 1) === 0;
}

export interface SpinResult {
  readonly spins: number;
  /** true ⇢ observed even; false ⇢ budget exhausted without observing even */
  readonly success: boolean;
}

/**
 * Spin for up to `maxSpins` lock loads until the word is even.
 * Returns the number of loads performed (spins) and success status.
 *
 * Off-by-one safe: allows exactly `maxSpins` loads, then does a final
 * opportunistic check once more to avoid pathological misses.
 */
export function spinUntilEven(
  a: Uint32Array,
  lockIndex: number,
  maxSpins: number,
): SpinResult {
  let spins = 0;

  for (; spins < maxSpins; spins++) {
    if (isEvenU32(Atomics.load(a, lockIndex))) {
      return { spins, success: true };
    }
  }

  // final opportunistic check
  if (isEvenU32(Atomics.load(a, lockIndex))) {
    return { spins: maxSpins, success: true };
  }

  return { spins: maxSpins, success: false };
}
