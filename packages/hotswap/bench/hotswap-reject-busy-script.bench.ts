import { bench, describe } from "vitest";

import { E2E_BENCH_OPTS } from "../../../scripts/vitest/bench-presets";
import {
  scheduleSwap,
  type HotswapSchedulerConfig,
  type SwapResult,
} from "../src";
import { createTicketId, type SwapTicketRT } from "../src/spec";

enum EngineKind {
  A = 1,
  B = 2,
  C = 3,
}

interface BenchInstallSwapCommand {
  readonly tag: 1;
  readonly ticket: SwapTicketRT<EngineKind>;
}

/**
 * Minimal mailbox stub that simply counts queued commands.
 */
class BenchMailbox {
  queued = 0;

  push(_cmd: BenchInstallSwapCommand): void {
    this.queued += 1;
  }
}

function createTicket(
  ticketIdNumeric: number,
  engineKind: EngineKind,
): SwapTicketRT<EngineKind> {
  return {
    ticketId: createTicketId(ticketIdNumeric),
    engineKind,
    atFrame: 0,
    fadeFrames: 128,
    preWarmBlocks: 2,
  };
}

/**
 * Synthetic script approximating a Reject-While-Busy workload:
 *
 * 1) Accept A→B swap on an idle lane.
 * 2) While busy, spam B→C requests—all rejected.
 * 3) Simulate swap completion, lane idle again.
 * 4) Accept B→C swap.
 */
function runRejectBusyScript(): { accepted: number; rejected: number } {
  const mailbox = new BenchMailbox();

  let laneBusy = false;
  let accepted = 0;
  let rejected = 0;

  const schedulerConfig: HotswapSchedulerConfig<
    EngineKind,
    BenchInstallSwapCommand
  > = {
    mailboxId: "bench-hotswap",
    producer: {
      mailboxId: "bench-hotswap",
      get isClosed() {
        return false;
      },
      push(cmd) {
        mailbox.push(cmd);
        return { ok: true, queued: mailbox.queued };
      },
      close() {
        /* noop */
      },
    },
    encodeInstallSwap(ticket) {
      return { tag: 1, ticket };
    },
    isLaneBusy() {
      return laneBusy;
    },
  };

  const ticketAB = createTicket(1, EngineKind.B);
  const ticketBC = createTicket(2, EngineKind.C);

  // Idle → accept A→B
  const first: SwapResult = scheduleSwap(schedulerConfig, ticketAB);
  if (first.accepted) {
    accepted += 1;
    laneBusy = true;
  } else {
    rejected += 1;
  }

  // While busy, attempt B→C several times
  for (let i = 0; i < 4; i += 1) {
    const r = scheduleSwap(schedulerConfig, ticketBC);
    if (r.accepted) {
      accepted += 1;
      // Keep lane busy; still rejecting further ones by policy.
    } else {
      rejected += 1;
    }
  }

  // Simulate completion
  laneBusy = false;

  // Now accept B→C
  const finalResult = scheduleSwap(schedulerConfig, ticketBC);
  if (finalResult.accepted) {
    accepted += 1;
    laneBusy = true;
  } else {
    rejected += 1;
  }

  return { accepted, rejected };
}

describe("@seqlok/hotswap – Reject-busy scheduling benchmarks", () => {
  bench(
    "scheduleSwap: mixed accept/reject script (Reject-While-Busy)",
    () => {
      const res = runRejectBusyScript();
      if (res.accepted !== 2 || res.rejected === 0) {
        throw new Error(
          `Unexpected counts: accepted=${String(res.accepted)}, rejected=${String(res.rejected)}`,
        );
      }
    },
    E2E_BENCH_OPTS,
  );
});
