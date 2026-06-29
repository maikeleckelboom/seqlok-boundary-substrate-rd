# Quickstart

This is the smallest complete Exclave Boundary flow: define a spec, plan memory, allocate backing, bind controller and processor roles, then publish values through the seqlock-protected boundary.

```ts
import {
  acceptHandoff,
  allocateShared,
  bindController,
  bindProcessor,
  buildHandoff,
  defineSpec,
  planLayout,
} from "@exclave/boundary";

const spec = defineSpec(({ param, meter }) => ({
  params: {
    runtime: {
      enabled: param.bool(),
      count: param.u32({ min: 0, max: 1_000_000 }),
      window: param.f32.array(8),
    },
  },
  meters: {
    status: meter.enum(["idle", "busy", "fault"]),
    signedDelta: meter.i32(),
  },
}));

const plan = planLayout(spec);
const backing = allocateShared(plan);

const controller = bindController(spec, plan, backing);
const processor = bindProcessor(acceptHandoff(buildHandoff(plan, backing)));

controller.params.set("runtime.enabled", true);
controller.params.set("runtime.count", 42);
controller.params.stage("runtime.window", (view) => {
  view.fill(1);
});

processor.params.within((params) => {
  if (params.runtime.enabled) {
    processor.meters.publish((meters) => {
      meters.status(1);
      meters.signedDelta(-1);
    });
  }
});

console.log(controller.meters.snapshot());
```

Write APIs use explicit canonical string keys. Processor read views expose nested aliases such as `params.runtime.enabled`.
