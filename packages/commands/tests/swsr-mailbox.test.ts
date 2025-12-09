import { describe, expect, it } from "vitest";

import {
  type CommandCodec,
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

describe("SwsrCommandMailbox", () => {
  it("round-trips commands through the ring", () => {
    const mailbox = createCommandMailbox<TestCommand>({
      mailboxId: "test",
      codec: TEST_CODEC,
      layout: LAYOUT,
    });

    const { producer, consumer } = mailbox;

    const r1 = producer.push({ kind: "noop" });
    const r2 = producer.push({ kind: "set", value: 42 });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const seen: TestCommand[] = [];

    const stats = consumer.drain({
      onCommand(command) {
        seen.push(command);
      },
    });

    expect(stats.processed).toBe(2);
    expect(stats.unknownCommand).toBe(0);
    expect(stats.invalidPayload).toBe(0);
    expect(seen).toEqual<TestCommand[]>([
      { kind: "noop" },
      { kind: "set", value: 42 },
    ]);
  });

  it("reports overflow via CommandPushResult", () => {
    const tinyLayout: SwsrRingLayout = {
      capacity: 2,
      wordsPerSlot: TEST_CODEC.wordsPerSlot,
    };

    const mailbox = createCommandMailbox<TestCommand>({
      mailboxId: "overflow-test",
      codec: TEST_CODEC,
      layout: tinyLayout,
    });

    const { producer } = mailbox;

    const results = [
      producer.push({ kind: "noop" }),
      producer.push({ kind: "noop" }),
      producer.push({ kind: "noop" }),
      producer.push({ kind: "noop" }),
    ];

    const hasOverflow = results.some((result) => !result.ok);

    expect(hasOverflow).toBe(true);
  });

  it("panics on wordsPerSlot mismatch", () => {
    const badLayout: SwsrRingLayout = {
      capacity: 4,
      wordsPerSlot: TEST_CODEC.wordsPerSlot + 1,
    };

    expect(() => {
      createCommandMailbox<TestCommand>({
        mailboxId: "bad-layout",
        codec: TEST_CODEC,
        layout: badLayout,
      });
    }).toThrow();
  });
});
