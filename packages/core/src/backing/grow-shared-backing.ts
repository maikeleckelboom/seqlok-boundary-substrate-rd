/**
 * @fileoverview
 * Utilities to grow a single-SAB shared backing by plane byte targets.
 *
 * @remarks
 * - Computes monotonic per-plane growth based on the existing Plan.
 * - Allocates a larger SharedArrayBuffer and returns updated plane lengths.
 * - Caller is responsible for remapping typed views onto the new backing.
 *
 * @see {@link ../../docs/architecture/11-backing-and-plane-layout.md} for details
 *
 * @internal
 */

import { computeBackingPlaneBases, BACKING_PLANE_PACK_ORDER_V1 } from './map-views';

import type { SharedBacking } from './types';
import type { Plan, PlaneByteLengths } from '../plan/types';
import type { Mutable, SpecInput } from '../spec/types';

/**
 * Grows a SharedArrayBuffer backing with new plane sizes.
 *
 * @typeParam S - Layout spec type extending {@link SpecInput}
 *
 * @remarks
 * - Allocates new SAB and copies data; never mutates in place
 * - Plane sizes grow monotonically (never shrink)
 * - Caller must handle view remapping and atomic swaps
 * - See {@link ../../docs/architecture/11-backing-and-plane-layout.md} for details
 *
 * @param plan - Current layout with plane byte lengths
 * @param backing - Existing SharedBacking to grow
 * @param targets - Minimum target sizes for planes to grow
 *
 * @returns Object with new backing and updated plane layout
 *
 * @throws {RangeError} If allocation fails or targets are invalid
 *
 * @example
 * ```typescript
 * // Double the PCM buffer size
 * const { backing, planes } = growSharedBacking(plan, currentBacking, {
 *   pcm: plan.planes.pcm * 2
 * });
 * ```
 *
 * @internal
 */
export function growSharedBacking<S extends SpecInput>(
  plan: Plan<S>,
  backing: SharedBacking,
  targets: Partial<PlaneByteLengths>,
): {
  backing: SharedBacking;
  planes: PlaneByteLengths;
} {
  // Compute new plane sizes with monotonic growth
  const next: Mutable<PlaneByteLengths> = {
    ...(plan.planes as Mutable<PlaneByteLengths>),
  };

  // Apply growth targets while preserving existing sizes
  for (const k of BACKING_PLANE_PACK_ORDER_V1) {
    const targetSize = targets[k];
    if (typeof targetSize === 'number' && targetSize > next[k]) {
      next[k] = targetSize;
    }
  }

  // Allocate new SAB with space for all grown planes
  const newTotal = BACKING_PLANE_PACK_ORDER_V1.reduce((acc, k) => acc + next[k], 0);
  const nextSab = new SharedArrayBuffer(newTotal);
  const oldSab = backing.sab;

  // Calculate byte offsets for each plane in old and new buffers
  const oldBases = computeBackingPlaneBases(plan.planes);
  const newBases = computeBackingPlaneBases(next);

  for (const k of BACKING_PLANE_PACK_ORDER_V1) {
    const oldLen = plan.planes[k];
    const newLen = next[k];
    const copyLen = Math.min(oldLen, newLen);

    const src = new Uint8Array(oldSab, oldBases[k], copyLen);
    const dst = new Uint8Array(nextSab, newBases[k], copyLen);
    dst.set(src);
    // SAB regions are zero-initialized; no extra tail fill required.
  }

  return {
    backing: {
      kind: 'shared',
      sab: nextSab,
    },
    planes: next,
  };
}
