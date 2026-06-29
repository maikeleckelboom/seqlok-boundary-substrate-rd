# Examples

## Nested Params and Meters

```ts
const spec = defineSpec(({ param, meter }) => ({
  params: {
    transport: {
      enabled: param.bool(),
      cursor: param.u32({ min: 0, max: 0xffffffff }),
      payload: param.u8.array(16),
    },
  },
  meters: {
    transport: {
      state: meter.enum(["idle", "active", "fault"]),
      drift: meter.i32(),
    },
  },
}));
```

Use canonical keys after compilation:

```ts
controller.params.set("transport.enabled", true);
controller.params.stage("transport.payload", (payload) => {
  payload.set([1, 2, 3, 4]);
});
```

## Observer Binding

Observers are read-only bindings for telemetry, inspection, or secondary consumers.

```ts
const observer = bindObserver(acceptHandoff(handoff));

const params = observer.params.snapshot(["transport.enabled"]);
const meters = observer.meters.snapshot(["transport.state"]);
```

## Pack Smoke Shape

The release smoke test installs the packed tarball in a fresh consumer and imports from `@seqlok/core`. That catches missing files, workspace-only dependencies, and broken export maps before publish.
