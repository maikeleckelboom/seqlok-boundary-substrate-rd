import { processorImpl } from "./impl";
import { acceptHandoff } from "../../handoff/handoff";
import { throwInvalidBindingArgs } from "../common/arg-errors";
import {
  backingFromAccepted,
  isAcceptedHandoff,
  isHandoff,
} from "../common/handoff-source";

import type { Backing } from "../../backing/types";
import type { Handoff, AcceptedHandoff } from "../../handoff/types";
import type { Plan } from "../../plan/types";
import type { SpecInput } from "../../spec/types";
import type { ProcessorBinding, ProcessorOptions } from "../common/types";

interface NormalizedProcessorSource<S extends SpecInput> {
  readonly plan: Plan<S>;
  readonly backing: Backing;
}

export function bindProcessor<const S extends SpecInput>(
  source: Handoff<S> | AcceptedHandoff<S>,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

export function bindProcessor<const S extends SpecInput>(
  plan: Plan<S>,
  backing: Backing,
  options?: ProcessorOptions,
): ProcessorBinding<S>;

export function bindProcessor<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | Plan<S>,
  arg2?: ProcessorOptions | Backing,
  arg3?: ProcessorOptions,
): ProcessorBinding<S> {
  const { plan, backing } = normalizeSource(arg1, arg2);
  const options = getOptions(arg1, arg2, arg3) ?? {};
  return processorImpl(plan, backing, options);
}

function normalizeSource<const S extends SpecInput>(
  arg1: Handoff<S> | AcceptedHandoff<S> | Plan<S>,
  arg2?: ProcessorOptions | Backing,
): NormalizedProcessorSource<S> {
  if (isHandoff<S>(arg1)) {
    return normalizeFromAccepted(acceptHandoff(arg1));
  }

  if (isAcceptedHandoff<S>(arg1)) {
    return normalizeFromAccepted(arg1);
  }

  if (!isBacking(arg2)) {
    throwInvalidBindingArgs("bindProcessor", "missingBacking");
  }

  return {
    plan: arg1,
    backing: arg2,
  };
}

function isBacking(value: unknown): value is Backing {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const kind = (value as { readonly kind?: unknown }).kind;
  return kind === "packed" || kind === "partitioned" || kind === "wasm";
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
  arg1: Handoff<S> | AcceptedHandoff<S> | Plan<S>,
  arg2?: ProcessorOptions | Backing,
  arg3?: ProcessorOptions,
): ProcessorOptions | undefined {
  if (isHandoff<S>(arg1) || isAcceptedHandoff<S>(arg1)) {
    return arg2 as ProcessorOptions | undefined;
  }

  return arg3;
}
