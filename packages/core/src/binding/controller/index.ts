// // packages/core/src/binding/controller/index.ts
//
// /**
//  * @fileoverview
//  * Public controller binding factories.
//  *
//  * @remarks
//  * - `bindControllerWithPlan` is the canonical, plan-aware entry point that
//  *   matches the explicit golden flow.
//  * - `bindController` is a convenience wrapper that re-derives the layout
//  *   from the provided `spec` and expects the `backing` to have been
//  *   allocated from that same layout.
//  */
//
// import { controllerImpl } from './impl';
// import { planLayout } from '../../plan/layout';
//
// import type { Backing } from '../../backing/types';
// import type { Plan } from '../../plan/types';
// import type { ParamDef, SpecInput } from '../../spec/types';
// import type { ControllerBinding, ControllerOptions } from '../common/types';
//
// /**
//  * Bind a controller to a backing using an explicit Plan.
//  *
//  * @typeParam S - Spec type (inferred from `spec`)
//  *
//  * @param spec - Spec definition created by `defineSpec(...)`.
//  * @param plan - Layout plan produced by {@link planLayout} for this spec.
//  * @param backing - Memory backing allocated from the same plan.
//  * @param options - Optional controller configuration.
//  *
//  * @returns A typed controller binding for the given spec/plan/backing triple.
//  *
//  * @remarks
//  * - This matches the explicit golden flow:
//  *
//  *   `defineSpec → planLayout → allocateShared → buildHandoff →
//  *    receiveHandoff → bindControllerWithPlan / bindProcessor`
//  *
//  * - Use this when you already have `Plan<S>` and want explicit control
//  *   over planning and allocation (e.g. polyglot hosts, plan reuse,
//  *   diagnostics).
//  */
// function bindControllerWithPlan<const S extends SpecInput>(
//   spec: S,
//   plan: Plan<S>,
//   backing: Backing,
//   options: ControllerOptions = {},
// ): ControllerBinding<S> {
//   const defs: Readonly<Record<string, ParamDef>> = spec.params ?? {};
//   return controllerImpl(plan, backing, defs, options);
// }
//
// /**
//  * Convenience controller binding for a spec/backing pair.
//  *
//  * @typeParam S - Spec type (inferred from `spec`)
//  *
//  * @param spec - Spec definition created by `defineSpec(...)`.
//  * @param backing - Memory backing that was allocated for this spec's layout
//  *   (for example, via `allocateShared(planLayout(spec))`).
//  * @param options - Optional controller configuration.
//  *
//  * @returns A typed controller binding for the given spec/backing pair.
//  *
//  * @remarks
//  * - This is a convenience wrapper over {@link bindControllerWithPlan}:
//  *
//  *   ```ts
//  *   const plan = planLayout(spec);
//  *   const controller = bindControllerWithPlan(spec, plan, backing, options);
//  *   ```
//  *
//  * - It re-derives the layout from `spec` using {@link planLayout} and
//  *   assumes that `backing` was allocated from the same plan. Passing a
//  *   backing derived from a different spec/plan is a contract violation.
//  *
//  * - For protocol-aware code paths that already thread `Plan<S>` explicitly,
//  *   prefer {@link bindControllerWithPlan} so the golden flow remains fully
//  *   explicit:
//  *
//  *   `defineSpec → planLayout → allocateShared → buildHandoff →
//  *    receiveHandoff → bindControllerWithPlan / bindProcessor`.
//  */
// export function bindController<const S extends SpecInput>(
//   spec: S,
//   backing: Backing,
//   options: ControllerOptions = {},
// ): ControllerBinding<S> {
//   const plan = planLayout(spec);
//   return bindControllerWithPlan(spec, plan, backing, options);
// }
// File: packages/core/src/binding/controller/index.ts

/**
 * @fileoverview
 * Public controller binding factory.
 *
 * @remarks
 * - Bridges `defineSpec` + Plan + Backing into a typed `ControllerBinding`.
 * - Matches the explicit golden flow:
 *
 *   defineSpec → planLayout → allocateShared → buildHandoff →
 *   receiveHandoff → bindController / bindProcessor
 *
 * - The binding layer does not perform planning; callers are responsible
 *   for computing the Plan via `planLayout(spec)` and allocating a Backing
 *   from that Plan.
 */

import { controllerImpl } from './impl';

import type { Backing } from '../../backing/types';
import type { Plan } from '../../plan/types';
import type { ParamDef, SpecInput } from '../../spec/types';
import type { ControllerBinding, ControllerOptions } from '../common/types';

/**
 * Bind a controller to a backing using an explicit Plan.
 *
 * @typeParam S - Spec type (inferred from `spec`)
 *
 * @param spec - Spec definition created by `defineSpec(...)`.
 * @param plan - Layout plan produced by `planLayout(spec)` for this spec.
 * @param backing - Memory backing allocated from the same plan.
 * @param options - Optional controller configuration.
 *
 * @returns A typed controller binding for the given spec/plan/backing triple.
 *
 * @remarks
 * - This is the canonical controller API in `@seqlok/core`.
 * - The caller is responsible for:
 *   - Computing the plan once via `planLayout(spec)`.
 *   - Allocating a compatible backing via `allocateShared(plan)` (or a
 *     different backing factory that consumes `Plan<S>`).
 *   - Passing the same `spec`/`plan`/`backing` triple here.
 * - The binding layer does not re-derive layouts; mismatched
 *   spec/plan/backing triples are a contract violation.
 */
export function bindController<const S extends SpecInput>(
  spec: S,
  plan: Plan<S>,
  backing: Backing,
  options: ControllerOptions = {},
): ControllerBinding<S> {
  const defs: Readonly<Record<string, ParamDef>> = spec.params ?? {};
  return controllerImpl(plan, backing, defs, options);
}
