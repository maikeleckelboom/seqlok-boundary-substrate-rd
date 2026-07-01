/**
 * @fileoverview
 * Allocates a single contiguous SharedArrayBuffer for the packed layout.
 *
 * @remarks
 * - Computes a contiguous layout for all planes and locks from the Plan.
 * - Returns a packed backing that maps all planes over one buffer.
 * - Throws structured errors when SharedArrayBuffer allocation or support fails.
 *
 * @see {@link ../../docs/architecture/11-backing-and-plane-layout.md} for layout details
 *
 * @internal
 */

import { createError } from "../errors/error";
import { throwEnvUnsupported } from "../errors/helpers";

import type { PackedBacking } from "./types";
import type { Plan } from "../plan/types";
import type { SpecInput } from "../spec/types";

/**
 * Allocates a contiguous SharedArrayBuffer for the entire layout.
 *
 * @typeParam S - Layout spec type
 * @param plan - Memory layout specification
 * @returns PackedBacking backed by a single SharedArrayBuffer
 *
 * @throws {Error}
 * - If SharedArrayBuffer is unsupported in the environment
 * - If allocation fails due to memory constraints
 *
 * @example
 * ```typescript
 * const backing = allocatePacked(plan);
 * // backing.sab contains all planes contiguously
 * ```
 */
export function allocatePacked<S extends SpecInput>(
  plan: Plan<S>,
): PackedBacking {
  if (typeof SharedArrayBuffer === "undefined") {
    throwEnvUnsupported(
      "SharedArrayBuffer",
      "missing SharedArrayBuffer (check COOP/COEP for browsers)",
    );
  }

  try {
    const sab = new SharedArrayBuffer(plan.bytesTotal);
    return { kind: "packed", sab };
  } catch (cause) {
    throw createError(
      "backing.allocFailed",
      "Failed to allocate SharedArrayBuffer",
      {
        plane: "all",
        requestedBytes: plan.bytesTotal,
        allocatedBytes: 0,
        where: "allocatePacked",
      },
      cause,
    );
  }
}

/**
 * Gets the total byte length of a non-partitioned backing.
 *
 * @remarks
 * Only works with `packed` and `wasm` backings.
 * For `partitioned`, use the plan's `bytesTotal` directly.
 *
 * @param backing - Backing to measure (must not be partitioned)
 * @returns Size in bytes
 */
export function backingByteLength(
  backing:
    | { kind: "packed"; sab: SharedArrayBuffer }
    | {
        kind: "wasm";
        memory: WebAssembly.Memory;
      },
): number {
  return backing.kind === "packed"
    ? backing.sab.byteLength
    : (backing.memory.buffer as ArrayBufferLike).byteLength;
}
