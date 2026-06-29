# Specs, Layout, and Handoff: The Boundary Contract

The boundary contract has three durable parts: the authored spec, the planned layout, and the handoff.

The authored spec is the maintainer-facing shape. It can be nested because humans need to review and name fields by domain:

```ts
const spec = defineSpec(({ param, meter }) => ({
  params: {
    filter: {
      cutoff: param.f32({ min: 20, max: 20_000 }),
    },
  },
  meters: {
    filter: {
      peak: meter.f32(),
    },
  },
}));
```

The runtime spec is canonical. The field above becomes `"filter.cutoff"`. Dot keys are not a cosmetic detail; they are the stable identity used by controller writes, snapshots, diagnostics, and layout planning.

The layout is the lowering step. `planLayout(spec)` computes plane sizes, offsets, and identity before memory exists. Allocation consumes that plan. Bindings consume the same plan and backing; they do not invent a second layout.

The handoff is the boundary artifact:

```ts
const handoff = buildHandoff(plan, backing);
const accepted = acceptHandoff(handoff);
const processor = bindProcessor(accepted);
```

`acceptHandoff(...)` is where an inbound artifact becomes a capability. It validates protocol version, plan shape, packing, and backing sizes before the processor interprets shared memory.

That sequence keeps the contract inspectable. A transport may deliver the artifact, but the transport is not the contract. The contract is the spec, the layout derived from it, and the accepted handoff that proves the receiving side is reading the same memory model.
