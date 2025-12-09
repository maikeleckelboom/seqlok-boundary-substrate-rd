import { bench, describe } from "vitest";

import { E2E_BENCH_OPTS } from "../../../scripts/vitest/bench-presets";
import {
  createTicketId,
  type HotswapSchedulerConfig,
  scheduleSwap,
  type SwapTicketRT,
} from "../src";
import {
  HOTSWAP_COMMAND_TAG_INSTALL,
  type HotswapCommand,
} from "../src/commands";
import { createMailboxHotswapDriver } from "../tests/util/hotswap.mailbox-driver";

/**
 * Local engine kind enum for the benchmark.
 *
 * Matches the general pattern used in integration tests:
 * - None = 0
 * - A/B/C are concrete engines.
 */
enum EngineKind {
  None = 0,
  A = 1,
  B = 2,
  C = 3,
}

type Ticket = SwapTicketRT<EngineKind>;
type Command = HotswapCommand<EngineKind>;
type SchedulerConfig = HotswapSchedulerConfig<EngineKind, Command>;

function createTicket(
  id: number,
  engineKind: EngineKind,
  fadeFrames: number,
  preWarmBlocks: number,
): Ticket {
  return {
    ticketId: createTicketId(id),
    engineKind,
    atFrame: 0,
    fadeFrames,
    preWarmBlocks,
  };
}

/**
 * Tiny "lane-like" script:
 *  1. Creates a mailbox-backed hotswap driver
 *  2. Builds a real HotswapSchedulerConfig wired to that mailbox
 *  3. Runs N blocks, occasionally calling scheduleSwap
 *
 * This exercises: scheduleSwap → mailbox → driver.step in one loop.
 */
function runMailboxE2EScript(blocks: number): void {
  const blockFrames = 128;

  const driver = createMailboxHotswapDriver<EngineKind>({
    mailboxId: "lane-0",
    capacity: 64,
    blockFrames,
    initialActiveKind: EngineKind.A,
    noneSentinel: EngineKind.None,
  });

  const schedulerConfig: SchedulerConfig = {
    mailboxId: driver.mailbox.mailboxId,
    producer: driver.mailbox.producer,
    encodeInstallSwap(ticket: Ticket): Command {
      return {
        tag: HOTSWAP_COMMAND_TAG_INSTALL,
        ticket,
      };
    },
    // For this bench we allow swaps regardless of current phase; full
    // reject-while-busy behavior is covered by other tests/benches.
  };

  const ticketAB = createTicket(1, EngineKind.B, 256, 1);
  const ticketBC = createTicket(2, EngineKind.C, 256, 1);

  for (let i = 0; i < blocks; i += 1) {
    // Schedule a couple of swaps at fixed block indices.
    if (i === 10) {
      scheduleSwap(schedulerConfig, ticketAB);
    } else if (i === 200) {
      scheduleSwap(schedulerConfig, ticketBC);
    }

    // Advance RT side by one block: drain mailbox + step swap state.
    driver.step();
  }
}

describe("@seqlok/hotswap – mailbox + slot E2E micro-bench", () => {
  bench(
    "scheduleSwap → mailbox → driver.step: short run",
    () => {
      runMailboxE2EScript(400);
    },
    E2E_BENCH_OPTS,
  );
});
