import {
  defineSpec,
  type ParamBuilders,
  type MeterBuilders,
  type SpecInput,
} from "@seqlok/core";

import type { EngineInstance } from "../lane/engine-bank";
import type {
  CommandRingDefinition,
  EventRingDefinition,
} from "@seqlok/commands";

export interface EngineSpecBuilders {
  readonly param: ParamBuilders;
  readonly meter: MeterBuilders;
}

export type EngineSpecBuilder<S extends SpecInput> = (
  builders: EngineSpecBuilders,
) => S;

export interface EngineConstructorOptions<S extends SpecInput, TConfig> {
  readonly spec: S;
  readonly config: TConfig;
}

/**
 * Host-side engine constructor.
 *
 * - `S`: spec type (result of `defineSpec`)
 * - `TConfig`: structural/configuration type for this engine family
 * - `EngineKindEnum`: numeric enum representing engine kinds
 * - `TInstance`: concrete engine instance type
 */
export type EngineConstructor<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  TInstance extends EngineInstance<EngineKindEnum>,
> = (
  kind: EngineKindEnum,
  options: EngineConstructorOptions<S, TConfig>,
) => TInstance;

export interface DefineEngineConfig<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
> {
  readonly id: string;
  readonly kinds: readonly EngineKindEnum[];
  readonly defaultKind: EngineKindEnum;

  /**
   * Spec builder, used to materialize the shared-state spec via `defineSpec`.
   */
  readonly buildSpec: EngineSpecBuilder<S>;

  /**
   * Host-side constructor that wraps the low-level DSP factory.
   */
  readonly createInstance: EngineConstructor<
    S,
    TConfig,
    EngineKindEnum,
    TInstance
  >;

  readonly commandRing?: CommandRingDefinition<Command>;
  readonly eventRing?: EventRingDefinition<EventPayload>;
}

export interface EngineDefinition<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
> {
  readonly id: string;
  readonly kinds: readonly EngineKindEnum[];
  readonly defaultKind: EngineKindEnum;

  /**
   * Returns the spec input for this engine family.
   *
   * Lazily calls `defineSpec(buildSpec)` the first time and caches the result.
   */
  readonly toSpecInput: () => S;

  /**
   * Host-side engine constructor.
   */
  readonly createInstance: EngineConstructor<
    S,
    TConfig,
    EngineKindEnum,
    TInstance
  >;

  /**
   * Optional command ring definition for this engine family.
   *
   * When undefined, the engine does not use a command ring.
   */
  readonly commandRing: CommandRingDefinition<Command> | undefined;

  /**
   * Optional event ring definition for this engine family.
   *
   * When undefined, the engine does not use an event ring.
   */
  readonly eventRing: EventRingDefinition<EventPayload> | undefined;
}

/**
 * Define a host-side engine family.
 *
 * This layer is generic over:
 * - spec DSL (`buildSpec`)
 * - configuration (`TConfig`)
 * - engine kinds (`EngineKindEnum`)
 * - command / event shapes
 * - concrete engine instance type
 */
export function defineEngine<
  S extends SpecInput,
  TConfig,
  EngineKindEnum extends number,
  Command,
  EventPayload,
  TInstance extends EngineInstance<EngineKindEnum>,
>(
  config: DefineEngineConfig<
    S,
    TConfig,
    EngineKindEnum,
    Command,
    EventPayload,
    TInstance
  >,
): EngineDefinition<
  S,
  TConfig,
  EngineKindEnum,
  Command,
  EventPayload,
  TInstance
> {
  const {
    id,
    kinds,
    defaultKind,
    buildSpec,
    createInstance,
    commandRing,
    eventRing,
  } = config;

  let cachedSpec: S | undefined;

  const toSpecInput = (): S => {
    if (cachedSpec !== undefined) {
      return cachedSpec;
    }
    const spec = defineSpec(buildSpec);
    cachedSpec = spec;
    return spec;
  };

  return {
    id,
    kinds,
    defaultKind,
    toSpecInput,
    createInstance,
    commandRing,
    eventRing,
  };
}
