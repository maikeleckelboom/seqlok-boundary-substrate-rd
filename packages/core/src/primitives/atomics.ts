/**
 * @packageDocumentation
 * Minimal atomic helpers shared by Seqlok primitives.
 *
 * Thin wrappers around `Atomics.*` for clarity and reuse. All operations are
 * sequentially consistent (SC) in JavaScript, providing the required
 * happens-before edges across agents.
 *
 * @remarks
 * - Keep these allocation-free; they are used in hot paths.
 * - These helpers don’t encode any seqlock policy; see the seqlock protocol.
 *
 * @see {@link import('./seqlock').publish | publish} — RAII writer that guarantees a single commit bump
 * @see {@link import('./seqlock').tryRead | tryRead} — bounded-spin coherent read
 */

export type U32 = Uint32Array;

/** SC load of a 32-bit word. */
export function loadU32(a: U32, i: number): number {
  return Atomics.load(a, i);
}

/** SC store of a 32-bit word; returns the stored value. */
export function storeU32(a: U32, i: number, v: number): number {
  Atomics.store(a, i, v);
  return v;
}

/** SC fetch-add; returns the old value. */
export function addU32(a: U32, i: number, delta: number): number {
  return Atomics.add(a, i, delta);
}

/** SC compare-exchange; returns the old value. */
export function casU32(a: U32, i: number, expected: number, next: number): number {
  return Atomics.compareExchange(a, i, expected, next);
}

/** True if the low bit is zero. */
export function isEvenU32(n: number): boolean {
  return (n & 1) === 0;
}

/** True if the low bit is one. */
export function isOddU32(n: number): boolean {
  return (n & 1) === 1;
}

/**
 * Clamp to a non-negative 32-bit integer. Intended for budgets.
 *
 * @example
 * ```ts
 * clampNonNegativeInt(-5); // 0
 * clampNonNegativeInt(3.7); // 3
 * ```
 */
export function clampNonNegativeInt(n: number): number {
  return n <= 0 ? 0 : n | 0;
}

/**
 * Spin while `pred()` returns true, up to `budget` iterations.
 *
 * @returns The number of spins performed (≤ `budget`).
 */
export function spinWhile(pred: () => boolean, budget: number): number {
  let spins = 0;
  while (pred()) {
    if (spins >= budget) {
      return spins;
    }
    spins++;
  }
  return spins;
}

/**
 * Busy-wait until a lock word is even, or the spin budget is exhausted.
 *
 * @example
 * ```ts
 * const spins = spinUntilEven(u32, lockIdx, 128);
 * ```
 */
export function spinUntilEven(u32: U32, lockIndex: number, budget: number): number {
  return spinWhile(() => !isEvenU32(loadU32(u32, lockIndex)), budget);
}

/** True if the buffer is a SharedArrayBuffer (narrow typing helper). */
export function isSharedBuffer(buf: ArrayBufferLike): buf is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== 'undefined' && buf instanceof SharedArrayBuffer;
}
