import { hasAcceptedHandoffRuntimeBrand } from "../../handoff/accepted-brand";

import type { Backing } from "../../backing/types";
import type { Handoff, AcceptedHandoff } from "../../handoff/types";
import type { SpecInput } from "../../spec/types";

export function isHandoff<S extends SpecInput>(
  value: unknown,
): value is Handoff<S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "packing" in value &&
    "plan" in value
  );
}

export function isAcceptedHandoff<S extends SpecInput>(
  value: unknown,
): value is AcceptedHandoff<S> {
  return (
    hasAcceptedHandoffRuntimeBrand(value) &&
    "packing" in value &&
    "plan" in value &&
    !("version" in value)
  );
}

export function backingFromAccepted<S extends SpecInput>(
  accepted: AcceptedHandoff<S>,
): Backing {
  if (accepted.packing === "packed") {
    return {
      kind: "packed",
      sab: accepted.sab,
    };
  }

  return {
    kind: "partitioned",
    planes: accepted.planes,
  };
}
