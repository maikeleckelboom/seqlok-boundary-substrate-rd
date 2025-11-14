// Invariant-style tests for the seqlock coherence checks.
//
// These tests don't try to force "real" concurrency; instead they test
// the arithmetic property of the (LOCK, SEQ) state machine that underlies
// the ABA discussion.
//
// See https://en.wikipedia.org/wiki/ABA_problem for background.
import { describe, expect, it } from 'vitest';

interface SeqState {
  readonly lock: number;
  readonly seq: number;
}

function simulateWrites(pre: SeqState, writes: number): SeqState {
  // Each complete writer cycle:
  //   LOCK += 2  (enter odd, exit even)
  //   SEQ  += 1  (commit)
  const lock = (pre.lock + (writes << 1)) >>> 0;
  const seq = (pre.seq + writes) >>> 0;
  return { lock, seq };
}

function coherenceAccepts(pre: SeqState, post: SeqState): boolean {
  const lockOk = pre.lock === post.lock && (post.lock & 1) === 0;

  const seqOk = pre.seq === post.seq;

  return lockOk && seqOk;
}

function hasWrap(pre: SeqState, post: SeqState): boolean {
  // Wrap happens if the 32-bit addition overflowed.
  const lockWrapped = post.lock < pre.lock;
  const seqWrapped = post.seq < pre.seq;
  return lockWrapped || seqWrapped;
}

describe('seqlock ABA properties', () => {
  it('does not accept reads when at least one write occurs without wraparound', () => {
    const pre: SeqState = { lock: 0, seq: 0 };

    // Try 1..N writes and assert coherence predicate does NOT accept
    // as long as there is no wrap.
    for (let writes = 1; writes <= 10_000; writes++) {
      const post = simulateWrites(pre, writes);

      const accepted = coherenceAccepts(pre, post);
      const wrapped = hasWrap(pre, post);

      if (accepted) {
        // If we ever accept, the only legal explanation is wrap.
        // Starting from (0,0) and with writes <= 10k, wrap is impossible.
        expect(wrapped).toBe(true);
      }

      // In practice, this should never be reached: accepted === false.
      expect(accepted).toBe(false);
    }
  });

  it('if the coherence predicate accepts after some writes, there must have been wraparound', () => {
    // This is a more general invariant check over several starting states.
    const startStates: SeqState[] = [
      { lock: 0, seq: 0 },
      { lock: 0, seq: 0xfffffff0 },
      {
        lock: 1024,
        seq: 0x7fffffff,
      },
      { lock: 0xfffffffe & ~1, seq: 123456789 },
    ];

    for (const pre of startStates) {
      for (let writes = 0; writes <= 1_000_000; writes += 10_001) {
        const post = simulateWrites(pre, writes);

        const accepted = coherenceAccepts(pre, post);
        const wrapped = hasWrap(pre, post);

        if (accepted) {
          // Either no writes happened, or we got wraparound.
          if (writes === 0) {
            expect(wrapped).toBe(false);
          } else {
            expect(wrapped).toBe(true);
          }
        }
      }
    }
  });
});
