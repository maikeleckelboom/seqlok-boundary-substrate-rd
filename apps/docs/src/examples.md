# Examples

These examples show the public contract in code. The prose names the boundary guarantees; snippets keep transport sketches separate from the core API.

## Spec Inference and Canonical Keys

```ts twoslash
import { defineSpec } from "@exclave/boundary";

const spec = defineSpec((api) => ({
  id: "examples/transport",
  params: {
    transport: {
      enabled: api.param.bool(),
      mode: api.param.enum(["idle", "active", "fault"]),
      payload: api.param.u8.array(16),
    },
  },
  meters: {
    transport: {
      state: api.meter.enum(["idle", "active", "fault"]),
      drift: api.meter.i32(),
      spectrum: api.meter.f32.array(8),
    },
  },
}));
```

The authored shape is nested, while controller writes use canonical dot-key strings and processor or observer reads expose nested views.

## Controller Params

```ts twoslash
import {
  allocatePacked,
  bindController,
  defineSpec,
  planLayout,
} from "@exclave/boundary";

const spec = defineSpec((api) => ({
  id: "examples/controller",
  params: {
    transport: {
      enabled: api.param.bool(),
      mode: api.param.enum(["idle", "active", "fault"]),
      payload: api.param.u8.array(16),
    },
  },
  meters: {
    frames: api.meter.u32(),
  },
}));

const plan = planLayout(spec);
const backing = allocatePacked(plan);
const controller = bindController(spec, plan, backing);

controller.params.set("transport.enabled", true);
controller.params.set("transport.mode", "active");
controller.params.stage("transport.payload", (payload) => {
  payload.set([1, 2, 3, 4]);
  payload;
});
```

Scalar enum params use labels on the controller side. Processor and meter enum values are numeric indices at the runtime boundary.

## Processor Views

```ts twoslash
import {
  allocatePacked,
  bindProcessor,
  buildHandoff,
  defineSpec,
  planLayout,
} from "@exclave/boundary";

const spec = defineSpec((api) => ({
  id: "examples/processor",
  params: {
    transport: {
      enabled: api.param.bool(),
      mode: api.param.enum(["idle", "active", "fault"]),
      payload: api.param.u8.array(16),
    },
  },
  meters: {
    frames: api.meter.u32(),
    spectrum: api.meter.f32.array(8),
  },
}));

const plan = planLayout(spec);
const backing = allocatePacked(plan);
const handoff = buildHandoff(plan, backing);
const processor = bindProcessor(handoff);

processor.params.within((params) => {
  params.transport.enabled;

  params.transport.mode;

  params.transport.payload;
});

processor.meters.publish((meters) => {
  meters.frames(128);
  meters.stage("spectrum", (spectrum) => {
    spectrum[0] = 0.25;
    spectrum;
  });
});
```

The nested aliases inside `within(...)` are read conveniences over the canonical dot-key contract. Array views are ephemeral and scoped to the callback.

## Observer Snapshots

Observers are read-only bindings for telemetry, inspection, or secondary consumers. They can bind from the same handoff as the processor.

```ts twoslash
import {
  allocatePacked,
  bindObserver,
  buildHandoff,
  defineSpec,
  planLayout,
} from "@exclave/boundary";

const spec = defineSpec((api) => ({
  id: "examples/observer",
  params: {
    transport: {
      enabled: api.param.bool(),
      mode: api.param.enum(["idle", "active", "fault"]),
    },
  },
  meters: {
    transport: {
      state: api.meter.enum(["idle", "active", "fault"]),
      drift: api.meter.i32(),
    },
  },
}));

const plan = planLayout(spec);
const backing = allocatePacked(plan);
const handoff = buildHandoff(plan, backing);
const observer = bindObserver(handoff);

observer.params.within((params) => {
  params.transport.enabled;
  params.transport.mode;
});

observer.params.snapshot(["transport.enabled", "transport.mode"]);
observer.meters.snapshot("transport.state", "transport.drift");
```

The observer receives enum param labels in snapshots, including when it binds from a handoff.

## BoundaryError Narrowing

```ts twoslash
import { isBoundaryError } from "@exclave/boundary";

export function summarizeError(error: unknown) {
  if (isBoundaryError(error)) {
    error.code;

    return error.toJSON();
  }

  return { name: "Unknown" };
}
```

## Pack Smoke Shape

The release smoke test installs the packed tarball in a fresh consumer and imports from `@exclave/boundary`. That catches missing files, workspace-only dependencies, and broken export maps before publish.
