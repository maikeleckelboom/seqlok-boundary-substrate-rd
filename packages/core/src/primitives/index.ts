/**
 * @packageDocumentation
 * @module @seqlok/core/primitives
 *
 * Low-level **runtime primitives** used by Seqlok:
 *
 * - **Seqlock (SWMR) helpers** — dual-counter `[LOCK, SEQ]` operations for
 *   coherent reads/writes across threads.
 * - **Plane utilities** — byte sizes per plane and small alignment helpers.
 *
 * This module re-exports stable symbols from internal files so consumers don’t
 * need deep import paths.
 *
 * @remarks
 * - These are runtime values (not type-only). They are safe and side-effect free.
 * - Seqlock helpers assume SAB + `Atomics` availability in your environment.
 *
 * @example
 * ```ts
 * import {
 *   beginWrite, endWrite, publish, tryRead,
 *   BYTES_PER_ELEM, isAligned, type SeqPair
 * } from '@seqlok/core/primitives';
 *
 * // Writer (single commit bump)
 * publish(seq, () => {
 *   // mutate shared views…
 * });
 *
 * // Reader (coherent attempt with bounded spin/retry)
 * const { ok, value, status } = tryRead(seq, () => snapshotViews(), { spinBudget: 256 });
 *
 * // Plane helpers
 * const elemBytes = BYTES_PER_ELEM.PF32; // 4
 * const okAlign = isAligned(offset, 'MF64'); // true if offset % 8 === 0
 * ```
 */

// Seqlock (SWMR)
export type { SeqPair, ReadStatus, TryReadOptions } from './seqlock';
export { beginWrite, endWrite, publish, tryRead } from './seqlock';

// Plane utils
export type { PlaneKey } from './planes';
export { BYTES_PER_ELEM, roundUpTo, isPow2, isAligned } from './planes';
