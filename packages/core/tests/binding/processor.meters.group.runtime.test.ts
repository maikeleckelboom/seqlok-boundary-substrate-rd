import { describe, expect, it } from "vitest";

import { defineSpec } from "../../src";
import { bindingsFromSpec } from "../helpers/binding";

describe("ProcessorMeters grouped publishing", () => {
  const spec = defineSpec(({ meter }) => ({
    id: "group-runtime",
    meters: {
      runtime: {
        active: meter.bool(),
        count: meter.u32(),
        peak: meter.f32(),
      },
      levels: {
        flags: meter.u32.array(3),
        hold: meter.f64(),
        spectrum: meter.f32.array(4),
      },
    },
  }));

  it("commits writer.setGroup values inside one publish transaction", () => {
    const { ctl, proc } = bindingsFromSpec(spec);
    const startVersion = ctl.meters.version();

    proc.meters.publish((writer) => {
      writer.setGroup("runtime", {
        active: true,
        count: 42,
        peak: 0.5,
      });
      writer.setGroup("levels", {
        flags: Uint32Array.from([1, 2, 3]),
        hold: Math.PI,
        spectrum: Float32Array.from([0, 0.25, 0.5, 1]),
      });
    });

    expect(ctl.meters.version()).toBe(startVersion + 1);

    const meters = ctl.meters.snapshot(
      "runtime.active",
      "runtime.count",
      "runtime.peak",
      "levels.flags",
      "levels.hold",
      "levels.spectrum",
    );

    expect(meters["runtime.active"]).toBe(true);
    expect(meters["runtime.count"]).toBe(42);
    expect(meters["runtime.peak"]).toBeCloseTo(0.5);
    expect(meters["levels.hold"]).toBeCloseTo(Math.PI);
    expect(Array.from(meters["levels.flags"])).toEqual([1, 2, 3]);
    expect(Array.from(meters["levels.spectrum"])).toEqual([0, 0.25, 0.5, 1]);
  });

  it("publishes one group through meters.publishGroup", () => {
    const { ctl, proc } = bindingsFromSpec(spec);
    const startVersion = ctl.meters.version();

    proc.meters.publishGroup("runtime", {
      active: false,
      count: 7,
      peak: 0.125,
    });

    expect(ctl.meters.version()).toBe(startVersion + 1);

    const meters = ctl.meters.snapshot(
      "runtime.active",
      "runtime.count",
      "runtime.peak",
    );

    expect(meters["runtime.active"]).toBe(false);
    expect(meters["runtime.count"]).toBe(7);
    expect(meters["runtime.peak"]).toBeCloseTo(0.125);
  });

  it("rejects writer.setGroup array values with the wrong length before writing the group", () => {
    const { ctl, proc } = bindingsFromSpec(spec);

    proc.meters.publishGroup("levels", {
      flags: Uint32Array.from([1, 2, 3]),
      hold: 2,
      spectrum: Float32Array.from([0, 0.25, 0.5, 1]),
    });

    expect(() => {
      proc.meters.publish((writer) => {
        writer.setGroup("levels", {
          flags: Uint32Array.from([4, 5, 6]),
          hold: 9,
          spectrum: Float32Array.from([1, 2]),
        });
      });
    }).toThrow(/length/i);

    const meters = ctl.meters.snapshot(
      "levels.flags",
      "levels.hold",
      "levels.spectrum",
    );

    expect(Array.from(meters["levels.flags"])).toEqual([1, 2, 3]);
    expect(meters["levels.hold"]).toBe(2);
    expect(Array.from(meters["levels.spectrum"])).toEqual([0, 0.25, 0.5, 1]);
  });

  it("rejects publishGroup array values with the wrong length without bumping MU", () => {
    const { ctl, proc } = bindingsFromSpec(spec);

    proc.meters.publishGroup("levels", {
      flags: Uint32Array.from([1, 2, 3]),
      hold: 2,
      spectrum: Float32Array.from([0, 0.25, 0.5, 1]),
    });

    const startVersion = ctl.meters.version();

    expect(() => {
      proc.meters.publishGroup("levels", {
        flags: Uint32Array.from([4, 5, 6]),
        hold: 9,
        spectrum: Float32Array.from([1, 2]),
      });
    }).toThrow(/length/i);

    expect(ctl.meters.version()).toBe(startVersion);

    const meters = ctl.meters.snapshot(
      "levels.flags",
      "levels.hold",
      "levels.spectrum",
    );

    expect(Array.from(meters["levels.flags"])).toEqual([1, 2, 3]);
    expect(meters["levels.hold"]).toBe(2);
    expect(Array.from(meters["levels.spectrum"])).toEqual([0, 0.25, 0.5, 1]);
  });
});
