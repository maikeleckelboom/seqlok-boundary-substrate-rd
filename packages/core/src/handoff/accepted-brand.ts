const ACCEPTED_HANDOFF_RUNTIME_BRAND: unique symbol = Symbol(
  "exclave.boundary.acceptedHandoff",
);

interface AcceptedHandoffRuntimeBrand {
  readonly [ACCEPTED_HANDOFF_RUNTIME_BRAND]: true;
}

export function brandAcceptedHandoffRuntime<T extends object>(value: T): T {
  Object.defineProperty(value, ACCEPTED_HANDOFF_RUNTIME_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return value;
}

export function hasAcceptedHandoffRuntimeBrand(
  value: unknown,
): value is AcceptedHandoffRuntimeBrand {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<AcceptedHandoffRuntimeBrand>)[
      ACCEPTED_HANDOFF_RUNTIME_BRAND
    ] === true
  );
}
