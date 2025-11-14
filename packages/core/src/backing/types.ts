import type { PlaneKey } from '../primitives/planes';

/** The different kinds of memory backing for planes. */
export type BackingKind = 'shared' | 'shared-partitioned' | 'wasm-shared';

/** A contiguous SharedArrayBuffer backing all planes. */
export interface SharedBacking {
  readonly kind: 'shared';
  readonly sab: SharedArrayBuffer;
}

/** A separate SharedArrayBuffer for each plane. */
export interface SharedPartitionedBacking {
  readonly kind: 'shared-partitioned';
  readonly planes: Readonly<Record<PlaneKey, SharedArrayBuffer>>;
}

/** A shared WebAssembly.Memory instance. Its underlying buffer is a SharedArrayBuffer. */
export interface WasmSharedBacking {
  readonly kind: 'wasm-shared';
  readonly memory: WebAssembly.Memory;
}

/** A union of all supported memory backing types. */
export type Backing = SharedBacking | SharedPartitionedBacking | WasmSharedBacking;

/**
 * Type guard to check if a backing is a SharedBacking.
 * @param backing The backing instance to check.
 * @returns True if the backing is a SharedBacking, otherwise false.
 */
export function isSharedBacking(backing: Backing): backing is SharedBacking {
  return backing.kind === 'shared';
}

/**
 * Type guard to check if a backing is a SharedPartitionedBacking.
 * @param backing The backing instance to check.
 * @returns True if the backing is a SharedPartitionedBacking, otherwise false.
 */
export function isSharedPartitionedBacking(
  backing: Backing,
): backing is SharedPartitionedBacking {
  return backing.kind === 'shared-partitioned';
}

/**
 * Type guard to check if a backing is a WasmSharedBacking.
 * @param backing The backing instance to check.
 * @returns True if the backing is a WasmSharedBacking, otherwise false.
 */
export function isWasmSharedBacking(backing: Backing): backing is WasmSharedBacking {
  return backing.kind === 'wasm-shared';
}
