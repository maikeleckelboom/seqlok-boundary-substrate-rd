/**
 * @fileoverview
 * Handoff construction and validation (v1, zero duplicated layout metadata).
 *
 * Moves a `Plan<S>` and its backing across concurrency boundaries:
 *
 * - `buildHandoff(plan, backing)` - owner-side construction of a
 *   `Handoff<S>`.
 * - `acceptHandoff(handoff)` - boundary validation into `AcceptedHandoff<S>`.
 * - `verifyHandoff(localPlan, remotePlan)` - optional consistency check.
 *
 * Design:
 * - `Plan<S>` is the single source of truth for layout/spec metadata.
 * - The handoff envelope carries only `{ version, packing, backing, plan }`.
 * - No duplicated header fields, no derived lengths stored twice.
 * - Processor and observer bindings accept `Handoff<S>` directly for the
 *   typed happy path, or `AcceptedHandoff<S>` after an unknown transport value
 *   has been validated by `acceptHandoff`.
 */

import { brandAcceptedHandoffRuntime } from "./accepted-brand";
import { createError } from "../errors/error";
import { isObject } from "../internal/is-object";
import { ALL_PLANES, type PlaneKey } from "../primitives/planes";

import type { Handoff, AcceptedHandoff } from "./types";
import type { Backing } from "../backing/types";
import type { Plan, PlaneByteLengths } from "../plan/types";
import type { ParamDef, SpecInput } from "../spec/types";

/**
 * Protocol version supported by this module.
 *
 * @remarks
 * - Used by `buildHandoff` as the outbound version tag.
 * - Checked by `acceptHandoff` at the boundary.
 * - Version 1 describes the current unreleased handoff shape:
 *   `{ version, packing, plan, sab | planes }`.
 */
const SUPPORTED_HANDOFF_VERSION = 1 as const;

/**
 * Check whether a value is a `SharedArrayBuffer`.
 *
 * @remarks
 * Guards against environments where `SharedArrayBuffer` is not defined.
 */
function isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    value instanceof SharedArrayBuffer
  );
}

function brandHandoff<S extends SpecInput>(
  handoff:
    | {
        readonly version: 1;
        readonly packing: "packed";
        readonly sab: SharedArrayBuffer;
        readonly plan: Plan<S>;
      }
    | {
        readonly version: 1;
        readonly packing: "partitioned";
        readonly planes: Readonly<Record<string, SharedArrayBuffer>>;
        readonly plan: Plan<S>;
      },
): Handoff<S> {
  return handoff as Handoff<S>;
}

function brandAcceptedHandoff<S extends SpecInput>(
  accepted:
    | {
        readonly packing: "packed";
        readonly sab: SharedArrayBuffer;
        readonly plan: Plan<S>;
      }
    | {
        readonly packing: "partitioned";
        readonly planes: Readonly<Record<string, SharedArrayBuffer>>;
        readonly plan: Plan<S>;
      },
): AcceptedHandoff<S> {
  return brandAcceptedHandoffRuntime(accepted) as AcceptedHandoff<S>;
}

function invalidPlan(detail: string): never {
  throw createError(
    "handoff.invalidArtifact",
    "Missing or invalid plan in handoff",
    {
      where: "handoff.acceptHandoff",
      detail,
    },
  );
}

function isNonNegativeFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function assertPlaneByteLengths(
  value: unknown,
): asserts value is PlaneByteLengths {
  if (!isObject(value)) {
    invalidPlan("plan.planes");
  }

  for (const plane of ALL_PLANES) {
    if (!isNonNegativeFiniteInteger(value[plane])) {
      invalidPlan(`plan.planes.${plane}`);
    }
  }
}

function assertPlanObjects(plan: Record<string, unknown>): {
  readonly params: Record<string, unknown>;
  readonly meters: Record<string, unknown>;
  readonly locks: Record<string, unknown>;
} {
  const params = plan.params;
  if (!isObject(params)) {
    invalidPlan("plan.params");
  }

  const meters = plan.meters;
  if (!isObject(meters)) {
    invalidPlan("plan.meters");
  }

  const locks = plan.locks;
  if (!isObject(locks)) {
    invalidPlan("plan.locks");
  }

  return { params, meters, locks };
}

function assertLockPair(value: unknown, key: "PU" | "MU"): void {
  if (!isObject(value)) {
    invalidPlan(`plan.locks.${key}`);
  }

  if (!isNonNegativeFiniteInteger(value.lock)) {
    invalidPlan(`plan.locks.${key}.lock`);
  }

  if (!isNonNegativeFiniteInteger(value.seq)) {
    invalidPlan(`plan.locks.${key}.seq`);
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function assertParamDefs(
  value: unknown,
  params: Record<string, unknown>,
): asserts value is Readonly<Record<string, ParamDef>> {
  if (!isObject(value)) {
    invalidPlan("plan.paramDefs");
  }

  for (const key of Object.keys(params)) {
    const def = value[key];
    if (!isObject(def) || typeof def.kind !== "string") {
      invalidPlan(`plan.paramDefs.${key}`);
    }

    if (
      (def.kind === "enum" || def.kind === "enum.array") &&
      !isStringArray(def.values)
    ) {
      invalidPlan(`plan.paramDefs.${key}.values`);
    }

    if ("length" in def && !isNonNegativeFiniteInteger(def.length)) {
      invalidPlan(`plan.paramDefs.${key}.length`);
    }
  }
}

function assertPlanLike<S extends SpecInput>(
  plan: unknown,
): asserts plan is Plan<S> {
  if (!isObject(plan)) {
    invalidPlan("plan");
  }

  if (typeof plan.id !== "string") {
    invalidPlan("plan.id");
  }

  if (typeof plan.hash !== "string") {
    invalidPlan("plan.hash");
  }

  if (!isNonNegativeFiniteInteger(plan.bytesTotal)) {
    invalidPlan("plan.bytesTotal");
  }

  if (!isNonNegativeFiniteInteger(plan.lockStrideBytes)) {
    invalidPlan("plan.lockStrideBytes");
  }

  assertPlaneByteLengths(plan.planes);

  const { params, locks } = assertPlanObjects(plan);
  assertParamDefs(plan.paramDefs, params);
  assertLockPair(locks.PU, "PU");
  assertLockPair(locks.MU, "MU");
}

function backingKindDetail(value: unknown): string {
  if (isObject(value) && typeof value.kind === "string") {
    return `kind=${value.kind}`;
  }
  return "kind=unknown";
}

/**
 * Owner-side construction from an explicit `(plan, backing)` pair.
 *
 * @typeParam S - Spec type inferred from `plan`.
 *
 * @throws {@link import('../errors').BoundaryError}
 * - `handoff.invalidArtifact` if the backing is incompatible with the plan,
 *   or an unsupported backing kind is provided.
 *
 * @remarks
 * - `backing.kind: "packed"` emits `packing: "packed"`.
 * - `backing.kind: "partitioned"` emits `packing: "partitioned"`.
 * - `backing.kind: "wasm"` is not serializable via handoff yet and throws.
 */
export function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: Backing,
): Handoff<S>;
export function buildHandoff<S extends SpecInput>(
  plan: Plan<S>,
  backing: unknown,
): Handoff<S> {
  if (!isObject(backing)) {
    throw createError("handoff.invalidArtifact", "Unsupported backing kind", {
      where: "handoff.buildHandoff",
      detail: backingKindDetail(backing),
    });
  }

  if (backing.kind === "packed") {
    const sab = backing.sab;
    if (!isSharedArrayBuffer(sab)) {
      throw createError(
        "handoff.invalidArtifact",
        'Handoff requires a SharedArrayBuffer backing for kind="packed"',
        {
          where: "handoff.buildHandoff",
          detail: "backing.sab",
        },
      );
    }

    const requiredBytes = plan.bytesTotal >>> 0;
    const actualBytes = sab.byteLength >>> 0;

    if (actualBytes < requiredBytes) {
      throw createError(
        "handoff.invalidArtifact",
        "Backing SharedArrayBuffer undersized for plan",
        {
          where: "handoff.buildHandoff",
          expectedBytes: requiredBytes,
          receivedBytes: actualBytes,
        },
      );
    }

    return brandHandoff({
      version: SUPPORTED_HANDOFF_VERSION,
      packing: "packed",
      sab,
      plan,
    });
  }

  if (backing.kind === "partitioned") {
    const planeLengths = plan.planes as Record<PlaneKey, number>;
    const planes = backing.planes;

    if (!isObject(planes)) {
      throw createError(
        "handoff.invalidArtifact",
        "Partitioned backing planes must be an object",
        {
          where: "handoff.buildHandoff",
          detail: "backing.planes",
        },
      );
    }

    const planeSabMap: Record<string, SharedArrayBuffer> = {};

    for (const plane of ALL_PLANES) {
      const sab = planes[plane];

      if (!isSharedArrayBuffer(sab)) {
        throw createError(
          "handoff.invalidArtifact",
          "Plane backing is not a SharedArrayBuffer",
          {
            where: "handoff.buildHandoff",
            detail: `plane=${plane}`,
          },
        );
      }

      const requiredBytes = planeLengths[plane] >>> 0;
      const actualBytes = sab.byteLength >>> 0;

      if (actualBytes < requiredBytes) {
        throw createError(
          "handoff.invalidArtifact",
          "Plane backing undersized for plan",
          {
            where: "handoff.buildHandoff",
            detail: `plane=${plane}`,
            expectedBytes: requiredBytes,
            receivedBytes: actualBytes,
          },
        );
      }

      planeSabMap[plane] = sab;
    }

    return brandHandoff({
      version: SUPPORTED_HANDOFF_VERSION,
      packing: "partitioned",
      planes: planeSabMap,
      plan,
    });
  }

  if (backing.kind === "wasm") {
    throw createError(
      "handoff.invalidArtifact",
      "wasm backing is not yet supported by the handoff protocol",
      {
        where: "handoff.buildHandoff",
        detail: "kind=wasm",
      },
    );
  }

  throw createError("handoff.invalidArtifact", "Unsupported backing kind", {
    where: "handoff.buildHandoff",
    detail: backingKindDetail(backing),
  });
}

/**
 * Acceptance-boundary overload: validates and unpacks a typed handoff envelope.
 *
 * @typeParam S - Spec type inferred from `handoff.plan: Plan<S>`.
 */
export function acceptHandoff<S extends SpecInput>(
  handoff: Handoff<S>,
): AcceptedHandoff<S>;

/**
 * Acceptance-boundary overload: validates and unpacks an untyped envelope.
 *
 * Use this overload when the inbound value is `unknown`, such as from
 * `postMessage`.
 */
export function acceptHandoff(handoff: unknown): AcceptedHandoff;

/**
 * Runtime implementation for both `acceptHandoff` overloads.
 *
 * @internal
 */
export function acceptHandoff<S extends SpecInput>(
  handoff: unknown,
): AcceptedHandoff<S> {
  if (!isObject(handoff)) {
    throw createError(
      "handoff.invalidArtifact",
      "Handoff artifact must be an object",
      {
        where: "handoff.acceptHandoff",
        detail: "non-object",
      },
    );
  }

  const hx = handoff as {
    readonly version?: unknown;
    readonly packing?: unknown;
    readonly sab?: unknown;
    readonly planes?: unknown;
    readonly plan?: unknown;
  };

  if (hx.version !== SUPPORTED_HANDOFF_VERSION) {
    throw createError("handoff.versionMismatch", "Unexpected handoff version", {
      where: "handoff.acceptHandoff",
      expectedVersion: SUPPORTED_HANDOFF_VERSION,
      receivedVersion: typeof hx.version === "number" ? hx.version : Number.NaN,
    });
  }

  assertPlanLike<S>(hx.plan);
  const plan = hx.plan;

  if (hx.packing === "packed") {
    if (!isSharedArrayBuffer(hx.sab)) {
      throw createError(
        "handoff.invalidArtifact",
        "Handoff buffer is not SharedArrayBuffer",
        {
          where: "handoff.acceptHandoff",
          detail: "sab",
        },
      );
    }

    const requiredBytes = plan.bytesTotal >>> 0;
    const actualBytes = hx.sab.byteLength >>> 0;
    if (actualBytes < requiredBytes) {
      throw createError(
        "handoff.invalidArtifact",
        "Handoff buffer is undersized for plan",
        {
          where: "handoff.acceptHandoff",
          detail: "sab.byteLength",
          expectedBytes: requiredBytes,
          receivedBytes: actualBytes,
        },
      );
    }

    return brandAcceptedHandoff({
      packing: "packed",
      sab: hx.sab,
      plan,
    });
  }

  if (hx.packing === "partitioned") {
    if (!isObject(hx.planes)) {
      throw createError(
        "handoff.invalidArtifact",
        "Handoff planes map must be an object",
        {
          where: "handoff.acceptHandoff",
          detail: "planes",
        },
      );
    }

    const planesObject = hx.planes;
    const planeSabMap: Record<string, SharedArrayBuffer> = {};
    const planeLengths = plan.planes as Record<PlaneKey, number>;

    for (const plane of ALL_PLANES) {
      const value = planesObject[plane];
      if (!isSharedArrayBuffer(value)) {
        throw createError(
          "handoff.invalidArtifact",
          "Plane backing is not a SharedArrayBuffer",
          {
            where: "handoff.acceptHandoff",
            detail: `plane=${plane}`,
          },
        );
      }

      const requiredBytes = planeLengths[plane] >>> 0;
      const actualBytes = value.byteLength >>> 0;
      if (actualBytes < requiredBytes) {
        throw createError(
          "handoff.invalidArtifact",
          "Plane backing undersized for plan",
          {
            where: "handoff.acceptHandoff",
            detail: `plane=${plane}`,
            expectedBytes: requiredBytes,
            receivedBytes: actualBytes,
          },
        );
      }

      planeSabMap[plane] = value;
    }

    return brandAcceptedHandoff({
      packing: "partitioned",
      planes: planeSabMap,
      plan,
    });
  }

  throw createError("handoff.invalidArtifact", "Unsupported handoff packing", {
    where: "handoff.acceptHandoff",
    detail: `packing=${String(hx.packing)}`,
  });
}

/**
 * Compare two plans for compatibility.
 *
 * @throws {@link import('../errors').BoundaryError}
 * - `handoff.specHashMismatch` if `hash` values differ.
 * - `handoff.backingMismatch` if `bytesTotal` differ.
 */
export function verifyHandoff<S extends SpecInput>(
  localPlan: Plan<S>,
  remotePlan: Plan<S>,
): void {
  if (localPlan.hash !== remotePlan.hash) {
    throw createError("handoff.specHashMismatch", "Spec hash mismatch", {
      where: "handoff.verifyHandoff",
      expectedHash: localPlan.hash,
      receivedHash: remotePlan.hash,
      localHash: localPlan.hash,
      remoteHash: remotePlan.hash,
      diff: computeHashDiff(localPlan.hash, remotePlan.hash),
    });
  }

  if (localPlan.bytesTotal !== remotePlan.bytesTotal) {
    throw createError(
      "handoff.backingMismatch",
      "Backing byteLength mismatch",
      {
        where: "handoff.verifyHandoff",
        expectedBytes: localPlan.bytesTotal,
        receivedBytes: remotePlan.bytesTotal,
        local: localPlan.bytesTotal,
        remote: remotePlan.bytesTotal,
      },
    );
  }
}

/**
 * Compute a small diff string between two hash values.
 *
 * @remarks
 * Diagnostics-only, used in `verifyHandoff` payloads.
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
    return "no-diff";
  }

  return `first-diff@${String(firstDiff)}`;
}
