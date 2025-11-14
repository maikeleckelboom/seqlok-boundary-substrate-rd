import { createError } from '../errors';

/**
 * Pure, non-throwing codec for enum labels ↔ indices used by the Spec/DSL layer.
 *
 * @remarks
 * - The constructor function {@link enumOf} performs **spec-time validation** and throws
 *   typed Seqlok errors (`spec.enumInvalid`) when the definition is invalid.
 * - The **hot path** (controller usage) stays non-throwing:
 *   - {@link EnumCodec.tryIndex} returns `-1` for unknown labels.
 *   - {@link EnumCodec.tryLabel} returns `undefined` for out-of-range indices.
 *   Binding code turns those sentinels into **binding-domain** errors
 *   (e.g., `binding.paramInvalidValue`).
 *
 * Complexity:
 * - Build: O(n) time and O(n) space for `n = values.length`.
 * - Lookup: O(1) expected (hash map) for label→index, O(1) for index→label.
 */
export interface EnumCodec<V extends readonly string[]> {
  /** Canonical value list (order defines indices). */
  readonly values: V;
  /** Number of values. */
  readonly size: number;

  /**
   * Map a label to its numeric index.
   *
   * @returns The index in `[0, size)`, or `-1` if the label is not present.
   */
  tryIndex(label: V[number]): number;

  /**
   * Map an index back to its label.
   *
   * @returns The label if `0 ≤ index < size`, otherwise `undefined`.
   */
  tryLabel(index: number): V[number] | undefined;
}

/**
 * Create a pure, non-throwing enum codec from a list of string labels.
 *
 * @param values - The ordered list of labels. Order defines indices.
 * @returns An {@link EnumCodec} with O(1) lookups.
 *
 * @throws {@link SeqlokError} with `spec.enumInvalid` and:
 * - `reason: 'empty'`        — when `values.length === 0`
 * - `reason: 'invalidValue'` — when an entry is not a non-empty string
 * - `reason: 'duplicate'`    — when there are duplicate labels
 *
 * @example
 * ```ts
 * // Spec/DSL time
 * const codec = enumOf(['off','low','high'] as const);
 *
 * // Controller (write)
 * const idx = codec.tryIndex('high'); // 2
 * if (idx < 0) {
 *   // binding.paramInvalidValue at the binding layer
 * }
 *
 * // Controller (read snapshot → label)
 * const label = codec.tryLabel(1); // 'low' | undefined
 * ```
 */
export function enumOf<const V extends readonly string[]>(values: V): EnumCodec<V> {
  if (!Array.isArray(values)) {
    throw createError('spec.enumInvalid', 'Enum values must be an array of strings', {
      key: 'enum.values',
      values: [],
    });
  }

  if (values.length === 0) {
    throw createError('spec.enumInvalid', 'Enum definition has no values', {
      key: 'enum.values',
      values,
    });
  }

  const seen = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as string;
    if (typeof v !== 'string' || v.length === 0) {
      throw createError('spec.enumInvalid', 'Enum values must be non-empty strings', {
        key: 'enum.values',
        values,
        invalidIndex: i,
      });
    }
    if (seen.has(v)) {
      throw createError('spec.enumInvalid', 'Enum values must be unique', {
        key: 'enum.values',
        values,
        duplicate: v,
      });
    }
    seen.add(v);
  }

  const map = new Map<V[number], number>();
  for (let i = 0; i < values.length; i++) {
    map.set(values[i] as V[number], i);
  }

  return {
    values,
    size: values.length,
    tryIndex(label) {
      const idx = map.get(label);
      return idx ?? -1;
    },
    tryLabel(index) {
      return index >= 0 && index < values.length
        ? (values[index] as V[number])
        : undefined;
    },
  };
}
