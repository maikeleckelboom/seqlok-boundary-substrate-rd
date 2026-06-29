import {
  allocateSwsrRing,
  bindSwsrRingConsumer,
  bindSwsrRingProducer,
  SWSR_HEADER_READ_INDEX,
  SWSR_HEADER_WRITE_INDEX,
  SWSR_HEADER_WRITE_SEQ,
  type SwsrRingBacking,
  type SwsrRingConsumer,
  type SwsrRingProducer,
} from "@exclave/boundary";

export const STRETCH_COMMAND_WORDS_PER_SLOT = 8;
export const DEFAULT_COMMAND_RING_CAPACITY = 16;

const COMMAND_IDS = {
  clearLoop: 6,
  pause: 2,
  play: 1,
  resetFault: 7,
  seek: 4,
  setLoop: 5,
  stop: 3,
} as const;

const COMMAND_NAMES = {
  1: "play",
  2: "pause",
  3: "stop",
  4: "seek",
  5: "setLoop",
  6: "clearLoop",
  7: "resetFault",
} as const;

export type StretchCommandName = keyof typeof COMMAND_IDS;

export interface StretchCommand {
  readonly arg0: number;
  readonly arg1: number;
  readonly arg2: number;
  readonly flags: number;
  readonly id: number;
  readonly name: StretchCommandName;
  readonly sequence: number;
}

export interface EnqueueCommandOptions {
  readonly arg0?: number;
  readonly arg1?: number;
  readonly arg2?: number;
  readonly flags?: number;
}

export interface StretchCommandTransport {
  readonly backing: SwsrRingBacking;
  readonly capacity: number;
  readonly consumer: SwsrRingConsumer<StretchCommand>;
  readonly producer: SwsrRingProducer<StretchCommand>;
  drain(callback: (command: StretchCommand) => void): void;
  enqueue(
    name: StretchCommandName,
    options?: EnqueueCommandOptions,
  ): {
    readonly accepted: boolean;
    readonly dropped: number;
    readonly sequence: number;
  };
  stats(): {
    readonly dropped: number;
    readonly readIndex: number;
    readonly writeIndex: number;
    readonly writeSeq: number;
  };
}

const encoder = {
  encode(command: StretchCommand, dst: Uint32Array, offset: number): void {
    dst[offset] = command.sequence >>> 0;
    dst[offset + 1] = command.id >>> 0;
    dst[offset + 2] = command.arg0 >>> 0;
    dst[offset + 3] = command.arg1 >>> 0;
    dst[offset + 4] = command.arg2 >>> 0;
    dst[offset + 5] = command.flags >>> 0;
    dst[offset + 6] = 0;
    dst[offset + 7] = 0;
  },
};

const decoder = {
  decode(src: Uint32Array, offset: number): StretchCommand {
    const id = src[offset + 1] ?? 0;
    const name = commandNameFromId(id);

    return {
      arg0: src[offset + 2] ?? 0,
      arg1: src[offset + 3] ?? 0,
      arg2: src[offset + 4] ?? 0,
      flags: src[offset + 5] ?? 0,
      id,
      name,
      sequence: src[offset] ?? 0,
    };
  },
};

export function createStretchCommandTransport(
  capacity = DEFAULT_COMMAND_RING_CAPACITY,
): StretchCommandTransport {
  const backing = allocateSwsrRing({
    capacity,
    wordsPerSlot: STRETCH_COMMAND_WORDS_PER_SLOT,
  });
  const producer = bindSwsrRingProducer(backing, encoder);
  const consumer = bindSwsrRingConsumer(backing, decoder);
  let nextSequence = 1;

  return {
    backing,
    capacity,
    consumer,
    drain(callback): void {
      consumer.drain(callback);
    },
    enqueue(name, options = {}) {
      const sequence = nextSequence;
      nextSequence = (nextSequence + 1) >>> 0;

      const command: StretchCommand = {
        arg0: options.arg0 ?? 0,
        arg1: options.arg1 ?? 0,
        arg2: options.arg2 ?? 0,
        flags: options.flags ?? 0,
        id: COMMAND_IDS[name],
        name,
        sequence,
      };
      const accepted = producer.enqueue(command);

      return {
        accepted,
        dropped: producer.stats().dropped,
        sequence,
      };
    },
    producer,
    stats() {
      return {
        dropped: producer.stats().dropped,
        readIndex: Atomics.load(backing.header, SWSR_HEADER_READ_INDEX),
        writeIndex: Atomics.load(backing.header, SWSR_HEADER_WRITE_INDEX),
        writeSeq: Atomics.load(backing.header, SWSR_HEADER_WRITE_SEQ),
      };
    },
  };
}

function commandNameFromId(id: number): StretchCommandName {
  if (id in COMMAND_NAMES) {
    return COMMAND_NAMES[id as keyof typeof COMMAND_NAMES];
  }

  return "pause";
}
