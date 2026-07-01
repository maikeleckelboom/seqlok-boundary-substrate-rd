/**
 * @fileoverview
 * Handoff type definitions.
 *
 * This module defines the public handoff envelopes used to move a planned
 * memory layout and its backing across concurrency boundaries:
 *
 * - {@link Handoff}: owner-side transport envelope (protocol-level shape).
 * - {@link AcceptedHandoff}: accepted processor/observer capability (plan
 *   plus backing descriptor).
 *
 * Design principles:
 *
 * - `Plan<S>` is the single source of truth for layout and spec metadata.
 * - No duplicated header fields (hash, byte lengths, planes) outside `Plan<S>`.
 * - Canonical param definitions live on `Plan<S>` so handoff observers can
 *   decode public param snapshots, including enum labels.
 * - `Handoff<S>` and `AcceptedHandoff<S>` are type-branded, so application code
 *   cannot accidentally use raw structural objects as capabilities.
 */

import type { Plan } from "../plan/types";
import type { SpecInput } from "../spec/types";

/**
 * Unique symbol used to brand Handoff types.
 *
 * @remarks
 * This prevents accidental assignment of raw objects to `Handoff<S>` in
 * TypeScript. It has no runtime representation.
 */
declare const HandoffBrand: unique symbol;

/**
 * Unique symbol used to brand AcceptedHandoff types.
 *
 * @remarks
 * `acceptHandoff` is the constructor for this capability. This prevents
 * application code from structurally forging an accepted transport value in
 * TypeScript. It has no runtime representation.
 */
declare const AcceptedHandoffBrand: unique symbol;

/**
 * Handoff packing strategy discriminator.
 *
 * @remarks
 * - v1 supports:
 *   - `packed`: a single contiguous `SharedArrayBuffer` backing all planes.
 *   - `partitioned`: one `SharedArrayBuffer` per logical plane.
 *
 * This value is consumed by `acceptHandoff` and interpreted by bindings;
 * it is not meant to be inspected by most application code.
 */
export type HandoffPacking = "packed" | "partitioned";

/**
 * Owner-side handoff envelope for a packed backing.
 *
 * @typeParam S - Spec type parameter inferred from `defineSpec`.
 */
interface PackedHandoff<S extends SpecInput = SpecInput> {
  /**
   * Phantom property ensuring this object was created via `buildHandoff`.
   */
  readonly [HandoffBrand]: S;

  /**
   * Protocol version of the handoff envelope.
   *
   * @remarks
   * - Currently fixed to `1`.
   * - Checked by `acceptHandoff` at the boundary.
   * - Version 1 describes the current unreleased handoff shape:
   *   `{ version, packing, plan, sab | planes }`.
   */
  readonly version: 1;

  /**
   * Memory layout strategy used by this handoff.
   *
   * @remarks
   * - `packed` means a single contiguous `SharedArrayBuffer` backs all planes.
   */
  readonly packing: "packed";

  /**
   * Backing memory for all planes.
   *
   * @remarks
   * - In this packing mode, this is a single contiguous
   *   {@link SharedArrayBuffer}.
   * - The {@link Plan} describes how this buffer is partitioned into logical
   *   planes such as PF32, PI32, PB, MU32, and MU.
   */
  readonly sab: SharedArrayBuffer;

  /**
   * Embedded plan: the inference anchor and metadata source.
   *
   * @remarks
   * All layout and spec information flows through this field:
   *
   * - `plan.hash`: spec hash / identity.
   * - `plan.bytesTotal`: required backing byte length.
   * - `plan.planes`: per-plane byte lengths.
   * - `Plan<S>`: carries the spec type, enabling end-to-end inference.
   *
   * There is intentionally no duplicated or denormalized metadata in
   * the handoff envelope; consumers always look at `plan` for details.
   */
  readonly plan: Plan<S>;
}

/**
 * Owner-side handoff envelope for a partitioned backing.
 *
 * @typeParam S - Spec type parameter inferred from `defineSpec`.
 */
interface PartitionedHandoff<S extends SpecInput = SpecInput> {
  /**
   * Phantom property ensuring this object was created via `buildHandoff`.
   */
  readonly [HandoffBrand]: S;

  /**
   * Protocol version of the handoff envelope.
   *
   * @remarks
   * - Currently fixed to `1`.
   * - Checked by `acceptHandoff` at the boundary.
   * - Version 1 describes the current unreleased handoff shape:
   *   `{ version, packing, plan, sab | planes }`.
   */
  readonly version: 1;

  /**
   * Memory layout strategy used by this handoff.
   *
   * @remarks
   * - `partitioned` means one `SharedArrayBuffer` backs each logical plane.
   */
  readonly packing: "partitioned";

  /**
   * Backing memory map for all planes.
   *
   * @remarks
   * - Each entry is a `SharedArrayBuffer` backing a single logical plane.
   * - Plane keys are implementation-defined (for example, `"PF32"`, `"PI32"`,
   *   `"PB"`, and `"MU32"`).
   * - The {@link Plan} describes byte lengths and offsets for each plane.
   */
  readonly planes: Readonly<Record<string, SharedArrayBuffer>>;

  /**
   * Embedded plan: the inference anchor and metadata source.
   *
   * @remarks
   * All layout and spec information flows through this field:
   *
   * - `plan.hash`: spec hash / identity.
   * - `plan.bytesTotal`: aggregate backing byte length.
   * - `plan.planes`: per-plane byte lengths.
   * - `Plan<S>`: carries the spec type, enabling end-to-end inference.
   *
   * There is intentionally no duplicated or denormalized metadata in
   * the handoff envelope; consumers always look at `plan` for details.
   */
  readonly plan: Plan<S>;
}

/**
 * Typed handoff envelope for cross-thread/process communication.
 *
 * @typeParam S - Spec type parameter inferred from `defineSpec`.
 *
 * @remarks
 * This is the shape produced by `buildHandoff` on the owner/orchestrator side
 * from `(plan, backing)`. It is designed to be:
 *
 * - Serializable via `postMessage` / structured clone.
 * - Minimal: carries only protocol bits, a backing descriptor, and `Plan<S>`.
 * - Stable: future protocol changes are versioned.
 * - Branded: ensures type safety within TypeScript environments.
 *
 * The embedded `plan: Plan<S>` is the single source of truth for:
 *
 * - Layout metadata: `plan.hash`, `plan.bytesTotal`, `plan.planes`.
 * - Spec structure: params/meters as defined by `defineSpec`.
 * - Param definitions for observer snapshot decoding.
 * - Memory offsets and alignment: plane-relative byte layouts.
 *
 * Consumers should not construct this type manually; use `buildHandoff(...)`.
 */
export type Handoff<S extends SpecInput = SpecInput> =
  | PackedHandoff<S>
  | PartitionedHandoff<S>;

/**
 * Accepted view of a packed handoff.
 *
 * @typeParam S - Spec type inferred from `handoff.plan`.
 */
interface AcceptedPackedHandoff<S extends SpecInput = SpecInput> {
  /**
   * Phantom property ensuring this object was produced by `acceptHandoff`.
   */
  readonly [AcceptedHandoffBrand]: S;

  /**
   * Memory layout strategy preserved from the original {@link Handoff}.
   */
  readonly packing: "packed";

  /**
   * SharedArrayBuffer backing for all planes.
   *
   * @remarks
   * The buffer is assumed to be at least `plan.bytesTotal` bytes long. This is
   * checked while accepting the handoff and again by mapping/binding helpers
   * where relevant.
   */
  readonly sab: SharedArrayBuffer;

  /**
   * Typed plan describing how to interpret the backing.
   *
   * @remarks
   * - This is the same `Plan<S>` that was embedded in the original
   *   {@link Handoff}.
   * - It is the single source of truth for all layout and spec metadata
   *   required by processor and observer bindings.
   */
  readonly plan: Plan<S>;
}

/**
 * Accepted view of a partitioned handoff.
 *
 * @typeParam S - Spec type inferred from `handoff.plan`.
 */
interface AcceptedPartitionedHandoff<S extends SpecInput = SpecInput> {
  /**
   * Phantom property ensuring this object was produced by `acceptHandoff`.
   */
  readonly [AcceptedHandoffBrand]: S;

  /**
   * Memory layout strategy preserved from the original {@link Handoff}.
   */
  readonly packing: "partitioned";

  /**
   * SharedArrayBuffer backings for all planes.
   *
   * @remarks
   * - Each entry is a `SharedArrayBuffer` backing a single logical plane.
   * - Plane keys must match those implied by `plan.planes`.
   */
  readonly planes: Readonly<Record<string, SharedArrayBuffer>>;

  /**
   * Typed plan describing how to interpret the backing.
   *
   * @remarks
   * - This is the same `Plan<S>` that was embedded in the original
   *   {@link Handoff}.
   * - It is the single source of truth for all layout and spec metadata
   *   required by processor and observer bindings.
   */
  readonly plan: Plan<S>;
}

/**
 * Result of `acceptHandoff`: validated handoff with typed plan.
 *
 * @typeParam S - Spec type inferred from `handoff.plan`.
 *
 * @remarks
 * This is the minimal capability a processor or observer needs in order to
 * bind after accepting a transport value. It strips away protocol-level header
 * fields after validation and keeps only the backing descriptor plus `Plan<S>`.
 *
 * `AcceptedHandoff<S>` is intentionally branded. Users should obtain it from
 * `acceptHandoff(value)` at an unknown transport boundary, or pass a typed
 * `Handoff<S>` directly to `bindProcessor` / `bindObserver` when the type is
 * preserved in the same program.
 */
export type AcceptedHandoff<S extends SpecInput = SpecInput> =
  | AcceptedPackedHandoff<S>
  | AcceptedPartitionedHandoff<S>;
