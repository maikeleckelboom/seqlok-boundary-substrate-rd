import type { EngineInstance } from "./engine-bank";
import type { LanePluginPack } from "./lane-plugins";
import type { EngineDefinition } from "../engine/definition";
import type { SpecInput } from "@seqlok/core";

export interface LaneTypeConfig<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
> {
  readonly id: string;
  readonly engine: EngineDefinition<
    S,
    TConfig,
    EngineKindEnum,
    Command,
    EventPayload,
    TInstance
  >;
  /**
   * Optional plugin pack. If omitted, the lane has no plugins.
   */
  readonly plugins?: LanePluginPack<S>;
}

/**
 * Static description of a lane kind (e.g. "stretch", "deck", "bus", "analyzer").
 *
 * This lives purely in the host / topology layer. It does not know about
 * AudioWorklet, stretch contracts, etc.
 */
export interface LaneType<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
> {
  readonly id: string;
  readonly engine: EngineDefinition<
    S,
    TConfig,
    EngineKindEnum,
    Command,
    EventPayload,
    TInstance
  >;
  readonly plugins: LanePluginPack<S>;
}

/**
 * Define a lane type for a given engine family and plugin pack.
 *
 * Example (in seqlok-stretch):
 *
 *   export const StretchLaneType = defineLaneType({
 *     id: "dekzer.lane.stretch",
 *     engine: stretchEngine,
 *     plugins: stretchPlugins,
 *   });
 */
export function defineLaneType<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
>(
  config: LaneTypeConfig<
    S,
    TConfig,
    EngineKindEnum,
    Command,
    EventPayload,
    TInstance
  >,
): LaneType<S, TConfig, EngineKindEnum, Command, EventPayload, TInstance> {
  const { id, engine, plugins } = config;

  const effectivePlugins: LanePluginPack<S> = plugins ?? {
    observers: [],
    processors: [],
  };

  return {
    id,
    engine,
    plugins: effectivePlugins,
  };
}
