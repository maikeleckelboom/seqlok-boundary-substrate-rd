import { describe, expect, it } from "vitest";

import { bindObserver, defineSpec } from "../../src";
import { bindingsFromSpec } from "../helpers/binding";

describe("expanded spec kinds", () => {
  it("exposes nested aliases for processor param reads", () => {
    const spec = defineSpec(({ param }) => ({
      id: "nested-processor-read-aliases",
      params: {
        runtime: {
          enabled: param.bool(),
          payload: param.u8.array(4),
        },
      },
    }));

    const { ctl, proc } = bindingsFromSpec(spec);

    ctl.params.set("runtime.enabled", true);
    ctl.params.stage("runtime.payload", (view) => {
      view.set([1, 2, 3, 4]);
    });

    proc.params.within((params) => {
      expect(params.runtime.enabled).toBe(true);
      expect(params.runtime.payload).toBeInstanceOf(Uint8Array);
      expect(params.runtime.payload[1]).toBe(2);
    });
  });

  it("round-trips u32 and byte-width array params through controller, processor, observer, and handoff", () => {
    const spec = defineSpec(({ param, meter }) => ({
      id: "expanded-param-kinds",
      params: {
        count: param.u32({ min: 0, max: 0xffffffff }),
        words: param.u32.array(3),
        raw: param.u8.array(4),
        signed8: param.i8.array(4),
        signed16: param.i16.array(3),
        unsigned16: param.u16.array(3),
      },
      meters: {
        pulse: meter.u32(),
      },
    }));

    const { accepted, ctl, proc } = bindingsFromSpec(spec);

    ctl.params.set("count", 0xffffffff);
    ctl.params.stage("words", (view) => {
      view.set([1, 0xffffffff, 7]);
    });
    ctl.params.stage("raw", (view) => {
      view.set([1, 255, 3, 4]);
    });
    ctl.params.stage("signed8", (view) => {
      view.set([-1, -2, 3, 4]);
    });
    ctl.params.stage("signed16", (view) => {
      view.set([-300, 0, 300]);
    });
    ctl.params.stage("unsigned16", (view) => {
      view.set([0, 65535, 32]);
    });

    proc.params.within((view) => {
      expect(view.count).toBe(0xffffffff);
      expect(view.words).toBeInstanceOf(Uint32Array);
      expect(view.words[1]).toBe(0xffffffff);
      expect(view.raw).toBeInstanceOf(Uint8Array);
      expect(view.raw[1]).toBe(255);
      expect(view.signed8).toBeInstanceOf(Int8Array);
      expect(view.signed8[0]).toBe(-1);
      expect(view.signed16).toBeInstanceOf(Int16Array);
      expect(view.signed16[0]).toBe(-300);
      expect(view.unsigned16).toBeInstanceOf(Uint16Array);
      expect(view.unsigned16[1]).toBe(65535);
    });

    const snapshot = ctl.params.snapshot();
    expect(snapshot.words).toBeInstanceOf(Uint32Array);
    expect(snapshot.raw).toBeInstanceOf(Uint8Array);
    expect(snapshot.signed8).toBeInstanceOf(Int8Array);
    expect(snapshot.signed16).toBeInstanceOf(Int16Array);
    expect(snapshot.unsigned16).toBeInstanceOf(Uint16Array);

    const observer = bindObserver(accepted);
    expect(observer.params.snapshot(["words"]).words).toBeInstanceOf(
      Uint32Array,
    );
    observer.dispose();
  });

  it("supports i32, enum, bool, and u32 scalar meters", () => {
    const spec = defineSpec(({ param, meter }) => ({
      id: "expanded-meter-kinds",
      params: {
        ready: param.bool(),
      },
      meters: {
        signed: meter.i32(),
        state: meter.enum(["idle", "busy", "fault"]),
        ok: meter.bool(),
        frames: meter.u32(),
      },
    }));

    const { ctl, proc } = bindingsFromSpec(spec);

    proc.meters.publish((writer) => {
      writer.signed(-42);
      writer.state(2);
      writer.ok(true);
      writer.frames(0xffffffff);
    });

    const snapshot = ctl.meters.snapshot();
    expect(snapshot.signed).toBe(-42);
    expect(snapshot.state).toBe(2);
    expect(snapshot.ok).toBe(true);
    expect(snapshot.frames).toBe(0xffffffff);
  });
});
