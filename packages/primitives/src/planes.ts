/**
 * @packageDocumentation
 * Plane identifiers, packing order, and alignment helpers for Seqlok memory plans.
 *
 * A “plane” is the ABI-level bucket that groups values by storage/TypedArray kind.
 * Plan/backing/binding all speak this same vocabulary.
 *
 * Notes:
 * - `PU` and `MU` are the seqlock counter planes (Uint32 pairs like `[LOCK, SEQ]`).
 * - Boolean data uses byte storage in `PB` (0/1), while meter booleans may ride `MU32`
 *   at higher layers; that policy lives in `core/spec` catalogs, not here.
 */

import { createInternalError } from "@seqlok/base";

/**
 * Canonical backing packing order.
 *
 * Keep this list stable: changing it is an ABI/layout change and must be done in a
 * deliberate slice with corresponding planner + backing updates.
 */
export const PLANE_PACK_ORDER = [
  "MF64",
  "PF32",
  "PI32",
  "PU",
  "MF32",
  "MU32",
  "MU",
  "PB",
] as const;

export type PlaneKey = (typeof PLANE_PACK_ORDER)[number];

/**
 * Back-compat alias. Prefer `PLANE_PACK_ORDER`.
 */
export const ALL_PLANES: readonly PlaneKey[] = PLANE_PACK_ORDER;

type BytesPerElem = 1 | 4 | 8;

/**
 * Exact record keyed by the current `PlaneKey` union.
 * (No extra keys allowed; no missing keys allowed.)
 */
export type PlaneRecord<V> = Readonly<Record<PlaneKey, V>>;

/**
 * Bytes per element for each plane’s storage representation.
 *
 * This is also the *natural alignment* requirement for that plane’s typed view.
 */
export const BYTES_PER_ELEM: PlaneRecord<BytesPerElem> = {
  PF32: 4,
  PI32: 4,
  PB: 1,
  PU: 4,

  MF32: 4,
  MF64: 8,
  MU32: 4,
  MU: 4,
} as const;

const PLANE_SET: ReadonlySet<string> = new Set<string>(PLANE_PACK_ORDER);

/**
 * Runtime type-guard for untrusted input.
 */
export function isPlaneKey(x: string): x is PlaneKey {
  return PLANE_SET.has(x);
}

/**
 * Assert helper for defensive parsing.
 */
export function assertPlaneKey(
  x: string,
  where: string,
): asserts x is PlaneKey {
  if (!isPlaneKey(x)) {
    throw createInternalError("assertionFailed", {
      where,
      detail: `invalid PlaneKey: ${x}`,
    });
  }
}

/**
 * Round `n` up to the next multiple of `align`.
 *
 * @remarks
 * - `n` and `align` must be safe non-negative integers.
 * - `align` must be a positive power-of-two.
 */
export function roundUpTo(n: number, align: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw createInternalError("assertionFailed", {
      where: "primitives.planes.roundUpTo",
      detail: `n must be a non-negative safe integer, got ${String(n)}`,
    });
  }

  if (
    !Number.isSafeInteger(align) ||
    align <= 0 ||
    (align & (align - 1)) !== 0
  ) {
    throw createInternalError("assertionFailed", {
      where: "primitives.planes.roundUpTo",
      detail: `align must be a positive power-of-two safe integer, got ${String(align)}`,
    });
  }

  const out = Math.ceil(n / align) * align;

  if (!Number.isSafeInteger(out)) {
    throw createInternalError("assertionFailed", {
      where: "primitives.planes.roundUpTo",
      detail: `rounded result must be a safe integer, got ${String(out)}`,
    });
  }

  return out;
}
