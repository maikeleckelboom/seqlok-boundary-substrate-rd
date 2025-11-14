import { createError } from '../errors';

import type { WasmSharedBacking } from './types';
import type { Plan } from '../plan/types';
import type { SpecInput } from '../spec/types';

const WASM_PAGE_SIZE = 65536;

function toSharedBuffer(buf: ArrayBuffer, where: string): SharedArrayBuffer {
  const sharedAvailable = typeof SharedArrayBuffer !== 'undefined';
  const isShared = sharedAvailable && buf instanceof SharedArrayBuffer;
  if (!isShared) {
    throw createError(
      'backing.wasmMemoryNotShared',
      'WebAssembly.Memory.buffer is not SharedArrayBuffer',
      { plane: 'wasm', shared: false, where },
    );
  }
  return buf as unknown as SharedArrayBuffer;
}

export function attachWasmShared<S extends SpecInput>(plan: Plan<S>): WasmSharedBacking {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.Memory === 'undefined') {
    throw createError('runtime.unsupported', 'WebAssembly.Memory unavailable', {
      feature: 'WebAssembly.Memory',
      reason: 'WebAssembly or WebAssembly.Memory is not defined',
    });
  }

  const requiredPages = Math.max(1, Math.ceil(plan.bytesTotal / WASM_PAGE_SIZE));

  let memory: WebAssembly.Memory;
  try {
    memory = new WebAssembly.Memory({
      initial: requiredPages,
      maximum: requiredPages,
      shared: true,
    });
  } catch (cause) {
    throw createError(
      'backing.wasmMemoryNotShared',
      'Failed to attach shared WebAssembly.Memory',
      { plane: 'wasm', shared: false, where: 'attachWasmShared' },
      cause,
    );
  }

  const sharedBuf = toSharedBuffer(memory.buffer, 'attachWasmShared');

  if (sharedBuf.byteLength < plan.bytesTotal) {
    throw createError(
      'backing.allocUndersized',
      'Undersized WASM shared memory (sab.byteLength)',
      {
        plane: 'wasm',
        requestedBytes: plan.bytesTotal,
        allocatedBytes: sharedBuf.byteLength,
        where: 'attachWasmShared',
      },
    );
  }

  return { kind: 'wasm-shared', memory };
}
