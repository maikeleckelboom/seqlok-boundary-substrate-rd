/**
 * Seqlock primitives (lock/seq pair).
 *
 * Provides:
 *  - createSeqPair(): bounds-checked indices into a shared U32 plane
 *  - beginWrite()/endWrite(): writer critical section (stamp SEQ before unlock)
 *  - publish(): exception-safe writer wrapper
 *  - tryRead(): best-effort coherent read with bounded spinning/verification
 *      Signature: tryRead(p, reader, options?: { spinBudget?, retryBudget? })
 *      Returns { ok, value, status:{ spins, retries } }.
 *  - acquire(): never-degraded read; retries until success or throws
 *  - getSeq()/isWriterActive(): lightweight helpers
 */

import { addU32, loadU32, spinUntilEven } from './atomics';

/** Error codes local to primitives (keep dependency-free). */
type PrimitiveErrorCode =
  | 'internal.assertionFailed'
  | 'primitives.invalidBudget'
  | 'primitives.seqlockTimeout';

interface PrimitiveError extends Error {
  code: PrimitiveErrorCode;
  where?: string;
  detail?: string;
}

function fail(
  code: PrimitiveErrorCode,
  message: string,
  where: string,
  detail?: string,
): never {
  const e = new Error(message) as PrimitiveError;
  e.code = code;
  e.where = where;
  if (detail !== undefined) {
    e.detail = detail;
  }
  throw e;
}

/** Pair of indices into a shared U32 plane that stores `[LOCK, SEQ]`. */
export interface SeqPair {
  readonly u32: Uint32Array;
  readonly lockIndex: number;
  readonly seqIndex: number;
}

/**
 * Construct a SeqPair with bounds validation.
 * @param u32 Plane holding LOCK/SEQ.
 * @param lockIndex Index of the lock word (odd=writer active).
 * @param seqIndex Index of the monotonic sequence stamp.
 */
export function createSeqPair(
  u32: Uint32Array,
  lockIndex: number,
  seqIndex: number,
): SeqPair {
  const len = u32.length >>> 0;

  if (lockIndex < 0 || lockIndex >= len) {
    fail(
      'internal.assertionFailed',
      'lockIndex out of bounds',
      'primitives.seqlock.createSeqPair',
      `lockIndex=${String(lockIndex)}, len=${String(len)}`,
    );
  }
  if (seqIndex < 0 || seqIndex >= len) {
    fail(
      'internal.assertionFailed',
      'seqIndex out of bounds',
      'primitives.seqlock.createSeqPair',
      `seqIndex=${String(seqIndex)}, len=${String(len)}`,
    );
  }
  if (lockIndex === seqIndex) {
    fail(
      'internal.assertionFailed',
      'lockIndex and seqIndex must differ',
      'primitives.seqlock.createSeqPair',
    );
  }
  return { u32, lockIndex, seqIndex };
}

/** Options for bounded coherent reads. */
export interface TryReadOptions {
  /** Max spins per attempt while waiting for even LOCK. Default: 1024. */
  readonly spinBudget?: number;
  /** Max verification retries if a writer races. Default: 8. */
  readonly retryBudget?: number;
}

export interface ReadStatus {
  /** Total lock-load spins across all attempts. */
  readonly spins: number;
  /** Number of retries consumed (excludes the initial attempt). */
  readonly retries: number;
}

export type TryReadResult<T> =
  | { ok: true; value: T; status: ReadStatus }
  | { ok: false; value: T; status: ReadStatus };

/** Begin a write: even → odd (exclusive). */
export function beginWrite(p: SeqPair): void {
  addU32(p.u32, p.lockIndex, 1);
}

/**
 * End a write: commit the new version first, then unlock.
 *
 * Ordering matters:
 *  - seq++ happens-before readers that validate (seq0 === seq1).
 *  - unlocking after the stamp prevents an even+unchanged illusion
 *    while sampling bytes written under odd LOCK.
 */
export function endWrite(p: SeqPair): void {
  // 1) publish the new version (release edge for readers)
  addU32(p.u32, p.seqIndex, 1);
  // 2) leave the critical section (odd → even)
  addU32(p.u32, p.lockIndex, 1);
}

/**
 * Exception-safe publish wrapper.
 * @example
 * publish(pair, () => { /* write into shared views *\/ });
 */
export function publish<T>(p: SeqPair, write: () => T): T {
  beginWrite(p);
  try {
    return write();
  } finally {
    endWrite(p);
  }
}

/**
 * Best-effort coherent read.
 *
 * Strategy per attempt:
 *  1) Spin on LOCK until even (bounded by spinBudget).
 *  2) Sample value and verify LOCK still even and SEQ unchanged.
 *  3) On verification failure, consume a retry and loop.
 *
 * On the final attempt, if the spin did not observe an even LOCK, we still
 * take a single sample to return a degraded value (ok:false) for diagnostics.
 *
 * @param p Lock/seq pair
 * @param reader Closure that samples the shared views
 * @param options Budgets for spin/verify
 */
export function tryRead<T>(
  p: SeqPair,
  reader: () => T,
  options?: TryReadOptions,
): TryReadResult<T> {
  const spinBudget = options?.spinBudget ?? 1024;
  const retryBudget = options?.retryBudget ?? 8;

  if (retryBudget < 0 || spinBudget < 0) {
    fail(
      'primitives.invalidBudget',
      'spinBudget/retryBudget must be ≥ 0',
      'primitives.seqlock.tryRead',
      `spinBudget=${String(spinBudget)} retryBudget=${String(retryBudget)}`,
    );
  }

  let totalSpins = 0;
  let retriesUsed = 0;
  let lastValue!: T;
  let sampled = false;

  // Allow (retryBudget + 1) total attempts; retriesUsed counts failures before success.
  while (retriesUsed <= retryBudget) {
    const lastAttempt = retriesUsed === retryBudget;

    // 1) Wait for an even lock
    const { spins, success } = spinUntilEven(p.u32, p.lockIndex, spinBudget);
    totalSpins += spins;

    if (!success && !lastAttempt) {
      // No sample, just consume a retry and try again.
      retriesUsed++;
      continue;
    }

    // Either spin succeeded, or we are forced to sample on the last attempt.
    const seq0 = loadU32(p.u32, p.seqIndex) >>> 0;
    const value = reader();
    sampled = true;
    lastValue = value;
    const lock1 = loadU32(p.u32, p.lockIndex) >>> 0;
    const seq1 = loadU32(p.u32, p.seqIndex) >>> 0;

    const lockOk = (lock1 & 1) === 0;
    const seqOk = seq0 === seq1;

    if (lockOk && seqOk) {
      return {
        ok: true,
        value,
        status: { spins: totalSpins, retries: retriesUsed },
      };
    }

    // Verification failed — consume a retry and loop.
    retriesUsed++;
  }

  // If we get here, we either sampled on last attempt or never saw an even lock.
  if (!sampled) {
    // Practically unreachable due to forced last-attempt sample,
    // but keep a defensible error for diagnostic visibility.
    fail(
      'primitives.seqlockTimeout',
      'Failed to observe even LOCK within budgets',
      'primitives.seqlock.tryRead',
      `spins=${String(totalSpins)} retries=${String(retriesUsed)}`,
    );
  }

  // Exhausted retries: return degraded value with last sampled value.
  return {
    ok: false,
    value: lastValue,
    status: { spins: totalSpins, retries: retryBudget },
  };
}

/** Current monotonic SEQ (u32). */
export function getSeq(p: SeqPair): number {
  return loadU32(p.u32, p.seqIndex) >>> 0;
}

/** True if a writer is active (LOCK odd) at this instant. */
export function isWriterActive(p: SeqPair): boolean {
  return (loadU32(p.u32, p.lockIndex) & 1) === 1;
}

/** Options for bounded, never-degraded acquisition. */
export interface AcquireOptions extends TryReadOptions {
  /** Stop after this many tryRead() calls. Default: 1000. */
  readonly maxAttempts?: number;
}

/**
 * Bounded acquire: never returns degraded; succeeds or throws on exhaustion.
 * Uses tryRead() internally to preserve verification semantics.
 */
export function acquire<T>(p: SeqPair, reader: () => T, options?: AcquireOptions): T {
  const spinBudget = options?.spinBudget ?? 1024;
  const retryBudget = options?.retryBudget ?? 8;
  const maxAttempts = options?.maxAttempts ?? 1000;

  for (let i = 0; i < maxAttempts; i++) {
    const r = tryRead(p, reader, { spinBudget, retryBudget });
    if (r.ok) {
      return r.value;
    }
  }

  fail(
    'primitives.seqlockTimeout',
    'Exceeded maxAttempts acquiring coherent snapshot',
    'primitives.seqlock.acquire',
    `maxAttempts=${String(maxAttempts)}`,
  );
}
