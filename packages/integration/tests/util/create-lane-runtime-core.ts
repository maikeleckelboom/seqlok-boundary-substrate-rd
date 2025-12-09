import { createCommandMailbox } from "@seqlok/commands";
import {
  createHotswapCommandCodec,
  HOTSWAP_COMMAND_TAG_INSTALL,
  HOTSWAP_COMMAND_WORDS_PER_SLOT,
  type HotswapCommand,
  type HotswapSchedulerConfig,
  type SwapTicketRT,
} from "@seqlok/hotswap";

import {
  createHotswapSlotDriver,
  createSlicerState,
  type TimelineCommand,
  type TimelineDriver,
} from "../../src";

/**
 * Runtime core for a single lane:
 *
 * - CommandMailbox (SWSR ring)
 * - HotswapSlotDriver
 * - TimelineDriver
 * - Host-side HotswapSchedulerConfig (for scheduleSwap)
 *
 * This is generic in EngineKindEnum so different harnesses
 * (timeline-only vs engine-bank) can plug in their own engine enums.
 */
export interface LaneRuntimeCore<EngineKindEnum extends number> {
  readonly mailbox: {
    readonly producer: ReturnType<typeof createCommandMailbox>["producer"];
    readonly consumer: ReturnType<typeof createCommandMailbox>["consumer"];
  };

  readonly timeline: TimelineDriver<EngineKindEnum>;
  readonly hotswapSlot: ReturnType<typeof createHotswapSlotDriver>;
  readonly schedulerConfig: HotswapSchedulerConfig<
    EngineKindEnum,
    HotswapCommand<EngineKindEnum>
  >;
}

/**
 * Construct a lane runtime core for tests.
 *
 * This mirrors what a real lane would wire up:
 * - Mailbox with hotswap command codec
 * - Timeline driver with hotswap slot
 * - Scheduler config that:
 *   - encodes installSwap commands into the mailbox
 *   - enforces Level 2.5 "reject-while-busy" using isLaneBusy
 */
export function createLaneRuntimeCore<EngineKindEnum extends number>(
  mailboxId: string,
): LaneRuntimeCore<EngineKindEnum> {
  const codec = createHotswapCommandCodec<EngineKindEnum>();

  const mailbox = createCommandMailbox<HotswapCommand<EngineKindEnum>>({
    mailboxId,
    codec,
    layout: {
      capacity: 16,
      wordsPerSlot: HOTSWAP_COMMAND_WORDS_PER_SLOT,
    },
  });

  const hotswapSlot = createHotswapSlotDriver<EngineKindEnum>();

  const timeline: TimelineDriver<EngineKindEnum> = {
    frame: 0,
    isPlaying: true,
    slicer: createSlicerState<TimelineCommand<EngineKindEnum>>(),
    hotswapSlot,
  };

  const schedulerConfig: HotswapSchedulerConfig<
    EngineKindEnum,
    HotswapCommand<EngineKindEnum>
  > = {
    mailboxId,
    producer: mailbox.producer,
    encodeInstallSwap(
      ticket: SwapTicketRT<EngineKindEnum>,
    ): HotswapCommand<EngineKindEnum> {
      return {
        tag: HOTSWAP_COMMAND_TAG_INSTALL,
        ticket,
      };
    },

    /**
     * Level 2.5 "Reject While Busy" hook.
     *
     * For the tests we approximate "lane busy" as:
     *   - there is slot state, AND
     *   - the current phase is non-idle.
     *
     * This lets us:
     *   - reject overlapping swaps while a fade is in-flight, and
     *   - accept a new swap once we have idled on the previous ticket
     *     (so A→B→C sequential swaps work).
     *
     * In a real host, this would be driven by a lane-status mirror
     * updated from the RT thread (e.g. via introspect snapshots).
     */
    isLaneBusy(): boolean {
      const state = hotswapSlot.state;
      if (state === null) {
        return false;
      }
      return state.phase !== "idle";
    },
  };

  return {
    mailbox: {
      producer: mailbox.producer,
      consumer: mailbox.consumer,
    },
    timeline,
    hotswapSlot,
    schedulerConfig,
  };
}
