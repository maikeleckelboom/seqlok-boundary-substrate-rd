/**
 * Allocate one SharedArrayBuffer per plane ("partitioned" backing).
 *
 * Each logical plane (PF32/PI32/PB/PU/MF32/MF64/MU32/MU) gets its own buffer,
 * sized from the corresponding `plan.planes[...]` entry.
 *
 * This is useful when:
 *   - You want to grow planes independently.
 *   - You want to hand individual planes to different workers.
 *
 * Throws:
 *   - `runtime.unsupported` if SharedArrayBuffer is unavailable.
 *   - `backing.allocFailed` if allocation fails for any plane.
 */

import { createError } from '../errors';

import type { SharedPartitionedBacking } from './types';
import type { Plan } from '../plan/types';
import type { PlaneKey } from '../primitives/planes';
import type { SpecInput } from '../spec/types';

const ALL_PLANES: readonly PlaneKey[] = [
  'PF32',
  'PI32',
  'PB',
  'PU',
  'MF32',
  'MF64',
  'MU32',
  'MU',
] as const;

export function allocateSharedPartitioned<S extends SpecInput>(
  plan: Plan<S>,
): SharedPartitionedBacking {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw createError('runtime.unsupported', 'SharedArrayBuffer unavailable', {
      feature: 'SharedArrayBuffer',
      reason: 'missing SharedArrayBuffer (check COOP/COEP for browsers)',
    });
  }

  const sabByPlane = Object.create(null) as Record<PlaneKey, SharedArrayBuffer>;

  for (const plane of ALL_PLANES) {
    const bytes = plan.planes[plane];

    try {
      sabByPlane[plane] = new SharedArrayBuffer(bytes);
    } catch (cause) {
      throw createError(
        'backing.allocFailed',
        'Failed to allocate SharedArrayBuffer for plane ' + plane,
        {
          detail: 'plane=' + plane,
          plane,
          requestedBytes: bytes,
          allocatedBytes: 0,
        },
        cause,
      );
    }
  }

  return {
    kind: 'shared-partitioned',
    planes: sabByPlane,
  };
}
