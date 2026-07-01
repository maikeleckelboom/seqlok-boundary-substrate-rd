/**
 * @fileoverview
 * Public controller binding factory.
 *
 * @remarks
 * - Bridges `defineSpec` + Plan + Backing into a typed `ControllerBinding`.
 * - Matches the explicit golden flow:
 *
 *   defineSpec -> planLayout -> allocatePacked -> bindController
 *
 * - The binding layer does not perform planning; callers are responsible
 *   for computing the Plan via `planLayout(spec)` and allocating a Backing
 *   from that Plan.
 */

import { controllerImpl } from "./impl";
import { throwInvalidBindingArgs } from "../common/arg-errors";

import type { Backing } from "../../backing/types";
import type { Plan } from "../../plan/types";
import type { SpecInput } from "../../spec/types";
import type { ControllerBinding, ControllerOptions } from "../common/types";

/**
 * Bind a controller to a backing using an explicit Plan.
 *
 * @typeParam S - Spec type (inferred from `spec`)
 *
 * @param spec - Authored spec used for param validation and enum decoding.
 * @param plan - Planned memory layout for the spec.
 * @param backing - Allocated backing compatible with the plan.
 * @param options - Optional controller configuration.
 *
 * @returns A typed controller binding for the given spec/plan/backing triple.
 *
 * @remarks
 * - This is the canonical controller API in `@exclave/boundary`.
 * - The caller is responsible for:
 *   - Computing the plan once via `planLayout(spec)`.
 *   - Allocating a compatible backing via `allocatePacked(plan)` (or a
 *     different backing factory that consumes `Plan<S>`).
 *   - Passing the same `spec`/`plan`/`backing` triple here.
 * - The binding layer does not re-derive layouts; mismatched
 *   spec/plan/backing triples are a contract violation.
 */
export function bindController<const S extends SpecInput>(
  spec: S,
  plan: Plan<S>,
  backing: Backing,
  options?: ControllerOptions,
): ControllerBinding<S>;

export function bindController<const S extends SpecInput>(
  spec: S,
  plan?: Plan<S>,
  backing?: Backing,
  options?: ControllerOptions,
): ControllerBinding<S> {
  if (plan === undefined) {
    throwInvalidBindingArgs("bindController", "missingPlan");
  }
  if (backing === undefined) {
    throwInvalidBindingArgs("bindController", "missingBacking");
  }
  const params = spec.params ?? {};

  return controllerImpl(plan, backing, params, options);
}
