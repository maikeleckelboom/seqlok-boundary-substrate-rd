/**
 * Shared memory allocator for Seqlok backings (contiguous SAB only).
 *
 * @remarks
 * - `allocateShared` creates a single contiguous `SharedArrayBuffer` sized for the plan.
 * - For shared WebAssembly.Memory, use {@link attachWasmShared}.
 * - For per-plane SABs, use {@link allocateSharedPartitioned}.
 */

import { createError } from '../errors/error';

import type { SharedBacking } from './types';
import type { Plan } from '../plan/types';
import type { SpecInput } from '../spec/types';

/**
 * Allocate a single contiguous SharedArrayBuffer for the entire plan.
 * @throws When SAB is unavailable in the environment or allocation fails.
 */
export function allocateShared<S extends SpecInput>(plan: Plan<S>): SharedBacking {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw createError('runtime.unsupported', 'SharedArrayBuffer unavailable', {
      feature: 'SharedArrayBuffer',
      reason: 'missing SharedArrayBuffer (check COOP/COEP for browsers)',
    });
  }

  try {
    const sab = new SharedArrayBuffer(plan.bytesTotal);
    return { kind: 'shared', sab };
  } catch (cause) {
    throw createError(
      'backing.allocFailed',
      'Failed to allocate SharedArrayBuffer',
      {
        detail: `bytesTotal=${String(plan.bytesTotal)}`,
        plane: '',
        requestedBytes: 0,
        allocatedBytes: 0,
      },
      cause,
    );
  }
}

/**
 * Convenience: compute the total byte length of a backing without mapping views.
 * Only meaningful for 'shared' and 'wasm-shared'.
 */
export function backingByteLength(
  backing:
    | { kind: 'shared'; sab: SharedArrayBuffer }
    | {
        kind: 'wasm-shared';
        memory: WebAssembly.Memory;
      },
): number {
  return backing.kind === 'shared'
    ? backing.sab.byteLength
    : (backing.memory.buffer as ArrayBufferLike).byteLength;
}
