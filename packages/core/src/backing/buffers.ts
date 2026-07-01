/**
 * @fileoverview
 * Unified access to backing storage buffers.
 *
 * @remarks
 * - Abstracts away differences between backing types
 * - Provides type-safe access to underlying SharedArrayBuffer(s)
 * - Used by allocators, mappers, and tests
 *
 * @see {@link getBackingBuffer} - For single-buffer backings
 * @see {@link getPlaneBuffer} - For plane-specific access
 * @see {@link ../../docs/architecture/11-backing-and-plane-layout.md} for design
 *
 * @internal
 */

import { createError } from "../errors/error";

import type { Backing } from "./types";
import type { PlaneKey } from "../primitives/planes";

function isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    value instanceof SharedArrayBuffer
  );
}

/**
 * Gets the single SharedArrayBuffer for a non-partitioned backing.
 *
 * @remarks
 * - `packed`: Returns the contiguous SharedArrayBuffer
 * - `wasm`: Returns the WebAssembly.Memory buffer
 * - `partitioned`: Throws (use {@link getPlaneBuffer} instead)
 *
 * @throws {BoundaryError<'internal.assertionFailed'>}
 * If called with a partitioned backing
 *
 * @example
 * ```typescript
 * // For non-partitioned backings
 * const buf = getBackingBuffer(backing);
 * const view = new Float32Array(buf);
 * ```
 *
 * @internal
 */
export function getBackingBuffer(backing: Backing): SharedArrayBuffer {
  switch (backing.kind) {
    case "packed":
      return backing.sab;

    case "wasm":
      // `allocateWasm` ensures this is a SharedArrayBuffer.
      // We rely on that invariant here to keep this helper hot-path friendly.
      if (isSharedArrayBuffer(backing.memory.buffer)) {
        return backing.memory.buffer;
      }
      throw createError(
        "internal.assertionFailed",
        "getBackingBuffer(backing): wasm backing buffer is not a SharedArrayBuffer.",
        {
          where: "backing.getBackingBuffer",
          detail: "wasm",
        },
      );

    case "partitioned":
      break;

    default: {
      // Exhaustiveness guard in case BackingKind ever grows.
      // noinspection UnnecessaryLocalVariableJS
      const _exhaustive: never = backing;
      void _exhaustive;
    }
  }

  throw createError(
    "internal.assertionFailed",
    "getBackingBuffer(backing): partitioned backing has no single SharedArrayBuffer; use getPlaneBuffer instead.",
    {
      where: "backing.getBackingBuffer",
      detail: "partitioned",
    },
  );
}

/**
 * Gets the buffer for a specific plane, handling all backing types.
 *
 * @remarks
 * - `partitioned`: Returns the plane's dedicated SharedArrayBuffer
 * - `packed`/`wasm`: Returns the main buffer (offsets handled by mappers)
 *
 * @example
 * ```typescript
 * // Works with any backing type
 * const buf = getPlaneBuffer(backing, 'PF32');
 * const view = new Float32Array(buf);
 * ```
 *
 * @see {@link mapViews} For creating typed array views
 */
export function getPlaneBuffer(
  backing: Backing,
  plane: PlaneKey,
): SharedArrayBuffer {
  if (backing.kind === "partitioned") {
    return backing.planes[plane];
  }
  return getBackingBuffer(backing);
}
