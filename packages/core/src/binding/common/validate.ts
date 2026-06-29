/**
 * @fileoverview
 * Shared validation and error helpers for binding implementations.
 *
 * @remarks
 * - Provides slot-shape validation for params and meters.
 * - Throws structured `binding.*` errors for unknown keys and bad shapes.
 * - Used by both controller and processor bindings to keep checks consistent.
 *
 * @internal
 */

import { paramArrayCtor } from "./array-views";
import {
  type BindingInvalidValueDetails,
  type BindingParamRangeDetails,
  type BindingSnapshotIntoLengthMismatchDetails,
  type BindingSnapshotIntoTypeMismatchDetails,
  type BindingUnknownKeyDetails,
} from "../../errors/codes/binding";
import { createError } from "../../errors/error";
import { invariant } from "../../errors/invariant";

import type { ParamArray } from "./array-views";
import type { MeterPlaneViews, ParamPlaneViews } from "../../backing/map-views";

export function throwUnknownKey(
  scope: "params" | "meters",
  key: string,
  known: readonly string[],
): never {
  throw createError("binding.unknownKey", `Unknown ${scope} key "${key}"`, {
    scope,
    key,
    known,
  } satisfies BindingUnknownKeyDetails);
}

export function throwParamRange(
  key: string,
  min: number,
  max: number,
  received: number,
): never {
  throw createError("binding.paramRange", `Param "${key}" out of range`, {
    key,
    min,
    max,
    received,
  } satisfies BindingParamRangeDetails);
}

export function throwInvalidParamValue(
  key: string,
  expected?: unknown,
  received?: unknown,
): never {
  throw createError(
    "binding.paramInvalidValue",
    `Param "${key}" has invalid value`,
    {
      key,
      expected,
      received,
    } satisfies BindingInvalidValueDetails,
  );
}

export function throwIntoType(
  key: string,
  expectedType: string,
  receivedType: string,
  expectedLength: number,
  receivedLength: number,
): never {
  throw createError(
    "binding.snapshotIntoTypeMismatch",
    `Into buffer type mismatch for "${key}"`,
    {
      key,
      expectedType:
        expectedType as BindingSnapshotIntoTypeMismatchDetails["expectedType"],
      receivedType,
      expectedLength,
      receivedLength,
    } satisfies BindingSnapshotIntoTypeMismatchDetails,
  );
}

export function throwIntoLength(
  key: string,
  expectedType: string,
  expectedLength: number,
  receivedLength: number,
): never {
  throw createError(
    "binding.snapshotIntoLengthMismatch",
    `Into buffer length mismatch for "${key}"`,
    {
      key,
      expectedType:
        expectedType as BindingSnapshotIntoLengthMismatchDetails["expectedType"],
      receivedType: expectedType,
      expectedLength,
      receivedLength,
    } satisfies BindingSnapshotIntoLengthMismatchDetails,
  );
}

/** @internal Param planes (data) — binding-local union. */
export type ParamPlane = "PF32" | "PI32" | "PB";

/** @internal Meter planes (data) — binding-local union. */
export type MeterPlane = "MF32" | "MF64" | "MU32";

type ParamDst = ParamArray;
type MeterDst = Float32Array | Float64Array | Uint32Array;

/** Constructor shape for typed arrays (length → instance). */
interface TA<T extends ArrayBufferView & { length: number }> {
  readonly name: string;
  new (len: number): T;
}

/**
 * Shared validator for both params/meters "into" targets.
 * - Enforces constructor type (e.g., Float32Array)
 * - Enforces exact length
 */
export function validateIntoBuffer<
  T extends ArrayBufferView & {
    length: number;
  },
>(
  key: string,
  expectedCtor: TA<T>,
  expectedLength: number,
  dst: ArrayBufferView & { length: number },
): void {
  const expectedName = expectedCtor.name;
  const receivedName = (dst.constructor as { name?: string }).name ?? "Unknown";

  // Constructor/type mismatch
  if (!(dst instanceof expectedCtor)) {
    const receivedLen = dst.length;
    throwIntoType(key, expectedName, receivedName, expectedLength, receivedLen);
  }

  // Length mismatch
  if (dst.length !== expectedLength) {
    throwIntoLength(key, expectedName, expectedLength, dst.length);
  }
}

/** into validation (params). */
export function assertParamInto(
  key: string,
  slot: Pick<
    ValidatedParamSlot,
    "kind" | "plane" | "length" | "bytesPerElement" | "index"
  >,
  dst: ParamDst,
): void {
  const expectedCtor = paramArrayCtor(slot);
  const expectedName = expectedCtor.name;
  const receivedName = (dst.constructor as { name?: string }).name ?? "Unknown";

  if (!(dst instanceof expectedCtor)) {
    throwIntoType(key, expectedName, receivedName, slot.length, dst.length);
  }

  if (dst.length !== slot.length) {
    throwIntoLength(key, expectedName, slot.length, dst.length);
  }
}

/** into validation (meters). */
export function assertMeterInto(
  key: string,
  plane: MeterPlane,
  dst: MeterDst,
  expectedLength: number,
): void {
  switch (plane) {
    case "MF32":
      validateIntoBuffer(key, Float32Array, expectedLength, dst);
      return;
    case "MF64":
      validateIntoBuffer(key, Float64Array, expectedLength, dst);
      return;
    case "MU32":
      validateIntoBuffer(key, Uint32Array, expectedLength, dst);
      return;
  }
}

interface SlotBase {
  readonly kind?: string;
  readonly offset: number;
  readonly length: number;
  readonly bytesPerElement: number;
}

/**
 * Raw param slot description from the plan.
 *
 * @internal
 */
export interface ParamSlot extends SlotBase {
  readonly plane: ParamPlane | "PU";
}

/**
 * Raw meter slot description from the plan.
 *
 * @internal
 */
export interface MeterSlot extends SlotBase {
  readonly plane: MeterPlane | "MU";
}

/**
 * Param slot validated against backing capacity and aligned to elements.
 *
 * @remarks
 * - `index` is the element index in the corresponding plane.
 * - `plane` is guaranteed to be a data plane (no PU).
 */
export interface ValidatedParamSlot extends SlotBase {
  readonly plane: ParamPlane;
  readonly index: number;
}

/**
 * Meter slot validated against backing capacity and aligned to elements.
 *
 * @remarks
 * - `index` is the element index in the corresponding plane.
 * - `plane` is guaranteed to be a data plane (no MU).
 */
export interface ValidatedMeterSlot extends SlotBase {
  readonly plane: MeterPlane;
  readonly index: number;
}

function assertSlotWithinPlane(
  kind: "param" | "meter",
  key: string,
  slot: SlotBase,
  planeByteLength: number,
): void {
  const byteEnd = slot.offset + slot.length * slot.bytesPerElement;
  invariant(
    slot.offset >= 0 && byteEnd <= planeByteLength,
    "internal.assertionFailed",
    `${kind} "${key}" range out of bounds`,
    {
      detail: `${kind}:${key}`,
    },
  );
}

/**
 * Validate param slots against the mapped planes and compute element indices.
 *
 * @internal
 */
export function validateParamSlots(
  slots: Record<string, ParamSlot>,
  views: ParamPlaneViews,
): Record<string, ValidatedParamSlot> {
  const validated: Record<string, ValidatedParamSlot> = {};

  const keys = Object.keys(slots);
  for (const key of keys) {
    const slot = slots[key];
    if (!slot) {
      continue;
    }

    if (slot.plane !== "PF32" && slot.plane !== "PI32" && slot.plane !== "PB") {
      continue;
    }

    const index = (slot.offset / slot.bytesPerElement) | 0;
    if (slot.plane === "PF32") {
      assertSlotWithinPlane("param", key, slot, views.PF32.byteLength);
    } else if (slot.plane === "PI32") {
      assertSlotWithinPlane("param", key, slot, views.PI32.byteLength);
    } else {
      assertSlotWithinPlane("param", key, slot, views.PB.byteLength);
    }

    validated[key] = {
      ...(slot.kind !== undefined ? { kind: slot.kind } : {}),
      plane: slot.plane,
      offset: slot.offset,
      length: slot.length,
      bytesPerElement: slot.bytesPerElement,
      index,
    };
  }

  return validated;
}

/**
 * Validate meter slots against the mapped planes and compute element indices.
 *
 * @internal
 */
export function validateMeterSlots(
  slots: Record<string, MeterSlot>,
  views: MeterPlaneViews,
): Record<string, ValidatedMeterSlot> {
  const validated: Record<string, ValidatedMeterSlot> = {};

  const keys = Object.keys(slots);
  for (const key of keys) {
    const slot = slots[key];
    if (!slot) {
      continue;
    }

    if (
      slot.plane !== "MF32" &&
      slot.plane !== "MF64" &&
      slot.plane !== "MU32"
    ) {
      continue;
    }

    const index = (slot.offset / slot.bytesPerElement) | 0;
    if (slot.plane === "MF32") {
      assertSlotWithinPlane("meter", key, slot, views.MF32.byteLength);
    } else if (slot.plane === "MF64") {
      assertSlotWithinPlane("meter", key, slot, views.MF64.byteLength);
    } else {
      assertSlotWithinPlane("meter", key, slot, views.MU32.byteLength);
    }

    validated[key] = {
      ...(slot.kind !== undefined ? { kind: slot.kind } : {}),
      plane: slot.plane,
      offset: slot.offset,
      length: slot.length,
      bytesPerElement: slot.bytesPerElement,
      index,
    };
  }

  return validated;
}
