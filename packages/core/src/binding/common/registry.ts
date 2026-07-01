/**
 * @fileoverview
 * Internal binding registry for tracking controller/processor/observer
 * lifetimes per backing.
 *
 * @remarks
 * - Records which roles are currently attached to a given `Backing`.
 * - Provides a simple exclusivity guard for roles that should be unique.
 * - Used by bindings to prevent inconsistent or conflicting attachment patterns.
 * - Not part of the public API surface.
 *
 * @internal
 */

import { invariant } from "../../errors/invariant";

import type { Backing } from "../../backing/types";
import type { PlaneKey } from "../../primitives/planes";

/**
 * Supported binding roles.
 *
 * - `controller`: param writer + meter reader (owner).
 * - `processor`: param reader + meter writer (primary consumer).
 * - `observer`: param reader + meter reader (secondary consumer).
 */
export type BindRole = "controller" | "processor" | "observer";

interface BindSlots {
  controller?: true | undefined;
  processor?: true | undefined;
  observer?: true | undefined;
}

interface BindingStateView {
  readonly roles: {
    readonly controller: boolean;
    readonly processor: boolean;
    readonly observer: boolean;
  };
}

/**
 * Tracks which roles are currently bound to a given backing.
 *
 * Registry is per-module; tests can reset it via clearBindingRegistry().
 */
let BOUND = new WeakMap<object, BindSlots>();

function identityForBacking(backing: Backing): object {
  switch (backing.kind) {
    case "packed":
      return backing.sab;
    case "wasm":
      return backing.memory;
    case "partitioned": {
      const planes: Readonly<Partial<Record<PlaneKey, SharedArrayBuffer>>> =
        backing.planes;
      const identity = planes.PU ?? planes.MU;
      invariant(
        identity !== undefined,
        "internal.assertionFailed",
        "Partitioned backing registry identity missing",
        { where: "binding.registry", detail: "partitioned.PU" },
      );
      return identity;
    }
  }
}

export function clearBindingRegistry(): void {
  BOUND = new WeakMap();
}

/**
 * Register a non-exclusive binding for a role.
 *
 * @remarks
 * Intended for roles that may legitimately have multiple bindings in a
 * process (e.g. multiple processors or observers). Call sites that require
 * exclusivity should use claimBinding() instead.
 */
export function noteBinding(backing: Backing, role: BindRole): void {
  const identity = identityForBacking(backing);
  const current = BOUND.get(identity);
  if (!current) {
    BOUND.set(identity, { [role]: true });
    return;
  }

  BOUND.set(identity, { ...current, [role]: true });
}

/**
 * Claim an exclusive binding slot for a role on the given backing.
 *
 * @remarks
 * This is typically used for the controller role, where having more than
 * one binding would violate ownership expectations.
 */
export function claimBinding(backing: Backing, role: BindRole): void {
  const identity = identityForBacking(backing);
  const current = BOUND.get(identity);

  invariant(
    !current?.[role],
    "internal.assertionFailed",
    "Exclusive binding already exists for this backing and role",
    { where: `binding.${role}`, detail: "double-bind on backing identity" },
  );

  if (!current) {
    BOUND.set(identity, { [role]: true });
  } else {
    BOUND.set(identity, { ...current, [role]: true });
  }
}

/**
 * Release a binding slot. Once *all* roles are cleared for a backing,
 * the registry entry is removed.
 *
 * Releasing a role that is not currently registered is a no-op.
 */
export function releaseBinding(backing: Backing, role: BindRole): void {
  const identity = identityForBacking(backing);
  const current = BOUND.get(identity);
  if (!current?.[role]) {
    return;
  }

  const next: BindSlots = {
    controller: role === "controller" ? undefined : current.controller,
    processor: role === "processor" ? undefined : current.processor,
    observer: role === "observer" ? undefined : current.observer,
  };

  if (!next.controller && !next.processor && !next.observer) {
    BOUND.delete(identity);
  } else {
    BOUND.set(identity, next);
  }
}

/**
 * Introspection hook for diagnostics and tests.
 *
 * @returns A snapshot of role presence for the given backing, or `undefined`
 * if the backing has no registered roles.
 */
export function getBindingState(
  backing: Backing,
): BindingStateView | undefined {
  const slots = BOUND.get(identityForBacking(backing));
  if (!slots) {
    return undefined;
  }

  return {
    roles: {
      controller: slots.controller === true,
      processor: slots.processor === true,
      observer: slots.observer === true,
    },
  };
}
