import type { MeterPlane, ParamPlane } from "./validate";
import type { MeterPlaneViews, ParamPlaneViews } from "../../backing/map-views";

export type ParamArray =
  | Float32Array
  | Int32Array
  | Uint32Array
  | Uint8Array
  | Int8Array
  | Int16Array
  | Uint16Array;

export type MeterArray = Float32Array | Float64Array | Uint32Array;
export type MeterArrayValue =
  | Float32Array
  | Float64Array
  | Uint32Array
  | Uint8Array;

export interface ParamArraySlot {
  readonly kind?: string;
  readonly plane: ParamPlane;
  readonly index: number;
  readonly length: number;
  readonly bytesPerElement: number;
}

export interface MeterArraySlot {
  readonly kind?: string;
  readonly plane: MeterPlane;
  readonly index: number;
  readonly length: number;
  readonly bytesPerElement: number;
}

type ParamArrayCtor =
  | Float32ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor;

type MeterArrayCtor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Uint32ArrayConstructor;

type MeterArrayValueCtor = MeterArrayCtor | Uint8ArrayConstructor;

export function paramArrayCtor(slot: ParamArraySlot): ParamArrayCtor {
  switch (slot.kind) {
    case "f32.array":
      return Float32Array;
    case "u32.array":
      return Uint32Array;
    case "u8.array":
    case "bool.array":
      return Uint8Array;
    case "i8.array":
      return Int8Array;
    case "i16.array":
      return Int16Array;
    case "u16.array":
      return Uint16Array;
    case "i32.array":
    case "enum.array":
    default:
      return Int32Array;
  }
}

export function meterArrayCtor(slot: MeterArraySlot): MeterArrayCtor {
  switch (slot.plane) {
    case "MF32":
      return Float32Array;
    case "MF64":
      return Float64Array;
    case "MU32":
      return Uint32Array;
  }
}

export function meterArrayValueCtor(
  slot: MeterArraySlot,
): MeterArrayValueCtor {
  switch (slot.kind) {
    case "f32.array":
      return Float32Array;
    case "f64.array":
      return Float64Array;
    case "bool.array":
      return Uint8Array;
    case "u32.array":
      return Uint32Array;
    default:
      return meterArrayCtor(slot);
  }
}

function byteOffsetFor(
  view: ArrayBufferView,
  slot: { readonly index: number; readonly bytesPerElement: number },
): number {
  return view.byteOffset + slot.index * slot.bytesPerElement;
}

export function paramArrayView(
  views: ParamPlaneViews,
  slot: ParamArraySlot,
): ParamArray {
  switch (slot.plane) {
    case "PF32":
      return views.PF32.subarray(slot.index, slot.index + slot.length);
    case "PI32": {
      const Ctor = paramArrayCtor(slot);
      return new Ctor(
        views.PI32.buffer as ArrayBuffer,
        byteOffsetFor(views.PI32, slot),
        slot.length,
      );
    }
    case "PB": {
      const Ctor = paramArrayCtor(slot);
      return new Ctor(
        views.PB.buffer as ArrayBuffer,
        byteOffsetFor(views.PB, slot),
        slot.length,
      );
    }
  }
}

export function meterArrayView(
  views: MeterPlaneViews,
  slot: MeterArraySlot,
): MeterArray {
  switch (slot.plane) {
    case "MF32":
      return views.MF32.subarray(slot.index, slot.index + slot.length);
    case "MF64":
      return views.MF64.subarray(slot.index, slot.index + slot.length);
    case "MU32":
      return views.MU32.subarray(slot.index, slot.index + slot.length);
  }
}

export function typedArrayName(ctor: ParamArrayCtor | MeterArrayCtor): string {
  return ctor.name;
}
