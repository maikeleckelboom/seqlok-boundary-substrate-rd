/**
 * @fileoverview
 * Public surface for the `@seqlok/commands` package.
 *
 * @remarks
 * This package currently exposes:
 *
 * - The `commands.*` error domain for command transport.
 * - Core contracts for command codecs and logical mailboxes.
 * - A SWSR ring-backed command mailbox and fan-in bus.
 */

export {
  COMMANDS,
  COMMANDS_ERRORS,
  createCommandsError,
} from "./errors/commands";

export type {
  CommandsError,
  CommandsErrorCode,
  CommandsErrorDetailsByKey,
  CommandsErrorFactory,
  CommandsErrorKey,
  CommandsInvalidPayloadDetails,
  CommandsMailboxClosedDetails,
  CommandsRingOverflowDetails,
  CommandsUnknownCommandDetails,
} from "./errors/commands";

export type {
  CommandCodec,
  DecodeError,
  DecodeErrorInvalidPayload,
  DecodeErrorUnknownCommand,
  DecodeResult,
} from "./codec";

export { isDecodeError } from "./codec";

// Transport-agnostic mailbox contracts
export type {
  BaseCommandMailboxConfig,
  CommandConsumer,
  CommandConsumerHooks,
  CommandDrainStats,
  CommandProducer,
  CommandPushResult,
} from "./mailbox";

// SWSR-backed mailbox types and functions
export type { CommandMailboxConfig, CommandMailbox } from "./swsr-mailbox";

export {
  createCommandMailbox,
  attachCommandProducer,
  attachCommandConsumer,
} from "./swsr-mailbox";

// Command bus over multiple consumers
export type { CommandBus, CommandBusDrainStats, CommandBusHooks } from "./bus";

export { createCommandBus } from "./bus";

// Ring definition helpers
export type {
  RingLayout,
  RingDefinition,
  CommandRingDefinition,
  EventRingDefinition,
  DefineRingConfig,
} from "./ring-definition";
export {
  defineRing,
  defineCommandRing,
  defineEventRing,
} from "./ring-definition";
