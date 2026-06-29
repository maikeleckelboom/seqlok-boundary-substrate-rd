import { acceptHandoff, bindProcessor } from "@exclave/boundary";

import type { signalsmithStretchLabSpec } from "../boundary/specs";
import type { Handoff } from "@exclave/boundary";

export type StretchWorkletHandoff = Handoff<typeof signalsmithStretchLabSpec>;

export function bindStretchWorkletBoundary(handoff: StretchWorkletHandoff) {
  return bindProcessor(acceptHandoff(handoff));
}
