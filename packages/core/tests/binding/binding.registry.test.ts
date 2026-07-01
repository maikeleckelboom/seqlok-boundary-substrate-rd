import { beforeEach, describe, expect, it } from "vitest";

import { allocatePacked } from "../../src/backing/allocate-packed";
import {
  claimBinding,
  clearBindingRegistry,
  getBindingState,
  noteBinding,
  releaseBinding,
} from "../../src/binding/common/registry";
import { bindController } from "../../src/binding/controller";
import { bindObserver } from "../../src/binding/observer";
import { bindProcessor } from "../../src/binding/processor";
import { buildHandoff } from "../../src/handoff/handoff";
import { planLayout } from "../../src/plan/layout";
import { defineSpec } from "../../src/spec/define";

import type { Backing } from "../../src/backing/types";

/**
 * Creates a minimal Backing stub for registry identity testing.
 */
function backingStub(): Backing {
  return {
    kind: "packed",
    sab: new SharedArrayBuffer(8),
  };
}

function packedBackingFromBuffer(sab: SharedArrayBuffer): Backing {
  return {
    kind: "packed",
    sab,
  };
}

/**
 * Tests for the binding registry which manages shared state between
 * controller, processor and observer roles.
 *
 * Verifies role-based access control and lifecycle management of bindings.
 */
describe("Binding Registry: Global State Management", () => {
  const spec = defineSpec(({ param, meter }) => ({
    id: "binding-registry",
    params: {
      rate: param.f32({ min: 0, max: 2 }),
    },
    meters: {
      peak: meter.f32(),
    },
  }));

  beforeEach(() => {
    clearBindingRegistry();
  });

  it("manages role lifecycle with note/release operations", () => {
    const backing = backingStub();

    expect(getBindingState(backing)).toBeUndefined();

    // Add controller role
    noteBinding(backing, "controller");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false, observer: false },
    });

    // Add processor role (dual binding)
    noteBinding(backing, "processor");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true, observer: false },
    });

    // Add observer role
    noteBinding(backing, "observer");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true, observer: true },
    });

    // Release controller
    releaseBinding(backing, "controller");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: true, observer: true },
    });

    // Release processor
    releaseBinding(backing, "processor");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: false, observer: true },
    });

    // Release observer (last role) -> entry cleanup
    releaseBinding(backing, "observer");
    expect(getBindingState(backing)).toBeUndefined();
  });

  it("enforces role exclusivity while allowing cross-role bindings", () => {
    const backing = backingStub();

    // First claim should succeed
    claimBinding(backing, "controller");

    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false, observer: false },
    });

    // Duplicate claim should fail
    expect(() => {
      claimBinding(backing, "controller");
    }).toThrow(/exclusive binding already exists/i);

    // State remains unchanged after failed claim
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false, observer: false },
    });

    // Cross-role binding is allowed (processor)
    claimBinding(backing, "processor");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true, observer: false },
    });

    // Observer is also allowed alongside controller + processor
    noteBinding(backing, "observer");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true, observer: true },
    });
  });

  it("gracefully handles idempotent releases and unknown backings", () => {
    const backing = backingStub();

    // Releases on non-existent binding are safe
    releaseBinding(backing, "controller");
    releaseBinding(backing, "processor");
    releaseBinding(backing, "observer");
    expect(getBindingState(backing)).toBeUndefined();

    // Set up test state
    noteBinding(backing, "processor");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: true, observer: false },
    });

    // Releasing a role that was never set is a no-op
    releaseBinding(backing, "observer");
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: true, observer: false },
    });

    // First release removes the processor role and clears the entry
    releaseBinding(backing, "processor");
    expect(getBindingState(backing)).toBeUndefined();

    // Additional releases remain no-ops
    releaseBinding(backing, "processor");
    releaseBinding(backing, "observer");
    expect(getBindingState(backing)).toBeUndefined();
  });

  it("keys packed bindings by their SharedArrayBuffer identity", () => {
    const sab = new SharedArrayBuffer(8);
    const firstWrapper = packedBackingFromBuffer(sab);
    const secondWrapper = packedBackingFromBuffer(sab);

    claimBinding(firstWrapper, "processor");

    expect(getBindingState(secondWrapper)).toEqual({
      roles: { controller: false, processor: true, observer: false },
    });
    expect(() => {
      claimBinding(secondWrapper, "processor");
    }).toThrow(/exclusive binding already exists/i);
  });

  it("rejects double processor binding for the same explicit backing", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const processor = bindProcessor(plan, backing);

    expect(() => {
      bindProcessor(plan, backing);
    }).toThrow(/exclusive binding already exists/i);

    processor.dispose();
  });

  it("rejects double processor binding through the same handoff", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const handoff = buildHandoff(plan, backing);
    const processor = bindProcessor(handoff);

    expect(() => {
      bindProcessor(handoff);
    }).toThrow(/exclusive binding already exists/i);

    processor.dispose();
  });

  it("rejects double controller binding for packed backing", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const controller = bindController(spec, plan, backing);

    expect(() => {
      bindController(spec, plan, backing);
    }).toThrow(/exclusive binding already exists/i);

    controller.dispose();
  });

  it("allows one controller and one processor on the same backing", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const controller = bindController(spec, plan, backing);
    const processor = bindProcessor(plan, backing);

    expect(controller.params.version()).toBe(0);
    expect(processor.params.version()).toBe(0);

    processor.dispose();
    controller.dispose();
  });

  it("keeps observer bindings non-exclusive", () => {
    const plan = planLayout(spec);
    const backing = allocatePacked(plan);
    const first = bindObserver(spec, plan, backing);
    const second = bindObserver(spec, plan, backing);

    expect(first.params.version()).toBe(0);
    expect(second.params.version()).toBe(0);

    second.dispose();
    first.dispose();
  });
});
