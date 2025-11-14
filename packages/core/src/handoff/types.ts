/**
 * @fileoverview Handoff type definitions (v2.0 - zero duplication)
 *
 * Design principle: Plan<S> is the single source of truth.
 * No duplicated metadata. No phantom brands. No wrapper types.
 */

import type { Plan } from '../plan/types';
import type { SpecInput } from '../spec/types';

/**
 * Handoff packing strategy (v1: only 'shared' supported).
 */
export type HandoffPacking = 'shared';

/**
 * Typed handoff envelope for cross-thread communication.
 *
 * The `plan: Plan<S>` field is the single source of truth for:
 * - Layout metadata (hash, bytesTotal, planes)
 * - Spec structure (params, meters)
 * - Memory offsets and alignment
 *
 * Access metadata via: `handoff.plan.hash`, `handoff.plan.bytesTotal`, etc.
 *
 * @template S - Spec type (inferred from `defineSpec`)
 */
export interface Handoff<S extends SpecInput = SpecInput> {
  /** Protocol version (currently 1). */
  readonly version: 1;

  /** Memory layout strategy. */
  readonly packing: HandoffPacking;

  /** Backing memory (contiguous SharedArrayBuffer in v1). */
  readonly sab: SharedArrayBuffer;

  /**
   * Embedded plan - the inference anchor and metadata source.
   *
   * All layout information flows through this field:
   * - handoff.plan.hash → spec hash
   * - handoff.plan.bytesTotal → required bytes
   * - handoff.plan.planes → plane byte lengths
   * - handoff.plan carries Plan<S> → enables type inference
   */
  readonly plan: Plan<S>;
}

/**
 * Result of `receiveHandoff` - validated handoff with typed plan.
 *
 * This is the minimal contract: a verified plan + its backing memory.
 * No duplicated metadata - everything flows from plan.
 *
 * @template S - Spec type (inferred from handoff.plan)
 */
export interface ReceivedHandoff<S extends SpecInput> {
  /** Shared memory backing. */
  readonly sab: SharedArrayBuffer;

  /** Typed plan (single source of truth for all metadata). */
  readonly plan: Plan<S>;
}
