import { describe, expect, it } from 'vitest';

import {
  beginWrite,
  endWrite,
  publish,
  type SeqPair,
  tryRead,
} from '../../src/primitives/seqlock';

/**
 * Minimal local factory: no shared test utils needed.
 * We allocate 16 bytes (4×u32). Layout:
 *   [0] LOCK, [1] SEQ, [2] PAYLOAD (u32), [3] spare
 */
function pair(): { p: SeqPair; u32: Uint32Array; dataIndex: number } {
  const sab = new SharedArrayBuffer(16);
  const u32 = new Uint32Array(sab); // indices: 0..3
  const p: SeqPair = { u32, lockIndex: 0, seqIndex: 1 };
  const dataIndex = 2;
  return { p, u32, dataIndex };
}

describe('seqlock primitives', () => {
  it('publish bumps SEQ exactly once and leaves LOCK even', () => {
    const { p } = pair();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const seq0 = p.u32[p.seqIndex]! >>> 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lock0 = p.u32[p.lockIndex]! >>> 0;

    publish(p, () => {
      // no-op payload
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const seq1 = p.u32[p.seqIndex]! >>> 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lock1 = p.u32[p.lockIndex]! >>> 0;

    // +1 with u32 wrap semantics
    expect(seq1).toBe((seq0 + 1) >>> 0);
    // LOCK even (odd during write, +2 over the whole publish)
    expect(lock1 % 2).toBe(0);
    expect(lock1 - lock0).toBe(2);
  });

  it('beginWrite/endWrite toggles LOCK parity and commits once', () => {
    const { p } = pair();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lock0 = p.u32[p.lockIndex]! >>> 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const seq0 = p.u32[p.seqIndex]! >>> 0;

    beginWrite(p);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lockOdd = p.u32[p.lockIndex]! >>> 0;
    expect(lockOdd % 2).toBe(1);

    endWrite(p);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lockEven = p.u32[p.lockIndex]! >>> 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const seq1 = p.u32[p.seqIndex]! >>> 0;

    expect(lockEven % 2).toBe(0);
    expect(lockEven - lock0).toBe(2);
    expect(seq1).toBe((seq0 + 1) >>> 0);
  });

  it('tryRead returns coherent value when uncontended', () => {
    const { p, u32, dataIndex } = pair();
    publish(p, () => {
      u32[dataIndex] = 42;
    });

    const res = tryRead(p, () => u32[dataIndex]);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(42);
    expect(res.status.retries).toBeGreaterThanOrEqual(0);
  });

  it('tryRead falls back (ok=false) when writer holds LOCK odd', () => {
    const { p, u32, dataIndex } = pair();
    u32[dataIndex] = 7;

    beginWrite(p);
    try {
      const res = tryRead(p, () => u32[dataIndex], { spinBudget: 1, retryBudget: 0 });
      expect(res.ok).toBe(false);
      // value is best-effort capture; status reflects retries
      expect(res.value).toBe(7);
      expect(res.status.retries).toBe(0);
    } finally {
      // Always release the lock
      endWrite(p);
    }
  });

  it('SEQ wraparound is handled (u32 overflow) and remains readable', () => {
    const { p, u32, dataIndex } = pair();

    // Force SEQ near overflow, then publish to wrap.
    p.u32[p.seqIndex] = 0xffffffff;
    publish(p, () => {
      u32[dataIndex] = 1234;
    });

    // Wrapped to 0 (u32)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(p.u32[p.seqIndex]! >>> 0).toBe(0);

    // Still coherently readable
    const r = tryRead(p, () => u32[dataIndex]);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(1234);
  });

  it('two publishes bump SEQ by 2 and keep LOCK even', () => {
    const { p } = pair();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const seq0 = p.u32[p.seqIndex]! >>> 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lock0 = p.u32[p.lockIndex]! >>> 0;

    publish(p, () => {
      /* empty */
    });
    publish(p, () => {
      /* empty */
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(p.u32[p.seqIndex]! >>> 0).toBe((seq0 + 2) >>> 0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lock = p.u32[p.lockIndex]! >>> 0;
    expect(lock % 2).toBe(0);
    expect(lock - lock0).toBe(4);
  });
});
