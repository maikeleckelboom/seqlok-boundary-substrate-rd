import { describe, expect, it } from "vitest";

import {
  allocatePacked,
  bindController,
  bindObserver,
  bindProcessor,
  defineSpec,
  planLayout,
} from "../../src";
import { isBoundaryError } from "../../src/errors/error";

describe("binding invalid argument errors", () => {
  const spec = defineSpec(({ param }) => ({
    id: "invalid-binding-args",
    params: {
      gain: param.f32({ min: 0, max: 1 }),
    },
  }));

  it("throws binding.invalidArgs for missing controller plan/backing", () => {
    let thrown: unknown;
    try {
      bindController(spec as never);
    } catch (error) {
      thrown = error;
    }

    expect(isBoundaryError(thrown)).toBe(true);
    if (isBoundaryError(thrown)) {
      expect(thrown.code).toBe("binding.invalidArgs");
      expect(thrown.details.fn).toBe("bindController");
      expect(thrown.details.reason).toBe("missingPlan");
    }
  });

  it("throws binding.invalidArgs for missing processor backing", () => {
    const plan = planLayout(spec);
    let thrown: unknown;
    try {
      bindProcessor(plan as never);
    } catch (error) {
      thrown = error;
    }

    expect(isBoundaryError(thrown)).toBe(true);
    if (isBoundaryError(thrown)) {
      expect(thrown.code).toBe("binding.invalidArgs");
      expect(thrown.details.fn).toBe("bindProcessor");
      expect(thrown.details.reason).toBe("missingBacking");
    }
  });

  it("throws binding.invalidArgs for missing observer backing", () => {
    const plan = planLayout(spec);
    let thrown: unknown;
    try {
      bindObserver(spec, plan);
    } catch (error) {
      thrown = error;
    }

    expect(isBoundaryError(thrown)).toBe(true);
    if (isBoundaryError(thrown)) {
      expect(thrown.code).toBe("binding.invalidArgs");
      expect(thrown.details.fn).toBe("bindObserver");
      expect(thrown.details.reason).toBe("missingBacking");
    }
  });

  it("accepts explicit controller triple, processor plan/backing, and observer triple", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);

    const controller = bindController(spec, plan, backing);
    const processor = bindProcessor(plan, backing);
    const observer = bindObserver(spec, plan, backing);

    controller.params.set("gain", 0.75);
    processor.params.within((params) => {
      expect(params.gain).toBeCloseTo(0.75);
    });
    expect(observer.params.snapshot(["gain"]).gain).toBeCloseTo(0.75);

    observer.dispose();
    processor.dispose();
    controller.dispose();
  });
});
