import { describe, expect, it } from "vitest";

import {
  createCommandBus,
  type CommandBusDrainStats,
  type CommandCodec,
  type CommandConsumer,
  type CommandConsumerHooks,
  type CommandDrainStats,
  type DecodeErrorInvalidPayload,
  type DecodeErrorUnknownCommand,
  type DecodeResult,
  createCommandMailbox,
} from "../src";

import type { SwsrRingLayout } from "@seqlok/primitives";

type TestCommand = { kind: "noop" } | { kind: "set"; value: number };

const TEST_CODEC: CommandCodec<TestCommand> = {
  wordsPerSlot: 2,
  encode(command, dst, wordOffset) {
    switch (command.kind) {
      case "noop": {
        dst[wordOffset] = 0;
        dst[wordOffset + 1] = 0;
        return;
      }
      case "set": {
        dst[wordOffset] = 1;
        dst[wordOffset + 1] = command.value;
        return;
      }
    }
  },
  decode(src, wordOffset): DecodeResult<TestCommand> {
    const tag = src[wordOffset];

    if (tag === 0) {
      const command: TestCommand = { kind: "noop" };
      return {
        ok: true,
        command,
      };
    }

    if (tag === 1) {
      // noUncheckedIndexedAccess: index returns number | undefined
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const value = src[wordOffset + 1]!;
      const command: TestCommand = { kind: "set", value };
      return {
        ok: true,
        command,
      };
    }

    return {
      ok: false,
      error: {
        kind: "unknownCommand",
        commandType: `tag:${String(tag)}`,
      },
    };
  },
};

const LAYOUT: SwsrRingLayout = {
  capacity: 8,
  wordsPerSlot: TEST_CODEC.wordsPerSlot,
};

type MockEvent<C> =
  | { kind: "command"; command: C }
  | { kind: "unknown"; error: DecodeErrorUnknownCommand }
  | { kind: "invalid"; error: DecodeErrorInvalidPayload };

function createMockConsumer<C>(
  mailboxId: string,
  script: readonly MockEvent<C>[],
): CommandConsumer<C> {
  let depth = script.length;

  const drain = (hooks: CommandConsumerHooks<C>): CommandDrainStats => {
    let processed = 0;
    let unknownCommand = 0;
    let invalidPayload = 0;

    for (const event of script) {
      switch (event.kind) {
        case "command": {
          processed += 1;
          hooks.onCommand(event.command);
          break;
        }
        case "unknown": {
          unknownCommand += 1;
          hooks.onUnknownCommand?.(event.error);
          break;
        }
        case "invalid": {
          invalidPayload += 1;
          hooks.onInvalidPayload?.(event.error);
          break;
        }
      }
    }

    depth = 0;

    return { processed, unknownCommand, invalidPayload };
  };

  return {
    mailboxId,
    get depth() {
      return depth;
    },
    drain,
  };
}

describe("CommandBus", () => {
  it("fans in commands from multiple sources", () => {
    const bus = createCommandBus<TestCommand>();

    const sourceA = createMockConsumer<TestCommand>("source-a", [
      { kind: "command", command: { kind: "noop" } },
      { kind: "command", command: { kind: "set", value: 1 } },
    ]);

    const sourceB = createMockConsumer<TestCommand>("source-b", [
      { kind: "command", command: { kind: "set", value: 2 } },
    ]);

    bus.addSource("source-a", sourceA);
    bus.addSource("source-b", sourceB);

    const seen: { source: string; command: TestCommand }[] = [];

    const stats: CommandBusDrainStats = bus.drainAll({
      onCommand(command, sourceId) {
        seen.push({ source: sourceId, command });
      },
    });

    expect(bus.sourceCount).toBe(2);
    expect(bus.sourceIds).toEqual(["source-a", "source-b"]);

    expect(stats.totalProcessed).toBe(3);
    expect(stats.totalUnknownCommand).toBe(0);
    expect(stats.totalInvalidPayload).toBe(0);

    const bySource = stats.bySource;
    expect(bySource.get("source-a")).toEqual<CommandDrainStats>({
      processed: 2,
      unknownCommand: 0,
      invalidPayload: 0,
    });
    expect(bySource.get("source-b")).toEqual<CommandDrainStats>({
      processed: 1,
      unknownCommand: 0,
      invalidPayload: 0,
    });

    expect(seen).toEqual([
      { source: "source-a", command: { kind: "noop" } },
      { source: "source-a", command: { kind: "set", value: 1 } },
      { source: "source-b", command: { kind: "set", value: 2 } },
    ]);
  });

  it("propagates decode errors to hooks and stats", () => {
    const bus = createCommandBus<TestCommand>();

    const unknownError: DecodeErrorUnknownCommand = {
      kind: "unknownCommand",
      commandType: "tag:99",
    };

    const invalidError: DecodeErrorInvalidPayload = {
      kind: "invalidPayload",
      commandType: "set",
      reason: "test-invalid",
    };

    const source = createMockConsumer<TestCommand>("source-errors", [
      { kind: "unknown", error: unknownError },
      { kind: "invalid", error: invalidError },
    ]);

    bus.addSource("source-errors", source);

    const seenUnknown: {
      error: DecodeErrorUnknownCommand;
      source: string;
    }[] = [];
    const seenInvalid: {
      error: DecodeErrorInvalidPayload;
      source: string;
    }[] = [];

    const stats = bus.drainAll({
      onCommand() {
        // ignore
      },
      onUnknownCommand(error, sourceId) {
        seenUnknown.push({ error, source: sourceId });
      },
      onInvalidPayload(error, sourceId) {
        seenInvalid.push({ error, source: sourceId });
      },
    });

    expect(stats.totalProcessed).toBe(0);
    expect(stats.totalUnknownCommand).toBe(1);
    expect(stats.totalInvalidPayload).toBe(1);

    const bySource = stats.bySource.get("source-errors");
    expect(bySource).toEqual<CommandDrainStats>({
      processed: 0,
      unknownCommand: 1,
      invalidPayload: 1,
    });

    expect(seenUnknown).toEqual([
      { error: unknownError, source: "source-errors" },
    ]);
    expect(seenInvalid).toEqual([
      { error: invalidError, source: "source-errors" },
    ]);
  });

  it("supports adding and removing sources", () => {
    const bus = createCommandBus<TestCommand>();

    const sourceA = createMockConsumer<TestCommand>("source-a", []);
    const sourceB = createMockConsumer<TestCommand>("source-b", []);

    bus.addSource("source-a", sourceA);
    bus.addSource("source-b", sourceB);

    expect(bus.sourceCount).toBe(2);

    const removedA = bus.removeSource("source-a");
    const removedMissing = bus.removeSource("missing");

    expect(removedA).toBe(true);
    expect(removedMissing).toBe(false);
    expect(bus.sourceCount).toBe(1);
    expect(bus.sourceIds).toEqual(["source-b"]);
  });

  it("throws on duplicate source id", () => {
    const bus = createCommandBus<TestCommand>();

    const sourceA1 = createMockConsumer<TestCommand>("source-a", []);
    const sourceA2 = createMockConsumer<TestCommand>("source-a", []);

    bus.addSource("source-a", sourceA1);

    expect(() => {
      bus.addSource("source-a", sourceA2);
    }).toThrow();
  });
});

describe("CommandBus + Swsr mailbox", () => {
  it("can drain real SWSR mailboxes via the bus", () => {
    const mailbox = createCommandMailbox<TestCommand>({
      mailboxId: "bus-real",
      codec: TEST_CODEC,
      layout: LAYOUT,
    });

    const { producer, consumer } = mailbox;

    producer.push({ kind: "noop" });
    producer.push({ kind: "set", value: 7 });

    const bus = createCommandBus<TestCommand>();
    bus.addSource("bus-real", consumer);

    const seen: TestCommand[] = [];

    const stats = bus.drainAll({
      onCommand(command) {
        seen.push(command);
      },
    });

    expect(stats.totalProcessed).toBe(2);
    expect(stats.totalUnknownCommand).toBe(0);
    expect(stats.totalInvalidPayload).toBe(0);
    expect(seen).toEqual<TestCommand[]>([
      { kind: "noop" },
      { kind: "set", value: 7 },
    ]);
  });
});
