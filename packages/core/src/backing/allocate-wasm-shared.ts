/**
 * @fileoverview
 * Allocates shared WebAssembly memory backings for a plan.
 *
 * @remarks
 * - Uses `WebAssembly.Memory` with `shared: true` for WASM-based runtimes.
 * - Derives byte requirements from the Plan and exports view metadata.
 * - Intended for "integrated" Seqlok deployments inside shared WASM heaps.
 *
 * @internal
 */

import { createError } from '../errors/error';
import { throwEnvUnsupported } from '../errors/helpers';

import type { WasmSharedBacking } from './types';
import type { Plan } from '../plan/types';
import type { SpecInput } from '../spec/types';

/** WebAssembly page size in bytes (64KiB) */
const WASM_PAGE_SIZE = 65536;

/**
 * Validates that a WebAssembly.Memory buffer is actually shared.
 *
 * @param buf - Buffer to check
 * @param where - Context for error reporting
 * @throws {SeqlokError} If the buffer is not a SharedArrayBuffer
 * @internal
 */
function toSharedBuffer(buf: ArrayBuffer, where: string): SharedArrayBuffer {
  const sharedAvailable = typeof SharedArrayBuffer !== 'undefined';
  const isShared = sharedAvailable && buf instanceof SharedArrayBuffer;

  if (!isShared) {
    throw createError('backing.wasmMemoryNotShared', 'Wasm memory is not shared', {
      plane: 'wasm',
      shared: false,
      where,
    });
  }

  return buf satisfies SharedArrayBuffer;
}

/**
 * Allocates shared WebAssembly.Memory for the given layout.
 *
 * @typeParam S - Layout spec type
 * @param plan - Memory layout specification
 * @returns Backing with WebAssembly.Memory
 *
 * @throws {Error}
 * - If WebAssembly is not supported
 * - If shared memory is not available
 * - If allocation fails
 *
 * @example
 * ```typescript
 * const backing = allocateWasmShared(plan);
 * // backing.memory contains the WebAssembly.Memory instance
 * ```
 */
export function allocateWasmShared<S extends SpecInput>(
  plan: Plan<S>,
): WasmSharedBacking {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.Memory === 'undefined') {
    throwEnvUnsupported(
      'WebAssembly.Memory',
      'WebAssembly or WebAssembly.Memory is not defined',
    );
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
      { plane: 'wasm', shared: false, where: 'allocateWasmShared' },
      cause,
    );
  }

  const sharedBuf = toSharedBuffer(memory.buffer, 'allocateWasmShared');

  if (sharedBuf.byteLength < plan.bytesTotal) {
    throw createError('backing.allocUndersized', 'Wasm shared memory undersized', {
      plane: 'all',
      requestedBytes: plan.bytesTotal,
      allocatedBytes: sharedBuf.byteLength,
      where: 'allocateWasmShared',
    });
  }

  return { kind: 'wasm-shared', memory };
}
