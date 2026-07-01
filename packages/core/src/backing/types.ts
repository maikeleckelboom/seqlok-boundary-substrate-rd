/**
 * @fileoverview
 * Backing and mapped-view type definitions.
 *
 * @remarks
 * - Describes backing kinds (packed SharedArrayBuffer, partitioned
 *   SharedArrayBuffer, wasm memory).
 * - Defines the `MappedViews` structure used by bindings and diagnostics.
 * - Centralises typed views for param, meter and lock planes.
 *
 * @internal
 */

import type { PlaneKey } from "../primitives/planes";

/**
 * Supported memory backing strategies for Exclave Boundary's memory planes.
 *
 * @remarks
 * - `packed`: single SharedArrayBuffer for all planes.
 * - `partitioned`: separate SharedArrayBuffer per plane.
 * - `wasm`: WebAssembly.Memory with a shared buffer.
 */
export type BackingKind = "packed" | "partitioned" | "wasm";

/** Contiguous SharedArrayBuffer backing all planes in a single allocation. */
export interface PackedBacking {
  readonly kind: "packed";
  readonly sab: SharedArrayBuffer;
}

/** Separate SharedArrayBuffer allocation for each plane. */
export interface PartitionedBacking {
  readonly kind: "partitioned";
  readonly planes: Readonly<Record<PlaneKey, SharedArrayBuffer>>;
}

/** WebAssembly.Memory instance with shared buffer for WebAssembly interop. */
export interface WasmBacking {
  readonly kind: "wasm";
  readonly memory: WebAssembly.Memory;
}

/** Union of all supported memory backing strategies. */
export type Backing = PackedBacking | PartitionedBacking | WasmBacking;

/** Type guard for {@link PackedBacking} instances. */
export function isPackedBacking(backing: Backing): backing is PackedBacking {
  return backing.kind === "packed";
}

/** Type guard for {@link PartitionedBacking} instances. */
export function isPartitionedBacking(
  backing: Backing,
): backing is PartitionedBacking {
  return backing.kind === "partitioned";
}

/** Type guard for {@link WasmBacking} instances. */
export function isWasmBacking(backing: Backing): backing is WasmBacking {
  return backing.kind === "wasm";
}
