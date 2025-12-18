import { invariant } from "@seqlok/base";

import { createStreambufError } from "./errors/streambuf";
import {
  type NumberTypedArray,
  type NumberTypedArrayConstructor,
  STREAMBUF_HEADER_BYTES,
  STREAMBUF_HEADER_WORDS,
  type StreambufTypeTag,
  type StreambufTypeTagName,
  tryTypeNameForTag,
  typeNameForTag,
  typeTagForConstructor,
} from "./typed";

export { STREAMBUF_HEADER_BYTES, STREAMBUF_HEADER_WORDS } from "./typed";

const HEADER_WRITE_INDEX = 0;
const HEADER_READ_INDEX = 1;
const HEADER_WRITE_SEQ = 2;
const HEADER_DROPPED = 3;
const HEADER_CAPACITY = 4;
const HEADER_TYPE_TAG = 5;
const HEADER_MAGIC = 6;
const HEADER_VERSION = 7;

const STREAMBUF_MAGIC = 0x5354524d; // "STRM"
const STREAMBUF_VERSION = 1;

export interface ReadableArrayLike<T> {
  readonly length: number;
  readonly [n: number]: T | undefined;
}

export interface WritableArrayLike<T> {
  readonly length: number;
  [n: number]: T;
}

export interface StreamRingBacking<T extends NumberTypedArray> {
  readonly sab: SharedArrayBuffer;
  readonly byteOffset: number;
  readonly header: Uint32Array;
  readonly storage: T;
}

export interface StreamRingAttachOptions<T extends NumberTypedArray> {
  readonly sab: SharedArrayBuffer;
  readonly type: NumberTypedArrayConstructor<T>;
  readonly byteOffset?: number;
}

export interface StreamRingDebugSnapshot {
  readonly writeSeq: number;
  readonly droppedWrites: number;
  readonly availableRead: number;
  readonly availableWrite: number;
  readonly typeName: StreambufTypeTagName;
  readonly capacity: number;
}

export type StreamRingOffsetsCallback<T extends NumberTypedArray> = (
  storage: T,
  offset0: number,
  length0: number,
  offset1: number,
  length1: number,
) => number | undefined;

export function bytesForStreamRing<T extends NumberTypedArray>(
  capacity: number,
  type: NumberTypedArrayConstructor<T>,
): number {
  invariant(Number.isInteger(capacity) && capacity >= 1, () =>
    createStreambufError("invalidCapacity", {
      where: "stream-ring.bytesForStreamRing",
      capacity,
      min: 1,
      max: 0x7fffffff,
    }),
  );

  const storageLength = capacity + 1;
  return STREAMBUF_HEADER_BYTES + storageLength * type.BYTES_PER_ELEMENT;
}

export function allocateStreamRing<T extends NumberTypedArray>(opts: {
  readonly capacity: number;
  readonly type: NumberTypedArrayConstructor<T>;
}): StreamRing<T> {
  const typeTag = typeTagForConstructor(opts.type);

  invariant(typeTag !== undefined, () =>
    createStreambufError("unsupportedType", {
      where: "stream-ring.allocateStreamRing",
      note: "Unrecognized typed array constructor",
    }),
  );

  const byteLength = bytesForStreamRing(opts.capacity, opts.type);
  const sab = new SharedArrayBuffer(byteLength);

  const header = new Uint32Array(sab, 0, STREAMBUF_HEADER_WORDS);

  Atomics.store(header, HEADER_WRITE_INDEX, 0);
  Atomics.store(header, HEADER_READ_INDEX, 0);
  Atomics.store(header, HEADER_WRITE_SEQ, 0);
  Atomics.store(header, HEADER_DROPPED, 0);

  Atomics.store(header, HEADER_CAPACITY, opts.capacity);
  Atomics.store(header, HEADER_TYPE_TAG, typeTag);
  Atomics.store(header, HEADER_MAGIC, STREAMBUF_MAGIC);
  Atomics.store(header, HEADER_VERSION, STREAMBUF_VERSION);

  const storageLength = opts.capacity + 1;
  const storage = new opts.type(sab, STREAMBUF_HEADER_BYTES, storageLength);

  return new StreamRing({
    sab,
    byteOffset: 0,
    header,
    storage,
  });
}

function unsignedIndex(v: number): number {
  return v >>> 0;
}

function computeReadable(
  readIndex: number,
  writeIndex: number,
  storageLength: number,
): number {
  if (writeIndex >= readIndex) {
    return writeIndex - readIndex;
  }
  return storageLength - (readIndex - writeIndex);
}

function computeWritable(
  readIndex: number,
  writeIndex: number,
  storageLength: number,
  capacity: number,
): number {
  return capacity - computeReadable(readIndex, writeIndex, storageLength);
}

function modIndex(v: number, m: number): number {
  const r = v % m;
  return r < 0 ? r + m : r;
}

function valueOrZero(src: ReadableArrayLike<number>, index: number): number {
  const v = src[index];
  return v ?? 0;
}

export class StreamRing<T extends NumberTypedArray> {
  readonly #sab: SharedArrayBuffer;
  readonly #byteOffset: number;
  readonly #header: Uint32Array;
  readonly #storage: T;

  readonly #capacity: number;
  readonly #storageLength: number;
  readonly #typeTagName: StreambufTypeTagName;

  constructor(backing: StreamRingBacking<T>) {
    this.#sab = backing.sab;
    this.#byteOffset = backing.byteOffset;
    this.#header = backing.header;
    this.#storage = backing.storage;

    const capacity = Atomics.load(this.#header, HEADER_CAPACITY);
    this.#capacity = capacity;
    this.#storageLength = capacity + 1;

    const rawTag = Atomics.load(this.#header, HEADER_TYPE_TAG);
    const maybeName = tryTypeNameForTag(rawTag);
    invariant(maybeName !== undefined, () =>
      createStreambufError("unsupportedType", {
        where: "stream-ring.constructor",
        note: `Unknown type tag: ${String(rawTag)}`,
      }),
    );

    this.#typeTagName = maybeName;
  }

  get capacity(): number {
    return this.#capacity;
  }

  get typeName(): StreambufTypeTagName {
    return this.#typeTagName;
  }

  get droppedWrites(): number {
    return Atomics.load(this.#header, HEADER_DROPPED);
  }

  get writeSeq(): number {
    return Atomics.load(this.#header, HEADER_WRITE_SEQ);
  }

  get backing(): StreamRingBacking<T> {
    return {
      sab: this.#sab,
      byteOffset: this.#byteOffset,
      header: this.#header,
      storage: this.#storage,
    };
  }

  get debug(): StreamRingDebugSnapshot {
    const readIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_READ_INDEX),
    );
    const writeIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_WRITE_INDEX),
    );

    const availableRead = computeReadable(
      readIndex,
      writeIndex,
      this.#storageLength,
    );
    const availableWrite = computeWritable(
      readIndex,
      writeIndex,
      this.#storageLength,
      this.#capacity,
    );

    return {
      writeSeq: this.writeSeq,
      droppedWrites: this.droppedWrites,
      availableRead,
      availableWrite,
      typeName: this.typeName,
      capacity: this.capacity,
    };
  }

  static attach<T extends NumberTypedArray>(
    opts: StreamRingAttachOptions<T>,
  ): StreamRing<T> {
    const byteOffset = opts.byteOffset ?? 0;

    invariant(
      Number.isInteger(byteOffset) && byteOffset >= 0 && byteOffset % 4 === 0,
      () =>
        createStreambufError("misalignedOffset", {
          where: "stream-ring.attach",
          byteOffset,
          alignment: 4,
        }),
    );

    const header = new Uint32Array(
      opts.sab,
      byteOffset,
      STREAMBUF_HEADER_WORDS,
    );

    const magic = Atomics.load(header, HEADER_MAGIC);
    invariant(magic === STREAMBUF_MAGIC, () =>
      createStreambufError("uninitialized", {
        where: "stream-ring.attach",
        expectedMagic: STREAMBUF_MAGIC,
        receivedMagic: magic,
      }),
    );

    const version = Atomics.load(header, HEADER_VERSION);
    invariant(version === STREAMBUF_VERSION, () =>
      createStreambufError("uninitialized", {
        where: "stream-ring.attach.version",
        expectedMagic: STREAMBUF_VERSION,
        receivedMagic: version,
      }),
    );

    const capacity = Atomics.load(header, HEADER_CAPACITY);

    const rawTypeTag = Atomics.load(header, HEADER_TYPE_TAG);
    const receivedName = tryTypeNameForTag(rawTypeTag);

    // Key move: validate -> then treat as enum. This avoids unsafe enum comparisons.
    invariant(receivedName !== undefined, () =>
      createStreambufError("unsupportedType", {
        where: "stream-ring.attach",
        note: `Unknown type tag: ${String(rawTypeTag)}`,
      }),
    );
    const receivedTag: StreambufTypeTag = rawTypeTag as StreambufTypeTag;

    const expectedTag = typeTagForConstructor(opts.type);
    invariant(expectedTag !== undefined, () =>
      createStreambufError("unsupportedType", {
        where: "stream-ring.attach",
        note: "Unrecognized typed array constructor",
      }),
    );

    const expectedName = typeNameForTag(expectedTag);

    invariant(receivedTag === expectedTag, () =>
      createStreambufError("typeMismatch", {
        where: "stream-ring.attach",
        expected: expectedName,
        received: receivedName,
      }),
    );

    const required = bytesForStreamRing(capacity, opts.type);
    invariant(opts.sab.byteLength - byteOffset >= required, () =>
      createStreambufError("bufferTooSmall", {
        where: "stream-ring.attach",
        byteLength: opts.sab.byteLength - byteOffset,
        required,
      }),
    );

    const storageLength = capacity + 1;
    const storageByteOffset = byteOffset + STREAMBUF_HEADER_BYTES;

    invariant(storageByteOffset % opts.type.BYTES_PER_ELEMENT === 0, () =>
      createStreambufError("misalignedOffset", {
        where: "stream-ring.attach.storage",
        byteOffset: storageByteOffset,
        alignment: opts.type.BYTES_PER_ELEMENT,
      }),
    );

    const storage = new opts.type(opts.sab, storageByteOffset, storageLength);

    return new StreamRing({
      sab: opts.sab,
      byteOffset,
      header,
      storage,
    });
  }

  availableRead(): number {
    const readIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_READ_INDEX),
    );
    const writeIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_WRITE_INDEX),
    );
    return computeReadable(readIndex, writeIndex, this.#storageLength);
  }

  availableWrite(): number {
    const readIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_READ_INDEX),
    );
    const writeIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_WRITE_INDEX),
    );
    return computeWritable(
      readIndex,
      writeIndex,
      this.#storageLength,
      this.#capacity,
    );
  }

  reset(): void {
    Atomics.store(this.#header, HEADER_WRITE_INDEX, 0);
    Atomics.store(this.#header, HEADER_READ_INDEX, 0);
    Atomics.store(this.#header, HEADER_WRITE_SEQ, 0);
    Atomics.store(this.#header, HEADER_DROPPED, 0);
  }

  writeWithOffsets(
    requested: number,
    write: StreamRingOffsetsCallback<T>,
  ): number {
    invariant(Number.isInteger(requested) && requested >= 0, () =>
      createStreambufError("invalidCount", {
        where: "stream-ring.writeWithOffsets.requested",
        returned: requested,
        min: 0,
        max: this.#capacity,
      }),
    );

    const readIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_READ_INDEX),
    );
    const writeIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_WRITE_INDEX),
    );

    const writable = computeWritable(
      readIndex,
      writeIndex,
      this.#storageLength,
      this.#capacity,
    );

    if (writable === 0) {
      if (requested > 0) {
        Atomics.add(this.#header, HEADER_DROPPED, 1);
      }
      return 0;
    }

    const claim = Math.min(requested, writable);
    const length0 = Math.min(claim, this.#storageLength - writeIndex);
    const length1 = claim - length0;

    const returned = write(this.#storage, writeIndex, length0, 0, length1);
    const commit = returned ?? claim;

    invariant(Number.isInteger(commit) && commit >= 0 && commit <= claim, () =>
      createStreambufError("invalidCount", {
        where: "stream-ring.writeWithOffsets.commit",
        returned: commit,
        min: 0,
        max: claim,
      }),
    );

    if (commit === 0) {
      return 0;
    }

    const nextWrite = modIndex(writeIndex + commit, this.#storageLength);
    Atomics.store(this.#header, HEADER_WRITE_INDEX, nextWrite);
    Atomics.add(this.#header, HEADER_WRITE_SEQ, 1);

    return commit;
  }

  readWithOffsets(
    requested: number,
    read: StreamRingOffsetsCallback<T>,
  ): number {
    invariant(Number.isInteger(requested) && requested >= 0, () =>
      createStreambufError("invalidCount", {
        where: "stream-ring.readWithOffsets.requested",
        returned: requested,
        min: 0,
        max: this.#capacity,
      }),
    );

    const readIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_READ_INDEX),
    );
    const writeIndex = unsignedIndex(
      Atomics.load(this.#header, HEADER_WRITE_INDEX),
    );

    const readable = computeReadable(
      readIndex,
      writeIndex,
      this.#storageLength,
    );
    if (readable === 0) {
      return 0;
    }

    const claim = Math.min(requested, readable);
    const length0 = Math.min(claim, this.#storageLength - readIndex);
    const length1 = claim - length0;

    const returned = read(this.#storage, readIndex, length0, 0, length1);
    const commit = returned ?? claim;

    invariant(Number.isInteger(commit) && commit >= 0 && commit <= claim, () =>
      createStreambufError("invalidCount", {
        where: "stream-ring.readWithOffsets.commit",
        returned: commit,
        min: 0,
        max: claim,
      }),
    );

    if (commit === 0) {
      return 0;
    }

    const nextRead = modIndex(readIndex + commit, this.#storageLength);
    Atomics.store(this.#header, HEADER_READ_INDEX, nextRead);

    return commit;
  }

  push(src: ReadableArrayLike<number>, count: number = src.length): number {
    const n = Math.min(count, src.length, this.#capacity);
    if (n <= 0) {
      return 0;
    }

    return this.writeWithOffsets(n, (storage, o0, n0, o1, n1) => {
      let s = 0;

      for (let i = 0; i < n0; i++) {
        storage[o0 + i] = valueOrZero(src, s + i);
      }
      s += n0;

      for (let i = 0; i < n1; i++) {
        storage[o1 + i] = valueOrZero(src, s + i);
      }

      return n0 + n1;
    });
  }

  pop(dst: WritableArrayLike<number>, count: number): number {
    const n = Math.min(count, dst.length, this.#capacity);
    if (n <= 0) {
      return 0;
    }

    return this.readWithOffsets(n, (storage, o0, n0, o1, n1) => {
      let d = 0;

      for (let i = 0; i < n0; i++) {
        dst[d + i] = valueOrZero(storage, o0 + i);
      }
      d += n0;

      for (let i = 0; i < n1; i++) {
        dst[d + i] = valueOrZero(storage, o1 + i);
      }

      return n0 + n1;
    });
  }
}
