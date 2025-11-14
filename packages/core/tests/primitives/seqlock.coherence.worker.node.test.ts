import { Worker } from 'node:worker_threads';

import { describe, expect, it } from 'vitest';

import { createSeqPair, tryRead } from '../../src/primitives/seqlock';

describe('seqlock cross-thread coherence (worker)', () => {
  it('observes monotone progression with MU commits and exits cleanly', async () => {
    // plan: [LOCK, SEQ, VALUE]
    const sab = new SharedArrayBuffer(3 * 4);
    const u32 = new Uint32Array(sab);
    const LOCK = 0;
    const SEQ = 1;
    const VALUE = 2;

    const pair = createSeqPair(u32, LOCK, SEQ);
    const WRITES = 100_000;

    const worker = new Worker(
      `
        const { parentPort, workerData } = require('node:worker_threads');
        const u32 = new Uint32Array(workerData.sab);
        const LOCK = workerData.lockIndex >>> 0;
        const SEQ = workerData.seqIndex >>> 0;
        const VALUE = workerData.valueIndex >>> 0;
        const WRITES = workerData.writes >>> 0;

        let i = 0;
        function tick() {
          if (i >= WRITES) {
            parentPort.postMessage({ type: 'done' });
            return;
          }
          // beginWrite: odd lock
          Atomics.add(u32, LOCK, 1);
          // payload
          Atomics.store(u32, VALUE, i >>> 0);
          // endWrite: even lock
          Atomics.add(u32, LOCK, 1);
          // commit: bump SEQ
          Atomics.add(u32, SEQ, 1);
          i++;
          setImmediate(tick);
        }
        tick();
      `,
      {
        eval: true,
        workerData: {
          sab,
          lockIndex: LOCK,
          seqIndex: SEQ,
          valueIndex: VALUE,
          writes: WRITES,
        },
      },
    );

    let last = 0;
    let progressed = false;
    let done = false;

    worker.on('message', (msg: unknown) => {
      if (
        msg != null &&
        typeof msg === 'object' &&
        'type' in msg &&
        msg.type === 'done'
      ) {
        done = true;
      }
    });

    const start = Date.now();
    while (Date.now() - start < 500) {
      const r = tryRead(pair, () => Atomics.load(u32, VALUE) >>> 0, {
        spinBudget: 512,
        retryBudget: 4,
      });
      if (!r.ok) {
        continue;
      }
      const v = r.value >>> 0;
      if (v > 0) {
        progressed = true;
      }
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }

    const exitCode = await new Promise<number>((resolve) => {
      worker.on('exit', (code) => {
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(progressed).toBe(true);
    expect(done).toBe(true);
  }, 20_000);
});
