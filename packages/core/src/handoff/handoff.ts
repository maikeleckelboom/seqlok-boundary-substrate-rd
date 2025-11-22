/**
 * @fileoverview
 * Handoff construction and validation (v2.0 – zero duplication).
 *
 * This module defines the producer/consumer helpers that move a `Plan<S>`
 * and its backing memory across concurrency boundaries:
 *
 * - `buildHandoff(plan, backing)` – owner-side construction of a `Handoff<S>`.
 * - `receiveHandoff(handoff)` – boundary validation → `ReceivedHandoff<S>`.
 * - `verifyHandoff(localPlan, remotePlan)` – optional consistency check.
 *
 * Design principles:
 *
 * - `Plan<S>` is the single source of truth for layout and spec metadata.
 * - The handoff envelope carries only `{ version, packing, backingDescriptor, plan }`.
 * - No duplicated header fields, no derived lengths stored twice.
 * - Consumers bind from `ReceivedHandoff<S>` (plan + backing descriptor),
 * not from `(Plan<S>, Backing)` directly – preserving the owner/processor
 * authority boundary.
 */

import { createError } from '../errors/error';
import { ALL_PLANES, type PlaneKey } from '../primitives/planes';

import type { Handoff, ReceivedHandoff } from './types';
import type { Backing } from '../backing/types';
import type { Plan, PlaneByteLengths } from '../plan/types';
import type { SpecInput } from '../spec/types';

/**
 * Protocol version supported by this module.
 *
 * @remarks
 * - Used by `buildHandoff` as the outbound version tag.
 * - Checked by `receiveHandoff` at the boundary.
 * - Increment when introducing breaking changes to the handoff shape or
 * interpretation semantics.
 */
const SUPPORTED_HANDOFF_VERSION = 1 as const;

/**
 * Narrow an arbitrary value to a plain object.
 *
 * @param x - Value to test.
 * @returns `true` if `x` is a non-null object.
 *
 * @internal
 * Used for structural validation of handoff envelopes and plans.
 */
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Check whether a value is a `SharedArrayBuffer`.
 *
 * @param x - Value to test.
 * @returns `true` if `x` is an instance of `SharedArrayBuffer`.
 *
 * @remarks
 * Guards against environments where `SharedArrayBuffer` is not defined.
 *
 * @internal
 */
function isSharedArrayBuffer(x: unknown): x is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== 'undefined' && x instanceof SharedArrayBuffer;
}

/**
 * Structural guard for `PlaneByteLengths`.
 *
 * @internal
 */
function isPlaneByteLengths(value: unknown): value is PlaneByteLengths {
  if (!isPlainObject(value)) {
    return false;
  }

  for (const v of Object.values(value)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return false;
    }
  }

  return true;
}

/**
 * Structural guard for `Plan<S>` used at the boundary.
 *
 * @internal
 */
function isPlanLike<S extends SpecInput>(plan: unknown): plan is Plan<S> {
  if (!isPlainObject(plan)) {
    return false;
  }

  if (typeof plan.hash !== 'string' || typeof plan.bytesTotal !== 'number') {
    return false;
  }

  if (!isPlaneByteLengths(plan.planes)) {
    return false;
  }

  return true;
}

/**
 * Construct a {@link Handoff} from a plan and backing.
 *
 * @typeParam S - Spec type (inferred from `plan`).
 * @param plan - Layout plan for the spec.
 * @param backing - Backing strategy for the plan (shared or shared-partitioned).
 * @returns Typed handoff envelope (`Handoff<S>`) suitable for transfer.
 *
 * @throws {@link import('../errors').SeqlokError}
 * Throws `handoff.invalidArtifact` if the backing is incompatible with the plan,
 * or if an unsupported backing kind is provided.
 *
 * @remarks
 * - The handoff carries only `{ version, packing, backingDescriptor, plan }`.
 * All metadata (hash, byte lengths, planes, spec shape) is derived from `plan`.
 * - This is an owner-side operation: callers must already have a `Plan<S>`
 * and a backing, typically obtained via `planLayout(spec)` and one of the
 * `allocate*` helpers.
 * - **Output is Branded**: The returned object is strictly typed as `Handoff<S>`
 * via a phantom brand to prevent accidental usage of raw objects in strict contexts.
 *
 * - v1 supports:
 * - `kind: 'shared'` → `packing: 'shared'` with a single `sab`.
 * - `kind: 'shared-partitioned'` → `packing: 'shared-partitioned'` with `planes`.
 * - `kind: 'wasm-shared'` is currently **not** serializable via handoff and
 * will throw a descriptive error.
 *
 * @example
 * ```ts
 * const spec = defineSpec(...);
 * const plan = planLayout(spec);      // Plan<MySpec>
 * const backing = allocateShared(plan);
 * const handoff = buildHandoff(plan, backing);  // Handoff<MySpec>
 *
 * // Access metadata via plan:
 * console.log(handoff.plan.hash);       // spec hash
 * console.log(handoff.plan.bytesTotal); // required bytes
 * console.log(handoff.plan.planes);     // plane layout
 * ```
 */
export function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: Backing,
): Handoff<S> {
  if (backing.kind === 'shared') {
    if (!isSharedArrayBuffer(backing.sab)) {
      throw createError(
        'handoff.invalidArtifact',
        'Handoff requires a SharedArrayBuffer backing for kind="shared"',
        {
          where: 'handoff.buildHandoff',
          detail: 'backing.sab',
        },
      );
    }

    const requiredBytes = plan.bytesTotal >>> 0;
    const actualBytes = backing.sab.byteLength >>> 0;

    if (actualBytes < requiredBytes) {
      throw createError(
        'handoff.invalidArtifact',
        'Backing SharedArrayBuffer undersized for plan',
        {
          where: 'handoff.buildHandoff',
          expectedBytes: requiredBytes,
          receivedBytes: actualBytes,
        },
      );
    }

    // Cast to branded type on the way out.
    return {
      version: SUPPORTED_HANDOFF_VERSION,
      packing: 'shared',
      sab: backing.sab,
      plan,
    } as unknown as Handoff<S>;
  }

  if (backing.kind === 'shared-partitioned') {
    // View plan.planes through the same key-space as the backing.
    const planeLengths: Record<PlaneKey, number> = plan.planes as Record<
      PlaneKey,
      number
    >;
    const planes = backing.planes;

    for (const plane of ALL_PLANES) {
      const sab = planes[plane];

      if (!isSharedArrayBuffer(sab)) {
        throw createError(
          'handoff.invalidArtifact',
          'Plane backing is not a SharedArrayBuffer',
          {
            where: 'handoff.buildHandoff',
            detail: `plane=${plane}`,
          },
        );
      }

      const requiredBytes = planeLengths[plane] >>> 0;
      const actualBytes = sab.byteLength >>> 0;

      if (actualBytes < requiredBytes) {
        throw createError(
          'handoff.invalidArtifact',
          'Plane backing undersized for plan',
          {
            where: 'handoff.buildHandoff',
            detail: `plane=${plane}`,
            expectedBytes: requiredBytes,
            receivedBytes: actualBytes,
          },
        );
      }
    }

    // Cast to branded type on the way out.
    return {
      version: SUPPORTED_HANDOFF_VERSION,
      packing: 'shared-partitioned',
      planes,
      plan,
    } as unknown as Handoff<S>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (backing.kind === 'wasm-shared') {
    throw createError(
      'handoff.invalidArtifact',
      'wasm-shared backing is not yet supported by the handoff protocol',
      {
        where: 'handoff.buildHandoff',
        detail: 'kind=wasm-shared',
      },
    );
  }

  const kind = (backing as { kind?: unknown }).kind;

  throw createError('handoff.invalidArtifact', 'Unsupported backing kind for handoff', {
    where: 'handoff.buildHandoff',
    detail: `kind=${String(kind)}`,
  });
}

/**
 * Receiver-side overload: validates and unpacks a typed handoff envelope.
 *
 * @typeParam S - Spec type (inferred from `handoff.plan: Plan<S>`).
 * @param handoff - Handoff envelope received from another thread/process.
 * @returns Validated {@link ReceivedHandoff} with a typed plan.
 *
 * @throws {@link import('../errors').SeqlokError}
 * Throws one of:
 * - `handoff.invalidArtifact` – wrong shape, missing plan, or invalid backing.
 * - `handoff.versionMismatch` – unsupported `version` field.
 *
 * @remarks
 * Use this overload when the `Handoff<S>` type is preserved across the
 * boundary (e.g. strongly-typed `postMessage` payloads in same-process checks).
 */
export function receiveHandoff<S extends SpecInput>(
  handoff: Handoff<S>,
): ReceivedHandoff<S>;

/**
 * Receiver-side overload: validates and unpacks an untyped envelope.
 *
 * @param handoff - Handoff envelope with erased type (e.g. `unknown` from `postMessage`).
 * @returns Validated {@link ReceivedHandoff} with a generic `SpecInput` plan.
 *
 * @throws {@link import('../errors').SeqlokError}
 * Throws one of:
 * - `handoff.invalidArtifact` – wrong shape, missing plan, or invalid backing.
 * - `handoff.versionMismatch` – unsupported `version` field.
 *
 * @remarks
 * Use this overload when the inbound value is `unknown` or not statically
 * typed as `Handoff<S>`. The resulting plan is still structurally validated
 * but typed as `Plan<SpecInput>`. This is the standard entry point for workers.
 */
export function receiveHandoff(handoff: unknown): ReceivedHandoff;

/**
 * Runtime implementation for both `receiveHandoff` overloads.
 *
 * @internal
 */
export function receiveHandoff<S extends SpecInput>(
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  handoff: Handoff<S> | unknown,
): ReceivedHandoff<S> {
  if (!isPlainObject(handoff)) {
    throw createError('handoff.invalidArtifact', 'Handoff artifact must be an object', {
      where: 'handoff.receiveHandoff',
      detail: 'non-object',
    });
  }

  const hx = handoff as {
    version?: unknown;
    packing?: unknown;
    sab?: unknown;
    planes?: unknown;
    plan?: unknown;
  };

  // Validate protocol version
  if (hx.version !== SUPPORTED_HANDOFF_VERSION) {
    throw createError('handoff.versionMismatch', 'Unexpected handoff version', {
      where: 'handoff.receiveHandoff',
      expectedVersion: SUPPORTED_HANDOFF_VERSION,
      receivedVersion: typeof hx.version === 'number' ? hx.version : Number.NaN,
    });
  }

  // Validate plan structure (this is our metadata source)
  if (!isPlanLike<S>(hx.plan)) {
    throw createError('handoff.invalidArtifact', 'Missing or invalid plan in handoff', {
      where: 'handoff.receiveHandoff',
      detail: 'plan',
    });
  }

  const plan = hx.plan;

  if (hx.packing === 'shared') {
    if (!isSharedArrayBuffer(hx.sab)) {
      throw createError(
        'handoff.invalidArtifact',
        'Handoff buffer is not SharedArrayBuffer',
        {
          where: 'handoff.receiveHandoff',
          detail: 'sab',
        },
      );
    }

    return {
      packing: 'shared',
      sab: hx.sab,
      plan,
    } as ReceivedHandoff<S>;
  }

  if (hx.packing === 'shared-partitioned') {
    if (!isPlainObject(hx.planes)) {
      throw createError(
        'handoff.invalidArtifact',
        'Handoff planes map must be an object',
        {
          where: 'handoff.receiveHandoff',
          detail: 'planes',
        },
      );
    }

    const planesObject = hx.planes;
    const planeSabMap: Record<string, SharedArrayBuffer> = {};

    for (const [key, value] of Object.entries(planesObject)) {
      if (!isSharedArrayBuffer(value)) {
        throw createError(
          'handoff.invalidArtifact',
          'Plane backing is not a SharedArrayBuffer',
          {
            where: 'handoff.receiveHandoff',
            detail: `plane=${key}`,
          },
        );
      }

      planeSabMap[key] = value;
    }

    return {
      packing: 'shared-partitioned',
      planes: planeSabMap,
      plan,
    } as ReceivedHandoff<S>;
  }

  throw createError('handoff.invalidArtifact', 'Unsupported handoff packing', {
    where: 'handoff.receiveHandoff',
    detail: `packing=${String(hx.packing)}`,
  });
}

/**
 * Compare two plans for compatibility.
 *
 * @typeParam S - Spec type (inferred from `localPlan`).
 * @param localPlan - Locally computed plan.
 * @param remotePlan - Plan received from a remote handoff.
 *
 * @throws {@link import('../errors').SeqlokError}
 * Throws:
 * - `handoff.specHashMismatch` if `hash` values differ.
 * - `handoff.backingMismatch` if `bytesTotal` values differ.
 *
 * @remarks
 * This function compares plans directly – no separate metadata structure.
 * It is useful when you want to assert that a locally computed plan matches
 * the one embedded in a remote handoff, for example in:
 *
 * - Electron main vs renderer,
 * - multi-process setups,
 * - or diagnostics tests that must prove spec parity.
 *
 * It does **not** perform any binding or mapping; callers still bind from
 * {@link ReceivedHandoff}, never from `(Plan, Backing)` directly.
 *
 * @example
 * ```ts
 * // Main thread:
 * const spec = defineSpec(.);
 * const plan = planLayout(spec);
 * const backing = allocateShared(plan);
 * const handoff = buildHandoff(plan, backing);
 *
 * // Worker thread:
 * const received = receiveHandoff(handoff);
 * verifyHandoff(plan, received.plan);  // Throws if mismatch
 * ```
 */
export function verifyHandoff<S extends SpecInput>(
  localPlan: Plan<S>,
  remotePlan: Plan<S>,
): void {
  if (localPlan.hash !== remotePlan.hash) {
    throw createError('handoff.specHashMismatch', 'Spec hash mismatch', {
      where: 'handoff.verifyHandoff',
      expectedHash: localPlan.hash,
      receivedHash: remotePlan.hash,
      localHash: localPlan.hash,
      remoteHash: remotePlan.hash,
      diff: computeHashDiff(localPlan.hash, remotePlan.hash),
    });
  }

  if (localPlan.bytesTotal !== remotePlan.bytesTotal) {
    throw createError('handoff.backingMismatch', 'Backing byteLength mismatch', {
      where: 'handoff.verifyHandoff',
      expectedBytes: localPlan.bytesTotal,
      receivedBytes: remotePlan.bytesTotal,
      local: localPlan.bytesTotal,
      remote: remotePlan.bytesTotal,
    });
  }
}

/**
 * Compute a small diff string between two hash values.
 *
 * @remarks
 * This is for diagnostics only, used in `verifyHandoff` error payloads.
 *
 * @internal
 */
function computeHashDiff(expected: string, received: string): string {
  const len = Math.min(expected.length, received.length);
  let firstDiff = -1;

  for (let i = 0; i < len; i += 1) {
    if (expected[i] !== received[i]) {
      firstDiff = i;
      break;
    }
  }

  if (firstDiff === -1 && expected.length === received.length) {
    return 'no-diff';
  }

  return `first-diff@${String(firstDiff)}`;
}
