import { createError } from "../../errors/error";

export type BindingFactoryFn =
  | "bindController"
  | "bindObserver"
  | "bindProcessor";

export type BindingInvalidArgsReason = "missingPlan" | "missingBacking";

const SIGNATURES: Record<BindingFactoryFn, string> = {
  bindController: "bindController(spec, plan, backing, options?)",
  bindObserver: "bindObserver(spec, plan, backing, options?)",
  bindProcessor: "bindProcessor(spec, plan, backing, options?)",
};

export function throwInvalidBindingArgs(
  fn: BindingFactoryFn,
  reason: BindingInvalidArgsReason,
): never {
  throw createError(
    "binding.invalidArgs",
    "Invalid binding factory arguments",
    {
      fn,
      reason,
      signature: SIGNATURES[fn],
    },
  );
}
