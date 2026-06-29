import { createError } from "../errors/error";

import type { SpecNamespace } from "./types";

type SpecPlane = "params" | "meters";
type AuthoredPath = readonly string[];

interface PlaneCompileState<TLeaf> {
  readonly plane: SpecPlane;
  readonly leafDefsByCanonicalKey: Map<string, TLeaf>;
  readonly leafSourcePathsByCanonicalKey: Map<string, string[]>;
  readonly namespaceSourcePathsByCanonicalKey: Map<string, string[]>;
}

interface CompiledPlane<TLeaf> {
  readonly byCanonicalKey: Record<string, TLeaf>;
}

function canonicalKeyFromPath(path: AuthoredPath): string {
  return path.join(".");
}

function clonePath(path: AuthoredPath): string[] {
  return [...path];
}

function toSortedRecord<T>(input: Map<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of [...input.keys()].sort()) {
    const value = input.get(key);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function failConflict(
  plane: SpecPlane,
  canonicalKey: string,
  detail: string,
): never {
  throw createError("spec.duplicateKey", "Spec namespace key conflict", {
    section: plane,
    key: canonicalKey,
    detail,
  });
}

function registerNamespaceNode<TLeaf>(
  state: PlaneCompileState<TLeaf>,
  canonicalPath: string,
  sourcePath: AuthoredPath,
): void {
  if (canonicalPath.length === 0) {
    return;
  }

  const existingLeafPath =
    state.leafSourcePathsByCanonicalKey.get(canonicalPath);
  if (existingLeafPath !== undefined) {
    failConflict(
      state.plane,
      canonicalPath,
      `namespace ${clonePath(sourcePath).join(".")} collides with leaf ${existingLeafPath.join(".")}`,
    );
  }

  if (!state.namespaceSourcePathsByCanonicalKey.has(canonicalPath)) {
    state.namespaceSourcePathsByCanonicalKey.set(
      canonicalPath,
      clonePath(sourcePath),
    );
  }
}

function assertNoLeafAncestorConflict<TLeaf>(
  state: PlaneCompileState<TLeaf>,
  canonicalKey: string,
  sourcePath: AuthoredPath,
): void {
  const segments = canonicalKey.split(".");
  for (let index = 1; index < segments.length; index += 1) {
    const ancestorKey = segments.slice(0, index).join(".");
    const existingLeafPath =
      state.leafSourcePathsByCanonicalKey.get(ancestorKey);
    if (existingLeafPath !== undefined) {
      failConflict(
        state.plane,
        ancestorKey,
        `leaf ${existingLeafPath.join(".")} blocks descendant ${clonePath(sourcePath).join(".")}`,
      );
    }
  }
}

function registerLeafNode<TLeaf>(
  state: PlaneCompileState<TLeaf>,
  canonicalKey: string,
  sourcePath: AuthoredPath,
  normalizedLeafDef: TLeaf,
): void {
  const existingLeafPath =
    state.leafSourcePathsByCanonicalKey.get(canonicalKey);
  if (existingLeafPath !== undefined) {
    failConflict(
      state.plane,
      canonicalKey,
      `duplicate leaves ${existingLeafPath.join(".")} and ${clonePath(sourcePath).join(".")}`,
    );
  }

  const existingNamespacePath =
    state.namespaceSourcePathsByCanonicalKey.get(canonicalKey);
  if (existingNamespacePath !== undefined) {
    failConflict(
      state.plane,
      canonicalKey,
      `leaf ${clonePath(sourcePath).join(".")} collides with namespace ${existingNamespacePath.join(".")}`,
    );
  }

  assertNoLeafAncestorConflict(state, canonicalKey, sourcePath);
  state.leafDefsByCanonicalKey.set(canonicalKey, normalizedLeafDef);
  state.leafSourcePathsByCanonicalKey.set(canonicalKey, clonePath(sourcePath));
}

export function isNamespaceObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLeafDef(value: unknown): value is { kind: string } {
  return isNamespaceObject(value) && typeof value.kind === "string";
}

function visitNamespaceNode<TLeaf>(
  state: PlaneCompileState<TLeaf>,
  path: string[],
  namespaceNode: SpecNamespace<TLeaf>,
  isLeaf: (value: unknown) => value is TLeaf,
  normalizeLeafDef: (key: string, leaf: TLeaf) => TLeaf,
): void {
  for (const [segment, child] of Object.entries(namespaceNode)) {
    const childPath = [...path, segment];
    const canonicalPath = canonicalKeyFromPath(childPath);
    if (!isNamespaceObject(child)) {
      throw createError("spec.builderInvalid", "Spec namespace entry invalid", {
        key: `${state.plane}.${canonicalPath}`,
        reason: "invalidKind",
      });
    }

    if (isLeaf(child)) {
      registerLeafNode(
        state,
        canonicalPath,
        childPath,
        normalizeLeafDef(canonicalPath, child),
      );
      continue;
    }

    registerNamespaceNode(state, canonicalPath, childPath);
    visitNamespaceNode(state, childPath, child, isLeaf, normalizeLeafDef);
  }
}

export function compilePlane<TLeaf>(
  plane: SpecPlane,
  root: SpecNamespace<TLeaf> | undefined,
  isLeaf: (value: unknown) => value is TLeaf,
  normalizeLeafDef: (key: string, leaf: TLeaf) => TLeaf,
): CompiledPlane<TLeaf> {
  const state: PlaneCompileState<TLeaf> = {
    plane,
    leafDefsByCanonicalKey: new Map<string, TLeaf>(),
    leafSourcePathsByCanonicalKey: new Map<string, string[]>(),
    namespaceSourcePathsByCanonicalKey: new Map<string, string[]>(),
  };

  if (root !== undefined) {
    visitNamespaceNode(state, [], root, isLeaf, normalizeLeafDef);
  }

  return {
    byCanonicalKey: toSortedRecord(state.leafDefsByCanonicalKey),
  };
}
