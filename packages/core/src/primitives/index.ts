/**
 * @packageDocumentation
 * Seqlok runtime primitives (public barrel).
 *
 * This barrel exposes a **safe subset** of SWMR seqlock helpers and plane utils.
 * We intentionally do **not** export manual `beginWrite`/`endWrite` to avoid footguns.
 */

// Seqlock (SWMR)
export type { SeqPair, TryReadOptions, ReadStatus, AcquireOptions } from './seqlock';
export {
  createSeqPair,
  tryRead,
  acquire,
  publish,
  getSeq,
  isWriterActive,
} from './seqlock';

// Plane Utilities
export type { PlaneKey } from './planes';
export { BYTES_PER_ELEM, roundUpTo, isPow2, isAligned } from './planes';
