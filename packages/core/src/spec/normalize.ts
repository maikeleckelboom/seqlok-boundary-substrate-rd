import { validateSpecAst } from "./validate";

import type { MeterDef, ParamDef, SpecAstInput, SpecNamespace } from "./types";

type AuthoredLeaf = ParamDef | MeterDef;

function isLeafDef<T extends AuthoredLeaf>(
  value: T | SpecNamespace<T> | null | undefined,
): value is T {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

function isNamespace<T extends AuthoredLeaf>(
  value: T | SpecNamespace<T> | undefined,
): value is SpecNamespace<T> {
  return value !== undefined && !isLeafDef(value);
}

function cloneLeafDef<T extends AuthoredLeaf>(def: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(def).sort()) {
    const value = (def as Record<string, unknown>)[key];
    sorted[key] = Array.isArray(value) ? Array.from(value) : value;
  }
  return sorted as T;
}

function normalizeNamespace<T extends AuthoredLeaf>(
  namespace: SpecNamespace<T>,
): SpecNamespace<T> {
  const out: Record<string, T | SpecNamespace<T>> = {};

  for (const key of Object.keys(namespace).sort()) {
    const value = namespace[key];
    if (value === undefined) {
      continue;
    }

    if (isLeafDef(value)) {
      out[key] = cloneLeafDef(value);
    } else if (isNamespace(value)) {
      out[key] = normalizeNamespace(value);
    }
  }

  return out as SpecNamespace<T>;
}

export function normalizeSpecAst(ast: SpecAstInput): SpecAstInput {
  validateSpecAst(ast);

  const out: {
    $schema?: string;
    id?: string;
    params?: SpecNamespace<ParamDef>;
    meters?: SpecNamespace<MeterDef>;
  } = {};

  if (ast.$schema !== undefined) {
    out.$schema = ast.$schema;
  }
  if (ast.id !== undefined) {
    out.id = ast.id;
  }
  if (ast.params !== undefined && Object.keys(ast.params).length > 0) {
    out.params = normalizeNamespace(ast.params);
  }
  if (ast.meters !== undefined && Object.keys(ast.meters).length > 0) {
    out.meters = normalizeNamespace(ast.meters);
  }

  return out as SpecAstInput;
}
