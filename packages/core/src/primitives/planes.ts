/**
 * @packageDocumentation
 * Plane identifiers and alignment helpers for Seqlok memory plans.
 *
 * Each plane groups values by storage type to guarantee deterministic layout
 * and correct TypedArray alignment:
 *
 * - `PF32`  Float32 **params**
 * - `PI32`  Int32 **params** (also enum indices)
 * - `PB`    Boolean **params** encoded as Uint8 (ABI v1)
 * - `PU`    **Param** seqlock counters `[LOCK, SEQ]` as Uint32
 * - `MF32`  Float32 **meters**
 * - `MU32`  Uint32 **meters**
 * - `MF64`  Float64 **meters**
 * - `MU`    **Meter** seqlock counters `[LOCK, SEQ]` as Uint32
 *
 * @remarks
 * - PB uses one byte per boolean in v1 (no bit-packing).
 * - Seqlock planes (`PU`/`MU`) store two u32 per lock: `LOCK` at 0, `SEQ` at 1.
 * - All offsets must be aligned to the element size of their plane; use
 *   {@link isAligned} and {@link roundUpTo}.
 */

/** Canonical plane keys for Seqlok’s deterministic memory layout. */
export type PlaneKey = 'PF32' | 'PI32' | 'PB' | 'PU' | 'MF32' | 'MU32' | 'MF64' | 'MU';

/**
 * Bytes per element for each plane’s storage type.
 *
 * @example
 * ```ts
 * // Pad an offset up to the next 8-byte boundary (MF64)
 * const aligned = roundUpTo(13, BYTES_PER_ELEM.MF64); // 16
 * ```
 */
export const BYTES_PER_ELEM: Readonly<Record<PlaneKey, number>> = {
  PF32: 4,
  PI32: 4,
  PB: 1,
  PU: 4,
  MF32: 4,
  MU32: 4,
  MF64: 8,
  MU: 4,
};

/**
 * Round a value up to the nearest multiple.
 *
 * @example
 * ```ts
 * roundUpTo(12, 4); // 12
 * roundUpTo(13, 4); // 16
 * ```
 * @param value Byte offset or size.
 * @param multiple Alignment multiple; if ≤ 0, returns `value`.
 */
export function roundUpTo(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }
  const r = value % multiple;
  return r === 0 ? value : value + (multiple - r);
}

/**
 * True if `n` is a positive power of two.
 *
 * @example
 * ```ts
 * isPow2(8);  // true
 * isPow2(10); // false
 * ```
 */
export function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Validate that a byte offset is correctly aligned for the plane.
 *
 * @example
 * ```ts
 * isAligned(24, 'MF64'); // true (8-byte)
 * isAligned(28, 'MF64'); // false
 * ```
 * @param offset Byte offset within the backing store.
 * @param plane Plane whose element size defines the required alignment.
 */
export function isAligned(offset: number, plane: PlaneKey): boolean {
  const bytes = BYTES_PER_ELEM[plane];
  return offset % bytes === 0;
}

/** @internal Compile-time drift guards (no runtime emit). */
type _AssertTrue<T extends true> = T;
type _PlaneBytesCovered = _AssertTrue<
  Exclude<PlaneKey, keyof typeof BYTES_PER_ELEM> extends never ? true : false
>;
type _PlaneMapNoExtras = _AssertTrue<
  Exclude<keyof typeof BYTES_PER_ELEM, PlaneKey> extends never ? true : false
>;
