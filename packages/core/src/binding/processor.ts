/**
 * @fileoverview Processor binding (v2.0 - simplified overloads)
 *
 * BREAKING CHANGES from v1.x:
 * - Removed `bindProcessor(spec, received)` overload (redundant)
 * - Only two overloads remain:
 *   1. `bindProcessor(received)` - spec-free (golden path)
 *   2. `bindProcessor(spec, backing)` - with spec (dev convenience)
 */

import { processorImpl } from './processor.impl';
import { createError } from '../errors';
import { planLayout } from '../plan/layout';

import type { ProcessorBinding, ProcessorOptions } from './types';
import type { Backing, SharedBacking } from '../backing/types';
import type { ReceivedHandoff } from '../handoff/types';
import type { SpecInput } from '../spec/types';

function hasReceivedShape(x: unknown): x is { sab: unknown; plan: unknown } {
  return typeof x === 'object' && x !== null && 'sab' in x && 'plan' in x;
}

/**
 * Public processor binding (spec-free golden path).
 *
 * Use this overload in production workers/worklets where the spec is NOT available.
 * The `received.plan` contains all necessary layout information.
 *
 * @template S - Spec type (inferred from ReceivedHandoff<S>)
 * @param received - Validated handoff from receiveHandoff()
 * @param options - Optional processor configuration
 * @returns Typed processor binding
 *
 * @example
 * ```ts
 * // Worker side (spec-free):
 * import { receiveHandoff, bindProcessor } from '@seqlok/core';
 * import type { MySpec } from './spec';  // type-only import
 *
 * type InitMsg = { handoff: Handoff<MySpec> };
 *
 * self.onmessage = (ev: MessageEvent<InitMsg>) => {
 *   const received = receiveHandoff(ev.data.handoff);
 *   //    ^? ReceivedHandoff<MySpec>
 *
 *   const proc = bindProcessor(received);
 *   //    ^? ProcessorBinding<MySpec> ✓
 * };
 * ```
 */
export function bindProcessor<const S extends SpecInput>(
  received: ReceivedHandoff<S>,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

/**
 * Public processor binding (with spec - development convenience).
 *
 * Use this overload in tests or when you have direct access to the spec.
 * Internally calls `planLayout(spec)` - slightly slower than spec-free path.
 *
 * @template S - Spec type (inferred from spec)
 * @param spec - Spec definition from defineSpec()
 * @param backing - Memory backing
 * @param options - Optional processor configuration
 * @returns Typed processor binding
 *
 * @example
 * ```ts
 * // Test environment (with spec):
 * import { defineSpec, allocateShared, bindProcessor, planLayout } from '@seqlok/core';
 *
 * const spec = defineSpec(...);
 * const plan = planLayout(spec);
 * const backing = allocateShared(plan);
 *
 * const proc = bindProcessor(spec, backing);
 * //    ^? ProcessorBinding<typeof spec>
 * ```
 */
export function bindProcessor<const S extends SpecInput>(
  spec: S,
  backing: Backing,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

export function bindProcessor<const S extends SpecInput>(
  specOrReceived: S | ReceivedHandoff<S>,
  backingOrOptions?: Backing | ProcessorOptions,
  maybeOptions?: ProcessorOptions,
): ProcessorBinding<S> {
  // Path 1: spec-free — ReceivedHandoff<S> (golden path)
  if (hasReceivedShape(specOrReceived)) {
    const received = specOrReceived;
    const options = (backingOrOptions as ProcessorOptions | undefined) ?? {};

    // Note: verifyHandoff now takes two plans directly
    // If you want to verify against a local plan, you'd do:
    // verifyHandoff(localPlan, received.plan);
    // For spec-free path, we just trust the received plan

    const backing: SharedBacking = { kind: 'shared', sab: received.sab };
    return processorImpl(received.plan, backing, options);
  }

  // Path 2: with spec — (spec, backing)
  const plan = planLayout(specOrReceived);

  if (
    backingOrOptions &&
    typeof backingOrOptions === 'object' &&
    'kind' in backingOrOptions
  ) {
    const backing = backingOrOptions;
    const options = maybeOptions ?? {};
    return processorImpl(plan, backing, options);
  }

  throw createError('internal.assertionFailed', 'bindProcessor: invalid arguments', {
    where: 'binding.bindProcessor',
    detail: 'expected (received, options?) | (spec, backing, options?)',
  });
}
