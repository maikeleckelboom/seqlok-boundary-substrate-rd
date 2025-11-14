import { describe, expect, it } from 'vitest';

import {
  isSharedBacking,
  isSharedPartitionedBacking,
  isWasmSharedBacking,
  type Backing,
  type SharedBacking,
  type SharedPartitionedBacking,
  type WasmSharedBacking,
} from '../../src/backing/types';

describe('backing type guards', () => {
  it('isSharedBacking narrows correctly', () => {
    const b: Backing = { kind: 'shared', sab: new SharedArrayBuffer(16) };
    expect(isSharedBacking(b)).toBe(true);
    expect((b satisfies SharedBacking).sab.byteLength).toBe(16);
  });
  it('isSharedPartitionedBacking narrows correctly', () => {
    const sab = (n: number) => new SharedArrayBuffer(n);
    const b: Backing = {
      kind: 'shared-partitioned',
      planes: {
        PF32: sab(4),
        PI32: sab(4),
        PB: sab(1),
        PU: sab(8),
        MF32: sab(4),
        MF64: sab(8),
        MU32: sab(4),
        MU: sab(8),
      },
    };
    expect(isSharedPartitionedBacking(b)).toBe(true);
    expect((b satisfies SharedPartitionedBacking).planes.PB.byteLength).toBe(1);
  });

  it('isWasmSharedBacking narrows correctly', () => {
    const mem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    const b: Backing = { kind: 'wasm-shared', memory: mem };
    expect(isWasmSharedBacking(b)).toBe(true);
    expect(
      (b satisfies WasmSharedBacking).memory.buffer instanceof SharedArrayBuffer,
    ).toBe(true);
  });
});
