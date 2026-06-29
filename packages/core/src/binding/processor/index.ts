import { processorImpl } from "./impl";
import { isSharedContext } from "../../context/guard";
import { acceptHandoff } from "../../handoff/handoff";
import { throwInvalidBindingArgs } from "../common/arg-errors";
import {
  backingFromAccepted,
  isAcceptedHandoff,
  isHandoff,
} from "../common/handoff-source";

import type { Backing } from "../../backing/types";
import type { SharedContext } from "../../context/types";
import type { Handoff, AcceptedHandoff } from "../../handoff/types";
import type { Plan } from "../../plan/types";
import type { SpecInput } from "../../spec/types";
import type { ProcessorBinding, ProcessorOptions } from "../common/types";

interface NormalizedProcessorSource<S extends SpecInput> {
  readonly plan: Plan<S>;
  readonly backing: Backing;
}

export function bindProcessor<const S extends SpecInput>(
  source: Handoff<S> | AcceptedHandoff<S> | SharedContext<S>,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

export function bindProcessor<const S extends SpecInput>(
  spec: S,
  plan: Plan<S>,
  backing: Backing,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

export function bindProcessor<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ProcessorOptions | Plan<S>,
  arg3?: Backing,
  arg4?: ProcessorOptions,
): ProcessorBinding<S> {
  const { plan, backing } = normalizeSource(arg1, arg2, arg3);
  const options = getOptions(arg1, arg2, arg4) ?? {};
  return processorImpl(plan, backing, options);
}

function normalizeSource<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ProcessorOptions | Plan<S>,
  arg3?: Backing,
): NormalizedProcessorSource<S> {
  if (isHandoff<S>(arg1)) {
    return normalizeFromAccepted(acceptHandoff(arg1));
  }

  if (isAcceptedHandoff<S>(arg1)) {
    return normalizeFromAccepted(arg1);
  }

  if (isSharedContext<S>(arg1)) {
    return {
      plan: arg1.plan,
      backing: arg1.backing,
    };
  }

  const plan = arg2 as Plan<S> | undefined;
  if (plan === undefined) {
    throwInvalidBindingArgs("bindProcessor", "missingPlan");
  }

  if (arg3 === undefined) {
    throwInvalidBindingArgs("bindProcessor", "missingBacking");
  }

  return {
    plan,
    backing: arg3,
  };
}

function normalizeFromAccepted<const S extends SpecInput>(
  accepted: AcceptedHandoff<S>,
): NormalizedProcessorSource<S> {
  return {
    plan: accepted.plan,
    backing: backingFromAccepted(accepted),
  };
}

function getOptions<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ProcessorOptions | Plan<S>,
  arg4?: ProcessorOptions,
): ProcessorOptions | undefined {
  if (
    isHandoff<S>(arg1) ||
    isAcceptedHandoff<S>(arg1) ||
    isSharedContext<S>(arg1)
  ) {
    return arg2 as ProcessorOptions | undefined;
  }

  return arg4;
}
