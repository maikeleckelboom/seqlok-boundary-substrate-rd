import { bench, describe } from "vitest";

import { MICRO_BENCH_OPTS } from "../../../scripts/vitest/bench-presets";
import { initSwapStateRT, stepSwapStateRT } from "../src/spec";
import { swapTestVectors } from "../tests/util/hotswap.vectors";

enum EngineKind {
  None = 0,
  A = 1,
  B = 2,
}

/**
 * @fileoverview
 * RT hot-swap protocol micro-benchmarks.
 *
 * - Uses the same canonical vectors as hotswap.conformance.test.ts
 * - Measures end-to-end cost of driving the state machine from ticket
 *   acceptance back to idle.
 * - Focuses purely on RT protocol cost; no mailbox or scheduler involved.
 */
describe("@seqlok/hotswap – RT protocol micro-benchmarks", () => {
  for (const vector of swapTestVectors) {
    bench(
      `rt-protocol: ${vector.name}`,
      () => {
        // Initialize RT state from the canonical ticket.
        const state = initSwapStateRT<number>(vector.ticket);

        // In these benches we treat engineKind from the ticket as "next",
        // and start with some arbitrary current kind.
        let activeKind: EngineKind = EngineKind.A;
        const nextKind: EngineKind = vector.ticket.engineKind as EngineKind;
        const noneSentinel: EngineKind = EngineKind.None;

        // Same safety margin as the conformance tests: enough steps to
        // complete the protocol without letting TLC-style weirdness sneak in.
        const maxSteps = vector.expectedTransitions.length + 4;

        for (let i = 0; i < maxSteps; i += 1) {
          const decision = stepSwapStateRT(
            state,
            vector.blockFrames,
            activeKind,
            nextKind,
            noneSentinel,
          );

          // Once we retire, the "next" engine becomes active.
          if (decision.kind === "retireNow") {
            activeKind = nextKind;
          }

          // When we are back to idle with no ticket, the protocol is done.
          if (decision.status.phase === "idle" && !state.hasTicket) {
            break;
          }
        }
      },
      MICRO_BENCH_OPTS,
    );
  }
});
