# Why Exclave Boundary Exists

Timing-sensitive systems often split into two worlds. One side owns UI, orchestration, hydration, and diagnostics. The other side owns a loop where allocation, unpredictable control flow, and torn reads are expensive.

`postMessage` can move data across that split, but it does not define the shared-memory contract. Exclave Boundary exists for the part that has to be explicit: what fields exist, how they are lowered into memory, who may write them, who may read them, and what artifact proves the runtime is interpreting the same layout as the host.

The package flow is deliberately plain:

```text
defineSpec -> planLayout -> allocateShared -> buildHandoff -> acceptHandoff -> bind roles
```

The important choice is that the layout is planned once and then carried through a handoff. The runtime side should not reconstruct layout from ambient state or a parallel copy of configuration.

Audio is the easiest way to explain the pressure because an audio callback makes timing mistakes audible. The same boundary shape applies elsewhere: workers, WASM-oriented runtimes, telemetry loops, and other systems where a soft host side needs to share coherent state with a stricter runtime side.

Exclave Boundary is not an application framework. It does not own your worker lifecycle, domain command protocol, UI model, or deployment policy. It gives those layers a typed substrate for shared state and a boundary artifact they can move, validate, and bind.
