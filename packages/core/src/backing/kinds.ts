// File: packages/core/src/backing/kinds.ts

/**
 * @fileoverview
 * Compatibility shim for plane + kind vocabulary.
 *
 * Planes, packing order, and alignment helpers are defined in `@seqlok/primitives`.
 * Kind catalogs live in `core/spec/kinds.ts` so `plan/*` can depend on them without
 * importing `backing/*`.
 *
 * Prefer importing directly from the canonical modules:
 * - `@seqlok/primitives` for plane vocabulary
 * - `../spec/kinds` for kind catalogs
 *
 * This file exists to keep older `core/backing/*` import paths working while we slice
 * changes safely and eliminate re-export drift.
 */

export {
  PLANE_PACK_ORDER,
  ALL_PLANES,
  BYTES_PER_ELEM,
  isPlaneKey,
  assertPlaneKey,
  roundUpTo,
} from "@seqlok/primitives";

export type { PlaneKey } from "@seqlok/primitives";

export { PARAM_KIND_CATALOG, METER_KIND_CATALOG } from "../spec/kinds";

export type { ParamKind, MeterKind, KindCatalogEntry } from "../spec/kinds";
