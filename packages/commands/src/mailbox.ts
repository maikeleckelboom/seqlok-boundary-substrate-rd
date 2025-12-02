/**
 * @fileoverview
 * Transport-agnostic mailbox contracts.
 *
 * These types describe the logical producer / consumer ends and their
 * statistics. Concrete transports (SWSR ring, IPC, etc.) wrap these.
 */

import type {
  CommandCodec,
  DecodeErrorInvalidPayload,
  DecodeErrorUnknownCommand,
} from "./codec";

/**
 * Base configuration for a logical command mailbox.
 *
 * @remarks
 * Does not include transport-specific details (e.g. ring layout).
 */
export interface BaseCommandMailboxConfig<C> {
  /**
   * Logical identifier for this mailbox.
   *
   * @remarks
   * Used for logging, debugging and error reporting. Not required to be
   * globally unique, but should be stable within a process.
   */
  readonly mailboxId: string;

  /**
   * Codec used to encode/decode the command union.
   */
  readonly codec: CommandCodec<C>;
}

/**
 * Result of a push attempt into a mailbox.
 */
export type CommandPushResult =
  | {
      readonly ok: true;
      /**
       * Number of commands currently queued in the mailbox after enqueue.
       */
      readonly queued: number;
    }
  | {
      readonly ok: false;
      readonly reason: "mailboxClosed";
    }
  | {
      readonly ok: false;
      readonly reason: "ringOverflow";
      /**
       * Total capacity of the underlying queue in command slots.
       */
      readonly capacity: number;
      /**
       * Number of commands that were queued at the time of overflow.
       */
      readonly queued: number;
    };

/**
 * Hooks invoked while draining a mailbox.
 */
export interface CommandConsumerHooks<C> {
  /**
   * Called for each successfully decoded command.
   */
  onCommand(command: C): void;

  /**
   * Called when the codec reports an unknown command.
   */
  onUnknownCommand?(error: DecodeErrorUnknownCommand): void;

  /**
   * Called when the codec reports an invalid payload.
   */
  onInvalidPayload?(error: DecodeErrorInvalidPayload): void;
}

/**
 * Aggregate statistics from a single drain pass.
 */
export interface CommandDrainStats {
  readonly processed: number;
  readonly unknownCommand: number;
  readonly invalidPayload: number;
}

/**
 * Logical producer end of a mailbox.
 */
export interface CommandProducer<C> {
  /**
   * Logical identifier for this mailbox.
   */
  readonly mailboxId: string;

  /**
   * Whether this producer has been closed.
   */
  readonly isClosed: boolean;

  /**
   * Attempt to enqueue a command.
   *
   * @remarks
   * Non-blocking. Never throws on normal backpressure.
   */
  push(command: C): CommandPushResult;

  /**
   * Close this producer. Subsequent `push` calls will return `mailboxClosed`.
   *
   * @remarks
   * Idempotent.
   */
  close(): void;
}

/**
 * Logical consumer end of a mailbox.
 */
export interface CommandConsumer<C> {
  /**
   * Logical identifier for this mailbox.
   */
  readonly mailboxId: string;

  /**
   * Current queue depth in command slots.
   */
  readonly depth: number;

  /**
   * Drain all currently queued commands.
   *
   * @remarks
   * Processes commands in FIFO order until the mailbox is empty.
   */
  drain(hooks: CommandConsumerHooks<C>): CommandDrainStats;
}
