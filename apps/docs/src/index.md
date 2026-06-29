---
layout: home
hero:
  name: Exclave Boundary
  text: Typed shared-memory boundary substrate
  tagline: Authored TypeScript contracts, deterministic memory layout, explicit handoff artifacts, and role-specific bindings for timing-sensitive systems.
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: Boundary Flow
      link: /core-flow
features:
  - title: Authored contracts
    details: Write nested params and meters as a TypeScript-authored surface, then compile them to canonical runtime keys.
  - title: Deterministic layout
    details: Lower the contract into repeatable shared-memory planes before any controller or runtime role binds.
  - title: Explicit handoff
    details: Transfer a concrete handoff artifact across the boundary and validate it before a processor interprets memory.
  - title: Role-specific bindings
    details: Keep controller writes, processor hot-path reads/writes, and observer snapshots on separate public surfaces.
  - title: Diagnostics and errors
    details: Use environment probes, counters, view descriptions, and structured BoundaryError codes for integration work.
  - title: Package boundary
    details: Import from @exclave/boundary and @exclave/boundary/diagnostics; internal modules stay private.
---

## What It Is

`@exclave/boundary` is a typed shared-memory boundary substrate for timing-sensitive systems. It helps a host side define a control surface, plan the memory layout once, allocate shared backing, and transfer a validated capability to a runtime side.

Audio is the clearest first use case because audio runtimes make timing pressure obvious. The abstraction is broader: workers, WebAssembly-oriented runtimes, telemetry loops, and other systems can use the same spec-layout-handoff contract when they need shared state without hidden layout reconstruction.

Start with [Install](/install), follow the [Quickstart](/quickstart), then read the [Boundary Flow](/core-flow) and [Authored AST vs Runtime](/authoring-contract) pages before integrating across a real worker or worklet boundary.
