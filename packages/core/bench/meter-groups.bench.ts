import { bench, describe } from "vitest";

import {
  acceptHandoff,
  allocatePacked,
  bindController,
  bindProcessor,
  buildHandoff,
  defineSpec,
  planLayout,
} from "../src";
import { MICRO_BENCH_OPTS } from "../vitest.config";

import type { MeterGroupValues } from "../src";

describe("Meter group publishing", () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: "bench/meter-groups",
    params: {
      dummy: param.f32({ min: 0, max: 1 }),
    },
    meters: {
      levels: {
        flags: meter.u32.array(4),
        hold: meter.f64(),
        spectrum: meter.f32.array(64),
      },
      runtime: {
        active: meter.bool(),
        blockSamples: meter.u32(),
        peak: meter.f32(),
        state: meter.enum(["idle", "running"]),
      },
    },
  }));

  const plan = planLayout(spec);
  const backing = allocatePacked(plan);
  const controller = bindController(spec, plan, backing);
  const handoff = buildHandoff(plan, backing);
  const accepted = acceptHandoff(handoff);
  const processor = bindProcessor(accepted);

  controller.params.set("dummy", 0.5);

  const scalarGroupValues = {
    active: true,
    blockSamples: 128,
    peak: 0.75,
    state: 1,
  } satisfies MeterGroupValues<typeof spec, "runtime">;

  const mixedGroupValues = {
    flags: Uint32Array.from([1, 2, 3, 4]),
    hold: Math.PI,
    spectrum: Float32Array.from({ length: 64 }, (_, index) => index / 64),
  } satisfies MeterGroupValues<typeof spec, "levels">;

  bench(
    "meter groups: repeated writer.set scalar writes",
    () => {
      processor.meters.publish((writer) => {
        writer.set("runtime.active", scalarGroupValues.active);
        writer.set("runtime.blockSamples", scalarGroupValues.blockSamples);
        writer.set("runtime.peak", scalarGroupValues.peak);
        writer.set("runtime.state", scalarGroupValues.state);
      });
    },
    MICRO_BENCH_OPTS,
  );

  bench(
    "meter groups: writer.setGroup scalar group",
    () => {
      processor.meters.publish((writer) => {
        writer.setGroup("runtime", scalarGroupValues);
      });
    },
    MICRO_BENCH_OPTS,
  );

  bench(
    "meter groups: meters.publishGroup scalar group",
    () => {
      processor.meters.publishGroup("runtime", scalarGroupValues);
    },
    MICRO_BENCH_OPTS,
  );

  bench(
    "meter groups: writer.setGroup mixed scalar plus array group",
    () => {
      processor.meters.publish((writer) => {
        writer.setGroup("levels", mixedGroupValues);
      });
    },
    MICRO_BENCH_OPTS,
  );
});
