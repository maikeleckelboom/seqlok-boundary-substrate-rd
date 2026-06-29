import { observerImpl } from "./impl";
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
import type { ParamDef, SpecInput } from "../../spec/types";
import type { ObserverBinding, ObserverOptions } from "../common/types";

const EMPTY_PARAM_DEFS: Readonly<Record<string, ParamDef>> = {};

export function bindObserver<const S extends SpecInput>(
  source: Handoff<S> | AcceptedHandoff<S> | SharedContext<S>,
  options?: ObserverOptions,
): ObserverBinding<S>;

export function bindObserver<const S extends SpecInput>(
  spec: S,
  plan: Plan<S>,
  backing: Backing,
  options?: ObserverOptions,
): ObserverBinding<S>;

export function bindObserver<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ObserverOptions | Plan<S>,
  arg3?: Backing,
  arg4?: ObserverOptions,
): ObserverBinding<S> {
  const { plan, backing, defs } = normalizeSource(arg1, arg2, arg3);
  const options = getOptions(arg1, arg2, arg4);
  return observerImpl(plan, backing, defs, options);
}

function normalizeSource<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ObserverOptions | Plan<S>,
  arg3?: Backing,
): {
  readonly plan: Plan<S>;
  readonly backing: Backing;
  readonly defs: Readonly<Record<string, ParamDef>>;
} {
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
      defs: arg1.spec.params ?? EMPTY_PARAM_DEFS,
    };
  }

  const spec = arg1;
  const plan = arg2 as Plan<S> | undefined;

  if (plan === undefined) {
    throwInvalidBindingArgs("bindObserver", "missingPlan");
  }

  if (arg3 === undefined) {
    throwInvalidBindingArgs("bindObserver", "missingBacking");
  }

  return {
    plan,
    backing: arg3,
    defs: spec.params ?? EMPTY_PARAM_DEFS,
  };
}

function normalizeFromAccepted<const S extends SpecInput>(
  accepted: AcceptedHandoff<S>,
): {
  readonly plan: Plan<S>;
  readonly backing: Backing;
  readonly defs: Readonly<Record<string, ParamDef>>;
} {
  return {
    plan: accepted.plan,
    backing: backingFromAccepted(accepted),
    defs: EMPTY_PARAM_DEFS,
  };
}

function getOptions<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | SharedContext<S> | S,
  arg2?: ObserverOptions | Plan<S>,
  arg4?: ObserverOptions,
): ObserverOptions | undefined {
  if (
    isHandoff<S>(arg1) ||
    isAcceptedHandoff<S>(arg1) ||
    isSharedContext<S>(arg1)
  ) {
    return arg2 as ObserverOptions | undefined;
  }

  return arg4;
}
