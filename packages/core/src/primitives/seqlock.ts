/**
 * @packageDocumentation
 * Dual-counter seqlock (SWMR) for coherent cross-thread reads.
 *
 * Two 32-bit counters in a shared `Uint32Array`:
 * - `LOCK` (odd while writing, even while quiescent)
 * - `SEQ`  (increments once per successful commit)
 *
 * Writer: `LOCK += 1` → write payload → `LOCK += 1` → `SEQ += 1`
 * Reader: wait for even `LOCK`, capture `SEQ`/`LOCK`, read payload, verify unchanged.
 *
 * @remarks
 * - All `Atomics.*` are sequentially consistent; the final `SEQ += 1` serves as
 *   the commit fence readers pair with.
 * - Payload read by `reader()` must live in the same agent-cluster memory as
 *   the counters (typically the same SAB), otherwise ordering is not guaranteed.
 * - SWMR by design: do not use from multiple writers concurrently.
 */

import { addU32, loadU32, spinUntilEven } from './atomics';

/** Shared seqlock counter locations within a SAB-backed `Uint32Array`. */
export interface SeqPair {
  /** SAB-backed counter storage (`Uint32Array`). */
  readonly u32: Uint32Array;
  /** Index of the `LOCK` counter (odd while writing, even otherwise). */
  readonly lockIndex: number;
  /** Index of the `SEQ` counter (increments once per commit). */
  readonly seqIndex: number;
}

/** Telemetry for read attempts. */
export interface ReadStatus {
  /** Total spins performed across retries. */
  readonly spins: number;
  /** Number of retries taken before success (or before giving up). */
  readonly retries: number;
}

/** Budget configuration for bounded spinning and retrying. */
export interface TryReadOptions {
  /** Max busy-wait iterations while waiting for `LOCK` to become even (default: 128). */
  readonly spinBudget?: number;
  /** Max verification retries after a failed coherence check (default: 3). */
  readonly retryBudget?: number;
}

/** Result of a coherent read attempt. */
export interface TryReadResult<T> {
  /** `true` if coherence was proven by lock/seq verification. */
  readonly ok: boolean;
  /** The captured value (coherent if `ok=true`, best-effort if `ok=false`). */
  readonly value: T;
  /** Spin/retry counters for observability. */
  readonly status: ReadStatus;
}

/** Default busy-wait iterations while waiting for `LOCK` to become even. */
export const DEFAULT_SPIN_BUDGET = 128;
/** Default max verification retries after a failed coherence check. */
export const DEFAULT_RETRY_BUDGET = 3;

/**
 * Begin a write section by toggling `LOCK` to odd.
 *
 * @remarks
 * Each successful write must be paired with a single {@link endWrite}.
 * Do not nest write sections; this primitive is SWMR.
 */
export function beginWrite(p: SeqPair): void {
  addU32(p.u32, p.lockIndex, 1);
}

/**
 * End a write section by toggling `LOCK` to even and bumping `SEQ` once.
 *
 * @remarks
 * The final `SEQ += 1` is the commit bump that readers observe to establish
 * coherence. Call exactly once for each {@link beginWrite}.
 */
export function endWrite(p: SeqPair): void {
  addU32(p.u32, p.lockIndex, 1);
  addU32(p.u32, p.seqIndex, 1);
}

/**
 * RAII write wrapper that guarantees exactly one commit bump.
 *
 * @example
 * ```ts
 * publish(pair, () => {
 *   paramsF32[rateIdx] = nextRate;
 *   // ...other writes...
 * });
 * ```
 */
export function publish<T>(p: SeqPair, writer: () => T): T {
  beginWrite(p);
  try {
    return writer();
  } finally {
    endWrite(p);
  }
}

/**
 * Attempt a coherent read with bounded spin and retry.
 *
 * On success (`ok=true`), the returned value was read under a stable epoch:
 * `LOCK` stayed even and unchanged, and `SEQ` did not change across the read.
 * On failure (`ok=false`), the value is best-effort (last capture).
 *
 * @example
 * ```ts
 * const { ok, value, status } = tryRead(pair, () => ({
 *   rate: paramsF32[rateIdx],
 *   peak: metersF32[peakIdx],
 * }));
 * ```
 */
export function tryRead<T>(
  p: SeqPair,
  reader: () => T,
  opts?: TryReadOptions,
): TryReadResult<T> {
  const spinBudget = opts?.spinBudget ?? DEFAULT_SPIN_BUDGET;
  const retryBudget = opts?.retryBudget ?? DEFAULT_RETRY_BUDGET;

  let totalSpins = 0;
  let lastValue: T | undefined;

  for (let retries = 0; retries <= retryBudget; retries++) {
    // Fast path: if lock already even, avoid extra spinning
    let preLock = loadU32(p.u32, p.lockIndex);
    if ((preLock & 1) !== 0) {
      totalSpins += spinUntilEven(p.u32, p.lockIndex, spinBudget);
      preLock = loadU32(p.u32, p.lockIndex);
    }

    const preSeq = loadU32(p.u32, p.seqIndex);

    if ((preLock & 1) !== 0) {
      continue; // writer started; retry
    }

    const value = reader();
    lastValue = value;

    const postLock = loadU32(p.u32, p.lockIndex);
    const postSeq = loadU32(p.u32, p.seqIndex);

    const lockOk = preLock === postLock && (postLock & 1) === 0;
    const seqOk = preSeq === postSeq;

    if (lockOk && seqOk) {
      return { ok: true, value, status: { spins: totalSpins, retries } };
    }
  }

  // Exhausted retries: ensure a value is returned for graceful degradation.
  lastValue ??= reader();

  return {
    ok: false,
    value: lastValue,
    status: { spins: totalSpins, retries: retryBudget },
  };
}
