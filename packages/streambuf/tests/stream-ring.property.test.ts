import { describe, it } from "vitest";

import {
  allocateStreamRing,
  type NumberTypedArray,
  type NumberTypedArrayConstructor,
  type ReadableArrayLike,
  type StreambufTypeTagName,
  typeNameForTag,
  typeTagForConstructor,
  type WritableArrayLike,
} from "../src";

function readEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) {
    return undefined;
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return undefined;
  }

  const i = Math.trunc(n);
  return i >= 0 ? i : undefined;
}

const IS_CI = process.env.CI === "true" || process.env.CI === "1";

const DEFAULT_RUNS = IS_CI ? 40 : 12;
const DEFAULT_STEPS = IS_CI ? 1200 : 450;

const RUNS = readEnvInt("SEQLOK_STREAMBUF_PROP_RUNS") ?? DEFAULT_RUNS;
const STEPS = readEnvInt("SEQLOK_STREAMBUF_PROP_STEPS") ?? DEFAULT_STEPS;

function fail(msg: string): never {
  throw new Error(msg);
}

function assertEq(label: string, got: number, expected: number): void {
  if (got !== expected) {
    fail(label + " got=" + String(got) + " expected=" + String(expected));
  }
}

function assertEqStr(label: string, got: string, expected: string): void {
  if (got !== expected) {
    fail(label + " got=" + got + " expected=" + expected);
  }
}

function valueOrZero(src: ReadableArrayLike<number>, i: number): number {
  const v = src[i];
  return v ?? 0;
}

function readAt(
  src: ReadableArrayLike<number>,
  i: number,
  label: string,
): number {
  const v = src[i];
  if (v === undefined) {
    fail(
      "unexpected undefined read " +
        label +
        " index=" +
        String(i) +
        " length=" +
        String(src.length),
    );
  }
  return v;
}

class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  nextU32(): number {
    // LCG: cheap + deterministic
    this.#state = (Math.imul(this.#state, 1664525) + 1013904223) >>> 0;
    return this.#state;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const span = (maxInclusive - minInclusive + 1) >>> 0;
    const v = this.nextU32() % span;
    return (minInclusive + v) | 0;
  }
}

/**
 * Minimal reference model:
 * - Represents the ring’s observable behavior as a bounded FIFO queue.
 * - No wrap-around math; fewer shared-bug risks with the real implementation.
 */
class ModelRing {
  readonly #capacity: number;
  readonly #queue: number[] = [];

  #writeSeq = 0;
  #droppedWrites = 0;

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get writeSeq(): number {
    return this.#writeSeq;
  }

  get droppedWrites(): number {
    return this.#droppedWrites;
  }

  availableRead(): number {
    return this.#queue.length;
  }

  availableWrite(): number {
    return this.#capacity - this.#queue.length;
  }

  reset(): void {
    this.#queue.length = 0;
    this.#writeSeq = 0;
    this.#droppedWrites = 0;
  }

  push(src: ReadableArrayLike<number>, count: number): number {
    const n = Math.min(count, src.length, this.#capacity);
    if (n <= 0) {
      return 0;
    }

    const writable = this.availableWrite();
    if (writable === 0) {
      this.#droppedWrites++;
      return 0;
    }

    const claim = Math.min(n, writable);
    for (let i = 0; i < claim; i++) {
      this.#queue.push(valueOrZero(src, i));
    }

    this.#writeSeq++;
    return claim;
  }

  pop(dst: WritableArrayLike<number>, count: number): number {
    const n = Math.min(count, dst.length, this.#capacity);
    if (n <= 0) {
      return 0;
    }

    const readable = this.availableRead();
    if (readable === 0) {
      return 0;
    }

    const claim = Math.min(n, readable);

    for (let i = 0; i < claim; i++) {
      dst[i] = readAt(this.#queue, i, "model.queue");
    }

    this.#queue.splice(0, claim);
    return claim;
  }
}

function fillRandom(dst: NumberTypedArray, n: number, rng: Rng): void {
  if (dst instanceof Float32Array || dst instanceof Float64Array) {
    for (let i = 0; i < n; i++) {
      const u = rng.nextU32();

      dst[i] = (u / 4294967296) * 2 - 1;
    }
    return;
  }

  for (let i = 0; i < n; i++) {
    dst[i] = rng.nextU32();
  }
}

function comparePrefix(
  ctorName: string,
  seed: number,
  step: number,
  got: ReadableArrayLike<number>,
  expected: ReadableArrayLike<number>,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = readAt(got, i, "got");
    const b = readAt(expected, i, "expected");
    if (a !== b) {
      fail(
        "mismatch ctor=" +
          ctorName +
          " seed=" +
          String(seed) +
          " step=" +
          String(step) +
          " index=" +
          String(i) +
          " got=" +
          String(a) +
          " expected=" +
          String(b),
      );
    }
  }
}

function runProperty(ctor: NumberTypedArrayConstructor): void {
  const capacity = 32;

  const maybeTag = typeTagForConstructor(ctor);
  if (maybeTag === undefined) {
    fail("unsupported ctor in property test: " + ctor.name);
  }
  const expectedTypeName: StreambufTypeTagName = typeNameForTag(maybeTag);

  const src: NumberTypedArray = new ctor(capacity);
  const outRing: NumberTypedArray = new ctor(capacity);
  const outModel: NumberTypedArray = new ctor(capacity);

  for (let run = 0; run < RUNS; run++) {
    const seed = (0xc0ffee ^ (run * 0x9e3779b9)) >>> 0;
    const rng = new Rng(seed);

    const ring = allocateStreamRing({ capacity, type: ctor });
    const model = new ModelRing(capacity);

    assertEqStr("typeName", ring.typeName, expectedTypeName);

    for (let step = 0; step < STEPS; step++) {
      const roll = rng.int(0, 99);

      if (roll < 55) {
        const srcLen = rng.int(0, capacity);
        const requested = rng.int(0, capacity * 2);

        fillRandom(src, srcLen, rng);

        // Only expose the filled prefix to both implementations
        const srcView: ReadableArrayLike<number> = src.subarray(0, srcLen);

        const got = ring.push(srcView, requested);
        const exp = model.push(srcView, requested);

        if (got !== exp) {
          fail(
            "push count mismatch ctor=" +
              ctor.name +
              " seed=" +
              String(seed) +
              " step=" +
              String(step) +
              " got=" +
              String(got) +
              " expected=" +
              String(exp),
          );
        }
      } else if (roll < 95) {
        const requested = rng.int(0, capacity * 2);

        const got = ring.pop(outRing, requested);
        const exp = model.pop(outModel, requested);

        if (got !== exp) {
          fail(
            "pop count mismatch ctor=" +
              ctor.name +
              " seed=" +
              String(seed) +
              " step=" +
              String(step) +
              " got=" +
              String(got) +
              " expected=" +
              String(exp),
          );
        }

        comparePrefix(ctor.name, seed, step, outRing, outModel, got);
      } else {
        ring.reset();
        model.reset();
      }

      assertEq("writeSeq", ring.writeSeq, model.writeSeq);
      assertEq("droppedWrites", ring.droppedWrites, model.droppedWrites);

      if ((step & 15) === 0) {
        const snap = ring.debug;
        assertEq("debug.writeSeq", snap.writeSeq, model.writeSeq);
        assertEq(
          "debug.droppedWrites",
          snap.droppedWrites,
          model.droppedWrites,
        );
        assertEq(
          "debug.availableRead",
          snap.availableRead,
          model.availableRead(),
        );
        assertEq(
          "debug.availableWrite",
          snap.availableWrite,
          model.availableWrite(),
        );
        assertEqStr("debug.typeName", snap.typeName, expectedTypeName);
        assertEq("debug.capacity", snap.capacity, capacity);
      }
    }
  }
}

describe("StreamRing properties (deterministic)", () => {
  it("preserves model behavior under random push/pop/reset sequences (Uint32)", () => {
    runProperty(Uint32Array);
  });

  it("preserves model behavior under random push/pop/reset sequences (Int16)", () => {
    runProperty(Int16Array);
  });

  it("preserves model behavior under random push/pop/reset sequences (Float32)", () => {
    runProperty(Float32Array);
  });
});
