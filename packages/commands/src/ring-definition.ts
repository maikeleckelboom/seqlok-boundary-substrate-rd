import type { CommandCodec } from "./codec";
import type { SwsrRingLayout } from "@seqlok/primitives";

/**
 * Layout for a command/event ring.
 *
 * Thin alias over the low-level SWSR ring layout.
 */
export type RingLayout = SwsrRingLayout;

export interface RingDefinition<T> {
  readonly mailboxId: string;
  readonly layout: RingLayout;
  readonly codec: CommandCodec<T>;
}

export type CommandRingDefinition<Command> = RingDefinition<Command>;
export type EventRingDefinition<EventPayload> = RingDefinition<EventPayload>;

export interface DefineRingConfig<T> {
  readonly mailboxId: string;
  readonly layout: RingLayout;
  readonly codec: CommandCodec<T>;
}

/**
 * Generic ring definition helper.
 *
 * Used by both `defineCommandRing` and `defineEventRing`.
 */
export function defineRing<T>(config: DefineRingConfig<T>): RingDefinition<T> {
  return config;
}

/**
 * Define a ring that carries structured commands.
 */
export function defineCommandRing<Command>(
  config: DefineRingConfig<Command>,
): CommandRingDefinition<Command> {
  return defineRing(config);
}

/**
 * Define a ring that carries structured event payloads.
 *
 * Uses the same underlying codec abstraction as commands.
 */
export function defineEventRing<EventPayload>(
  config: DefineRingConfig<EventPayload>,
): EventRingDefinition<EventPayload> {
  return defineRing(config);
}
