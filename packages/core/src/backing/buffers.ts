/**
 * @fileoverview
 * Unified access to backing storage buffers.
 *
 * @remarks
 * - Abstracts away differences between backing types
 * - Provides type-safe access to underlying SharedArrayBuffer(s)
 * - Used by allocators, mappers, and tests
 *
 * @see {@link getSharedBuffer} - For single-buffer backings
 * @see {@link getBufferForPlane} - For plane-specific access
 * @see {@link ../../docs/architecture/11-backing-and-plane-layout.md} for design
 *
 * @internal
 */

import { createError } from '../errors/error';

import type { Backing } from './types';
import type { PlaneKey } from '../primitives/planes';

/**
 * Gets the single SharedArrayBuffer for a non-partitioned backing.
 *
 * @remarks
 * - `shared`: Returns the contiguous SAB
 * - `wasm-shared`: Returns the WebAssembly.Memory buffer
 * - `shared-partitioned`: Throws (use {@link getBufferForPlane} instead)
 *
 * @throws {SeqlokError<'internal.assertionFailed'>}
 * If called with a partitioned backing
 *
 * @example
 * ```typescript
 * // For non-partitioned backings
 * const buf = getSharedBuffer(backing);
 * const view = new Float32Array(buf);
 * ```
 *
 * @internal
 */
export function getSharedBuffer(backing: Backing): SharedArrayBuffer {
  switch (backing.kind) {
    case 'shared':
      return backing.sab;

    case 'wasm-shared':
      // `allocateWasmShared` ensures this is a SharedArrayBuffer.
      // We rely on that invariant here to keep this helper hot-path friendly.
      return backing.memory.buffer as unknown as SharedArrayBuffer;

    case 'shared-partitioned':
      break;

    default: {
      // Exhaustiveness guard in case BackingKind ever grows.
      // noinspection UnnecessaryLocalVariableJS
      const _exhaustive: never = backing;
      void _exhaustive;
    }
  }

  throw createError(
    'internal.assertionFailed',
    'getSharedBuffer(backing): partitioned backing has no single SharedArrayBuffer; use getBufferForPlane instead.',
    {
      where: 'backing.getSharedBuffer',
      detail: 'shared-partitioned',
    },
  );
}

/**
 * Gets the buffer for a specific plane, handling all backing types.
 *
 * @remarks
 * - `shared-partitioned`: Returns the plane's dedicated SAB
 * - `shared`/`wasm-shared`: Returns the main buffer (offsets handled by mappers)
 *
 * @example
 * ```typescript
 * // Works with any backing type
 * const buf = getBufferForPlane(backing, 'PF32');
 * const view = new Float32Array(buf);
 * ```
 *
 * @see {@link mapViews} For creating typed array views
 */
export function getBufferForPlane(backing: Backing, plane: PlaneKey): SharedArrayBuffer {
  if (backing.kind === 'shared-partitioned') {
    return backing.planes[plane];
  }
  return getSharedBuffer(backing);
}
