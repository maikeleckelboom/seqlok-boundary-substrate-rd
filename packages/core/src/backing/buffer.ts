import { createError } from '../errors';

import type { Backing } from './types';
import type { PlaneKey } from '../primitives/planes';

/**
 * Get the single backing buffer when it exists.
 * @throws {TypeError} for 'shared-partitioned' (no single SAB exists).
 */
export function getSharedBuffer(backing: Backing): SharedArrayBuffer {
  if (backing.kind === 'shared') {
    return backing.sab;
  }
  if (backing.kind === 'wasm-shared') {
    return backing.memory.buffer as unknown as SharedArrayBuffer;
  }
  throw createError(
    'internal.assertionFailed',
    'getSharedBuffer(backing): partitioned backing has no single SharedArrayBuffer; use plane-aware access.',
    {
      where: 'getSharedBuffer',
      detail: 'shared-partitioned',
    },
  );
}

/**
 * Plane-aware buffer accessor.
 * - For partitioned: returns the plane SAB.
 * - For contiguous / wasm: returns the single buffer (plane bases handled elsewhere).
 */
export function getBufferForPlane(backing: Backing, plane: PlaneKey): SharedArrayBuffer {
  if (backing.kind === 'shared-partitioned') {
    return backing.planes[plane];
  }
  return getSharedBuffer(backing);
}
