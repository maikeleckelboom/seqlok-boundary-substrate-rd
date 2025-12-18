import {
  DOMAIN_IDS,
  buildErrorDomain,
  type BuiltErrorDomain,
  type DomainRegistry,
  type ErrorCodeOf,
  type ErrorDetails,
  type ErrorKeyOf,
  type KeyedErrorFactoryOf,
  type SeqlokError,
} from "@seqlok/base";

import type { StreambufTypeTagName } from "../typed";

export interface StreambufInvalidCapacityDetails extends ErrorDetails {
  readonly where: string;
  readonly capacity: number;
  readonly min: number;
  readonly max: number;
}

export interface StreambufMisalignedOffsetDetails extends ErrorDetails {
  readonly where: string;
  readonly byteOffset: number;
  readonly alignment: number;
}

export interface StreambufUnsupportedTypeDetails extends ErrorDetails {
  readonly where: string;
  readonly note: string;
}

export interface StreambufUninitializedDetails extends ErrorDetails {
  readonly where: string;
  readonly expectedMagic: number;
  readonly receivedMagic: number;
}

export interface StreambufTypeMismatchDetails extends ErrorDetails {
  readonly where: string;
  readonly expected: StreambufTypeTagName;
  readonly received: StreambufTypeTagName | "unknown";
}

export interface StreambufBufferTooSmallDetails extends ErrorDetails {
  readonly where: string;
  readonly byteLength: number;
  readonly required: number;
}

export interface StreambufInvalidCountDetails extends ErrorDetails {
  readonly where: string;
  readonly returned: number;
  readonly min: number;
  readonly max: number;
}

export interface StreambufAudioBufferTooSmallDetails extends ErrorDetails {
  readonly where: string;
  readonly required: number;
  readonly received: number;
}

export interface StreambufAudioChannelTooSmallDetails extends ErrorDetails {
  readonly where: string;
  readonly channel: number;
  readonly required: number;
  readonly received: number;
}

export interface StreambufErrorDetailsByKey {
  readonly invalidCapacity: StreambufInvalidCapacityDetails;
  readonly misalignedOffset: StreambufMisalignedOffsetDetails;
  readonly unsupportedType: StreambufUnsupportedTypeDetails;
  readonly uninitialized: StreambufUninitializedDetails;
  readonly typeMismatch: StreambufTypeMismatchDetails;
  readonly bufferTooSmall: StreambufBufferTooSmallDetails;
  readonly invalidCount: StreambufInvalidCountDetails;

  // appended (do not reorder existing keys)
  readonly interleaveOutTooSmall: StreambufAudioBufferTooSmallDetails;
  readonly interleaveChannelTooSmall: StreambufAudioChannelTooSmallDetails;
  readonly deinterleaveInterleavedTooSmall: StreambufAudioBufferTooSmallDetails;
  readonly deinterleaveChannelTooSmall: StreambufAudioChannelTooSmallDetails;
}

const STREAMBUF_DEFS = {
  invalidCapacity: {
    message: "Invalid stream ring capacity",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "layout"],
    },
  },
  misalignedOffset: {
    message: "Byte offset is misaligned for stream ring attach",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "layout"],
    },
  },
  unsupportedType: {
    message: "Unsupported typed array kind for stream ring",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "typedarray"],
    },
  },
  uninitialized: {
    message: "Stream ring backing is not initialized (magic mismatch)",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "attach"],
    },
  },
  typeMismatch: {
    message: "Stream ring typed array kind mismatch",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "attach"],
    },
  },
  bufferTooSmall: {
    message:
      "Stream ring backing is smaller than required for its header/capacity",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "attach"],
    },
  },
  invalidCount: {
    message: "Stream ring callback returned an invalid commit count",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["transport", "stream", "hotpath"],
    },
  },

  // appended (audio helpers)
  interleaveOutTooSmall: {
    message: "interleave128 output buffer too small",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["audio", "interleave"],
    },
  },
  interleaveChannelTooSmall: {
    message: "interleave128 input channel too small",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["audio", "interleave"],
    },
  },
  deinterleaveInterleavedTooSmall: {
    message: "deinterleave128 interleaved input too small",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["audio", "deinterleave"],
    },
  },
  deinterleaveChannelTooSmall: {
    message: "deinterleave128 output channel too small",
    meta: {
      severity: "fatal",
      recoverable: true,
      boundarySafe: true,
      domainHint: "streambuf",
      tags: ["audio", "deinterleave"],
    },
  },
} as const;

type StreambufDefs = typeof STREAMBUF_DEFS;

export const STREAMBUF: BuiltErrorDomain<"streambuf", StreambufDefs> =
  buildErrorDomain("streambuf", DOMAIN_IDS.streambuf, STREAMBUF_DEFS);

export type StreambufDomain = typeof STREAMBUF;

export const STREAMBUF_ERRORS: DomainRegistry<"streambuf", StreambufDefs> =
  STREAMBUF.registry;

export type StreambufErrorCode = ErrorCodeOf<typeof STREAMBUF>;
export type StreambufErrorKey = ErrorKeyOf<typeof STREAMBUF>;
export type StreambufError = SeqlokError<StreambufErrorCode>;

export const createStreambufError: KeyedErrorFactoryOf<
  typeof STREAMBUF,
  StreambufErrorDetailsByKey
> = STREAMBUF.createError;

export type StreambufErrorFactory = typeof createStreambufError;
