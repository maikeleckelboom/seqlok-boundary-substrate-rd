import { describe, it } from "vitest";

import { expectStreambufError } from "./expect-streambuf-error";
import {
  STREAMBUF_HEADER_WORDS,
  StreamRing,
  StreambufTypeTag,
  allocateStreamRing,
  bytesForStreamRing,
} from "../src";

// These are intentionally duplicated from stream-ring.ts: tests verify attach behavior
// for corrupt/hand-rolled backings.
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

describe("StreamRing.attach validation + errors", () => {
  it("rejects misaligned byteOffset", () => {
    const ring = allocateStreamRing({ capacity: 4, type: Float32Array });
    const sab = ring.backing.sab;

    expectStreambufError(
      () => StreamRing.attach({ sab, type: Float32Array, byteOffset: 2 }),
      "streambuf.misalignedOffset",
      "stream-ring.attach",
    );
  });

  it("rejects uninitialized backings (magic mismatch)", () => {
    const sab = new SharedArrayBuffer(bytesForStreamRing(4, Float32Array));

    expectStreambufError(
      () => StreamRing.attach({ sab, type: Float32Array }),
      "streambuf.uninitialized",
      "stream-ring.attach",
    );
  });

  it("rejects type mismatches", () => {
    const ring = allocateStreamRing({ capacity: 4, type: Float32Array });
    const sab = ring.backing.sab;

    expectStreambufError(
      () => StreamRing.attach({ sab, type: Uint32Array }),
      "streambuf.typeMismatch",
      "stream-ring.attach",
    );
  });

  it("rejects buffers that are smaller than required for their header/capacity", () => {
    const capacity = 16;
    const required = bytesForStreamRing(capacity, Float32Array);

    // Make it too small, but still big enough to contain the header.
    const sab = new SharedArrayBuffer(required - 4);
    const header = new Uint32Array(sab, 0, STREAMBUF_HEADER_WORDS);

    Atomics.store(header, HEADER_WRITE_INDEX, 0);
    Atomics.store(header, HEADER_READ_INDEX, 0);
    Atomics.store(header, HEADER_WRITE_SEQ, 0);
    Atomics.store(header, HEADER_DROPPED, 0);

    Atomics.store(header, HEADER_CAPACITY, capacity);
    Atomics.store(header, HEADER_TYPE_TAG, StreambufTypeTag.Float32);
    Atomics.store(header, HEADER_MAGIC, STREAMBUF_MAGIC);
    Atomics.store(header, HEADER_VERSION, STREAMBUF_VERSION);

    expectStreambufError(
      () => StreamRing.attach({ sab, type: Float32Array }),
      "streambuf.bufferTooSmall",
      "stream-ring.attach",
    );
  });
});
