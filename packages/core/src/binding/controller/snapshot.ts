/**
 * @fileoverview
 * Snapshot utilities for controller bindings.
 *
 * @remarks
 * - Implements zero-copy `into` pattern for efficient param/meter reads.
 * - Handles type-safe conversion from raw memory to public JS values.
 * - Provides both full and partial snapshot capabilities.
 */

import { createError } from "../../errors/error";
import { paramArrayView } from "../common/array-views";
import {
  copyMeterArray,
  copyParamArray,
  readMeterScalar,
  readParamScalar,
} from "../common/snapshot-util";
import {
  assertMeterInto,
  assertParamInto,
  type MeterPlane,
  type ParamPlane,
  throwUnknownKey,
} from "../common/validate";

import type { MeterPlaneViews, ParamPlaneViews } from "../../backing/map-views";
import type { ParamDef, SpecInput } from "../../spec/types";
import type { ParamArray } from "../common/array-views";
import type { ControllerMeters, ControllerParams } from "../common/types";

type SnapshotParamSlot = Readonly<{
  kind?: string;
  plane: ParamPlane;
  index: number;
  length: number;
  bytesPerElement: number;
}>;

type SnapshotMeterSlot = Readonly<{
  kind?: string;
  plane: MeterPlane;
  index: number;
  length: number;
  bytesPerElement: number;
}>;

function paramsSnapshotRaw(
  defs: Readonly<Record<string, ParamDef>>,
  slots: Record<string, SnapshotParamSlot>,
  views: ParamPlaneViews,
  knownParamKeys: readonly string[],
  options?: {
    readonly keys: readonly string[];
    readonly into?: Record<string, ParamArray>;
  },
): Record<string, number | boolean | string | ParamArray> {
  const keysList = options ? options.keys : knownParamKeys;

  if (options) {
    for (const k of options.keys) {
      if (!(k in slots)) {
        throwUnknownKey("params", k, knownParamKeys);
      }
    }
  }

  const into = options?.into;
  const out: Record<string, number | boolean | string | ParamArray> = {};

  for (const key of keysList) {
    const slot = slots[key];
    if (!slot) {
      throw createError(
        "internal.assertionFailed",
        "Param snapshot slot missing",
        {
          where: key,
        },
      );
    }

    const start = slot.index;

    if (slot.length > 1) {
      const dst = into?.[key];
      const src = paramArrayView(views, slot);

      if (dst) {
        assertParamInto(key, slot, dst);
        dst.set(src as ArrayLike<number>);
        out[key] = dst;
      } else {
        out[key] = copyParamArray(src);
      }
    } else {
      // Scalar value: number / boolean / enum label.
      out[key] = readParamScalar(slot.plane, views, defs, key, start);
    }
  }

  return out;
}

export function createParamSnapshot<S extends SpecInput>(
  defs: Readonly<Record<string, ParamDef>>,
  slots: Record<string, SnapshotParamSlot>,
  views: ParamPlaneViews,
): ControllerParams<S>["snapshot"] {
  const allParamKeys = Object.keys(slots);

  return ((options?: {
    readonly keys?: readonly string[];
    readonly into?: Record<string, ParamArray>;
  }) => {
    if (!options) {
      return paramsSnapshotRaw(defs, slots, views, allParamKeys);
    }

    if (options.keys && options.keys.length > 0) {
      const base = { keys: options.keys };
      return options.into
        ? paramsSnapshotRaw(defs, slots, views, allParamKeys, {
            ...base,
            into: options.into,
          })
        : paramsSnapshotRaw(defs, slots, views, allParamKeys, base);
    }

    const base = { keys: allParamKeys as readonly string[] };
    return options.into
      ? paramsSnapshotRaw(defs, slots, views, allParamKeys, {
          ...base,
          into: options.into,
        })
      : paramsSnapshotRaw(defs, slots, views, allParamKeys, base);
  }) as ControllerParams<S>["snapshot"];
}

function metersSnapshotRaw(
  slots: Record<string, SnapshotMeterSlot>,
  views: MeterPlaneViews,
  knownMeterKeys: readonly string[],
  options?: {
    readonly keys: readonly string[];
    readonly into?: Record<string, Float32Array | Float64Array | Uint32Array>;
  },
): Record<
  string,
  number | boolean | Float32Array | Float64Array | Uint32Array
> {
  const keysList = options ? options.keys : knownMeterKeys;

  if (options) {
    for (const k of options.keys) {
      if (!(k in slots)) {
        throwUnknownKey("meters", k, knownMeterKeys);
      }
    }
  }

  const into = options?.into;
  const out: Record<
    string,
    number | boolean | Float32Array | Float64Array | Uint32Array
  > = {};

  for (const key of keysList) {
    const slot = slots[key];
    if (!slot) {
      throw createError(
        "internal.assertionFailed",
        "Meter snapshot slot missing",
        {
          where: key,
        },
      );
    }

    const start = slot.index;

    if (slot.length > 1) {
      const end = start + slot.length;
      const dst = into?.[key];

      if (dst) {
        assertMeterInto(key, slot.plane, dst, slot.length);
        if (slot.plane === "MF32") {
          dst.set(views.MF32.subarray(start, end));
        } else if (slot.plane === "MF64") {
          dst.set(views.MF64.subarray(start, end));
        } else {
          dst.set(views.MU32.subarray(start, end));
        }
        out[key] = dst;
      } else {
        if (slot.plane === "MF32") {
          out[key] = copyMeterArray(views.MF32.subarray(start, end));
        } else if (slot.plane === "MF64") {
          out[key] = copyMeterArray(views.MF64.subarray(start, end));
        } else {
          out[key] = copyMeterArray(views.MU32.subarray(start, end));
        }
      }
    } else {
      out[key] = readMeterScalar(slot.plane, views, key, start, slot.kind);
    }
  }

  return out;
}

export function createMeterSnapshot<S extends SpecInput>(
  slots: Record<string, SnapshotMeterSlot>,
  views: MeterPlaneViews,
): ControllerMeters<S>["snapshot"] {
  const allMeterKeys = Object.keys(slots);

  return ((...args: readonly unknown[]) => {
    if (args.length === 0) {
      return metersSnapshotRaw(slots, views, allMeterKeys);
    }

    if (Array.isArray(args[0])) {
      const keys = args[0] as readonly string[];
      const maybeOptions = (args.length > 1 ? args[1] : undefined) as
        | {
            readonly into?: Record<
              string,
              Float32Array | Float64Array | Uint32Array
            >;
          }
        | undefined;
      return maybeOptions?.into
        ? metersSnapshotRaw(slots, views, allMeterKeys, {
            keys,
            into: maybeOptions.into,
          })
        : metersSnapshotRaw(slots, views, allMeterKeys, { keys });
    }

    const allStrings = args.every((x) => typeof x === "string");
    if (allStrings) {
      return metersSnapshotRaw(slots, views, allMeterKeys, {
        keys: args,
      });
    }

    if (typeof args[0] === "object" && args[0] !== null) {
      const object = args[0] as {
        readonly keys?: readonly string[];
        readonly into?: Record<
          string,
          Float32Array | Float64Array | Uint32Array
        >;
      };
      if (Array.isArray(object.keys)) {
        const base = { keys: object.keys as readonly string[] };
        return object.into
          ? metersSnapshotRaw(slots, views, allMeterKeys, {
              ...base,
              into: object.into,
            })
          : metersSnapshotRaw(slots, views, allMeterKeys, base);
      }
      if (object.into) {
        return metersSnapshotRaw(slots, views, allMeterKeys, {
          keys: allMeterKeys as readonly string[],
          into: object.into,
        });
      }
      return metersSnapshotRaw(slots, views, allMeterKeys);
    }

    return metersSnapshotRaw(slots, views, allMeterKeys);
  }) as ControllerMeters<S>["snapshot"];
}
