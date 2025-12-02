/**
 * @fileoverview
 * SWSR ring-backed implementation of the command mailbox contracts.
 *
 * Bridges the transport-agnostic {@link CommandProducer} /
 * {@link CommandConsumer} interfaces to the {@link SwsrRingBacking}
 * primitive from `@seqlok/primitives`.
 */

import { panic } from "@seqlok/base";
import {
  allocateSwsrRing,
  bindSwsrRingConsumer,
  bindSwsrRingProducer,
  SWSR_HEADER_READ_INDEX,
  SWSR_HEADER_WRITE_INDEX,
} from "@seqlok/primitives";

import type { CommandCodec, DecodeResult } from "./codec";
import type {
  BaseCommandMailboxConfig,
  CommandConsumer,
  CommandConsumerHooks,
  CommandDrainStats,
  CommandProducer,
  CommandPushResult,
} from "./mailbox";
import type {
  SwsrRingBacking,
  SwsrRingConsumer as PrimitiveConsumer,
  SwsrRingLayout,
  SwsrRingProducer as PrimitiveProducer,
} from "@seqlok/primitives";

/**
 * Configuration for a SWSR ring-backed command mailbox.
 *
 * @typeParam C - Discriminated union of command types.
 */
export interface CommandMailboxConfig<C> extends BaseCommandMailboxConfig<C> {
  /**
   * Ring layout parameters.
   *
   * @remarks
   * - `capacity` is the number of command slots.
   * - `wordsPerSlot` must match `codec.wordsPerSlot`.
   */
  readonly layout: SwsrRingLayout;
}

/**
 * A command mailbox backed by a SWSR ring.
 *
 * @typeParam C - Discriminated union of command types.
 */
export interface CommandMailbox<C> {
  /**
   * Discriminant for runtime type narrowing.
   */
  readonly kind: "swsr";

  /**
   * Logical identifier for this mailbox.
   */
  readonly mailboxId: string;

  /**
   * The underlying ring backing.
   *
   * @remarks
   * Exposed for cross-thread handoff (postMessage, AudioWorkletOptions, etc.)
   * and for tests that need to inspect the ring state directly.
   */
  readonly backing: SwsrRingBacking;

  /**
   * Writer-side view.
   */
  readonly producer: CommandProducer<C>;

  /**
   * Reader-side view.
   */
  readonly consumer: CommandConsumer<C>;
}

/**
 * Create a SWSR ring-backed command mailbox.
 *
 * @param config - Mailbox configuration including codec and ring layout.
 * @returns A mailbox with producer and consumer bindings.
 *
 * @remarks
 * - Allocates a fresh `SharedArrayBuffer` for the ring.
 * - `backing.sab` can be transferred to other threads via `postMessage`.
 * - Producer and consumer are single-threaded; MWMR lives at topology level
 *   via multiple rings and hubs, not at the primitive.
 */
export function createCommandMailbox<C>(
  config: CommandMailboxConfig<C>,
): CommandMailbox<C> {
  const { mailboxId, codec, layout } = config;

  assertWordsPerSlotMatches(
    "createCommandMailbox",
    mailboxId,
    layout.wordsPerSlot,
    codec.wordsPerSlot,
  );

  const backing = allocateSwsrRing(layout);

  const producer = createProducer(backing, codec, mailboxId);
  const consumer = createConsumer(backing, codec, mailboxId);

  return {
    kind: "swsr",
    mailboxId,
    backing,
    producer,
    consumer,
  };
}

/**
 * Attach a producer to an existing SWSR ring backing.
 *
 * @remarks
 * Use this when the ring was allocated elsewhere (e.g., main thread) and
 * the `SharedArrayBuffer` was transferred to this thread.
 */
export function attachCommandProducer<C>(
  backing: SwsrRingBacking,
  codec: CommandCodec<C>,
  mailboxId: string,
): CommandProducer<C> {
  assertWordsPerSlotMatches(
    "attachCommandProducer",
    mailboxId,
    backing.wordsPerSlot,
    codec.wordsPerSlot,
  );

  return createProducer(backing, codec, mailboxId);
}

/**
 * Attach a consumer to an existing SWSR ring backing.
 *
 * @remarks
 * Use this when the ring was allocated elsewhere and the `SharedArrayBuffer`
 * was transferred to this thread (e.g., AudioWorklet).
 */
export function attachCommandConsumer<C>(
  backing: SwsrRingBacking,
  codec: CommandCodec<C>,
  mailboxId: string,
): CommandConsumer<C> {
  assertWordsPerSlotMatches(
    "attachCommandConsumer",
    mailboxId,
    backing.wordsPerSlot,
    codec.wordsPerSlot,
  );

  return createConsumer(backing, codec, mailboxId);
}

/**
 * Internal: producer implementation over a SWSR ring.
 */
function createProducer<C>(
  backing: SwsrRingBacking,
  codec: CommandCodec<C>,
  mailboxId: string,
): CommandProducer<C> {
  const { header, capacity } = backing;

  const ringProducer: PrimitiveProducer<C> = bindSwsrRingProducer(backing, {
    encode(command, dst, wordOffset) {
      codec.encode(command, dst, wordOffset);
    },
  });

  let closed = false;

  const push = (command: C): CommandPushResult => {
    if (closed) {
      return { ok: false, reason: "mailboxClosed" };
    }

    const accepted = ringProducer.enqueue(command);

    const writeIndex = Atomics.load(header, SWSR_HEADER_WRITE_INDEX);
    const readIndex = Atomics.load(header, SWSR_HEADER_READ_INDEX);
    const queued = computeQueueDepth(writeIndex, readIndex, capacity);

    if (!accepted) {
      return {
        ok: false,
        reason: "ringOverflow",
        capacity,
        queued,
      };
    }

    return { ok: true, queued };
  };

  const close = (): void => {
    closed = true;
  };

  return {
    mailboxId,
    get isClosed() {
      return closed;
    },
    push,
    close,
  };
}

/**
 * Internal: consumer implementation over a SWSR ring.
 */
function createConsumer<C>(
  backing: SwsrRingBacking,
  codec: CommandCodec<C>,
  mailboxId: string,
): CommandConsumer<C> {
  const { header, capacity } = backing;

  const ringConsumer: PrimitiveConsumer<DecodeResult<C>> = bindSwsrRingConsumer(
    backing,
    {
      decode(src, wordOffset) {
        return codec.decode(src, wordOffset);
      },
    },
  );

  const drain = (hooks: CommandConsumerHooks<C>): CommandDrainStats => {
    let processed = 0;
    let unknownCommand = 0;
    let invalidPayload = 0;

    ringConsumer.drain((result) => {
      if (result.ok) {
        processed += 1;
        hooks.onCommand(result.command);
        return;
      }

      const error = result.error;

      if (error.kind === "unknownCommand") {
        unknownCommand += 1;
        hooks.onUnknownCommand?.(error);
      } else {
        invalidPayload += 1;
        hooks.onInvalidPayload?.(error);
      }
    });

    return { processed, unknownCommand, invalidPayload };
  };

  return {
    mailboxId,
    get depth() {
      const writeIndex = Atomics.load(header, SWSR_HEADER_WRITE_INDEX);
      const readIndex = Atomics.load(header, SWSR_HEADER_READ_INDEX);
      return computeQueueDepth(writeIndex, readIndex, capacity);
    },
    drain,
  };
}

/**
 * Compute queue depth from ring indices.
 *
 * @remarks
 * Uses the standard circular-buffer distance with one slot reserved to
 * distinguish full vs. empty. The result is in `[0, capacity - 1]`.
 */
function computeQueueDepth(
  writeIndex: number,
  readIndex: number,
  capacity: number,
): number {
  if (writeIndex >= readIndex) {
    return writeIndex - readIndex;
  }
  return capacity - readIndex + writeIndex;
}

/**
 * Guard to ensure the ring layout matches the codec's slot shape.
 *
 * @remarks
 * This prevents silent UB when encode/decode disagree with the backing.
 */
function assertWordsPerSlotMatches(
  where: string,
  mailboxId: string,
  ringWordsPerSlot: number,
  codecWordsPerSlot: number,
): void {
  if (ringWordsPerSlot !== codecWordsPerSlot) {
    panic(
      `[commands.swsrMailbox] wordsPerSlot mismatch in ${where} ` +
        `(mailboxId="${mailboxId}"): backing/layout.wordsPerSlot=` +
        `${String(ringWordsPerSlot)}, codec.wordsPerSlot=${String(
          codecWordsPerSlot,
        )}`,
    );
  }
}
