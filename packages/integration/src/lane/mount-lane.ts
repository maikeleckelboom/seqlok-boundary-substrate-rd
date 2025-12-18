import { bindObserver, bindProcessor } from "@seqlok/core";

import { createLaneRuntimeCore } from "./runtime-core";

import type { EngineInstance } from "./engine-bank";
import type { LaneType } from "./lane-type";
import type { LaneRuntimeCore } from "./runtime-core";
import type {
  ObserverBinding,
  ProcessorBinding,
  ReceivedHandoff,
  SpecInput,
} from "@seqlok/core";

/**
 * Options for mounting a lane in a worklet/worker.
 *
 * @remarks
 * - `mailboxId` is passed through to `createLaneRuntimeCore` so the lane
 *   can receive hotswap commands via the shared mailbox.
 * - `handoff` is the `ReceivedHandoff` for this lane, typically constructed
 *   from a `Handoff` built on the host side.
 */
export interface MountLaneOptions<S extends SpecInput> {
  readonly mailboxId: string;
  readonly handoff: ReceivedHandoff<S>;
}

/**
 * Mounted lane handle.
 *
 * @remarks
 * - Exposes the `LaneRuntimeCore` for transport/hotswap plumbing.
 * - Exposes observer + processor bindings for direct param/meter access.
 * - Aggregates all processor plugins into a single `processBlock` function.
 */
export interface MountedLane<
  S extends SpecInput,
  EngineKindEnum extends number,
> {
  readonly laneTypeId: string;

  readonly runtime: LaneRuntimeCore<EngineKindEnum>;
  readonly observer: ObserverBinding<S>;
  readonly processor: ProcessorBinding<S>;

  /**
   * Invoke all processor plugins for a single audio block.
   *
   * @remarks
   * - All plugins see the same I/O buffers and can mutate them in-place.
   * - In the common case there is a single processor plugin (e.g. stretch).
   */
  readonly processBlock: (
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array,
  ) => void;

  /**
   * Dispose processor-side plugin handles, in reverse registration order.
   */
  readonly dispose: () => void;
}

interface ProcessorHandle {
  readonly processBlock: (
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array,
  ) => void;
  readonly dispose?: () => void;
}

/**
 * Mount a lane type against a `ReceivedHandoff` and mailbox id.
 *
 * @remarks
 * - Intended to be called on the RT side (AudioWorklet / worker).
 * - Creates `ObserverBinding` + `ProcessorBinding` from the handoff.
 * - Wires all observer plugins once.
 * - Wires all processor plugins once and aggregates their `processBlock`.
 * - Creates a `LaneRuntimeCore` for this lane so transport/hotswap
 *   can be layered on top.
 */
export function mountLane<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
>(
  laneType: LaneType<
    S,
    TConfig,
    EngineKindEnum,
    Command,
    EventPayload,
    TInstance
  >,
  options: MountLaneOptions<S>,
): MountedLane<S, EngineKindEnum> {
  const { mailboxId, handoff } = options;

  const runtime = createLaneRuntimeCore<EngineKindEnum>(mailboxId);

  const observer = bindObserver<S>(handoff);
  const processor = bindProcessor<S>(handoff);

  // One-shot observer wiring
  for (const plugin of laneType.plugins.observers) {
    plugin.attachObserver?.(observer);
  }

  // Processor plugin handles (RT side)
  const processorHandles: ProcessorHandle[] = laneType.plugins.processors.map(
    (plugin) => plugin.attachProcessor(processor),
  );

  const processBlock = (
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array,
  ): void => {
    for (const handle of processorHandles) {
      handle.processBlock(inputL, inputR, outputL, outputR);
    }
  };

  const dispose = (): void => {
    for (let i = processorHandles.length - 1; i >= 0; i -= 1) {
      const handle = processorHandles[i];
      if (handle?.dispose === undefined) {
        continue;
      }
      handle.dispose();
    }
  };

  return {
    laneTypeId: laneType.id,
    runtime,
    observer,
    processor,
    processBlock,
    dispose,
  };
}
