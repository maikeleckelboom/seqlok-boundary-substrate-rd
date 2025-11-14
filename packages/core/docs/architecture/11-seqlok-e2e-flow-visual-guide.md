# Seqlok E2E Flow – Visual Guide

> How `spec → plan → backing → handoff → bindings` fit together across UI and real-time threads.

This document is the "single page mental model" for Seqlok's end-to-end flow:

- Main thread (controller) defines the shared state and owns **params**.
- Worker / AudioWorklet (processor) owns **meters** and the real-time loop.
- Both talk via a **plan-driven shared memory plan** (planes + seqlocks).

[//]: # 'todo: link to other docs'

For deeper dives, see:

- `03-seqlok-concurrency-model-and-roles.md`
- `07-seqlok-api-shape-rationale.md`
- `08-seqlok-primitives-and-seqlock.md`
- `09-seqlok-backing-and-plane-plan.md`

---

## Architecture Overview

```mermaid
graph TB
  subgraph "Main Thread (Controller)"
    A[Define Spec<br/>defineSpec] --> B[Plan Layout<br/>planLayout]
    B --> C[Allocate Shared Memory<br/>allocateShared]
    C --> D[Bind Controller<br/>bindController]
    D --> E[Create Handoff<br/>buildHandoff]
    E --> F[Send to Worker<br/>postMessage]
    D --> G[UI Controls<br/>params.set / params.update]
    D --> H[Read Meters<br/>meters.snapshot]
  end

  subgraph "Worker Thread (Processor)"
    F --> I[Receive Handoff]
    I --> J["Verify Handoff (optional)"]
    J --> K[Bind Processor<br/>bindProcessor]
    K --> L[Process Loop]
    L --> M[Coherent Param Read<br/>params.within]
    M --> N[Audio Processing<br/>DSP / simulation]
    N --> O[Atomic Meter Write<br/>meters.publish]
  end

  subgraph "Shared Memory"
    P[Params Domain<br/>PF32 / PI32 / PB / PU]
    Q[Meters Domain<br/>MF32 / MF64 / MU32 / MU]
  end

  G --> P
  M --> P
  O --> Q
  H --> Q
```

> **Note on `verifyHandoff`:** > `verifyHandoff(plan, received)` requires a local `plan`. In setups where the processor must avoid planning (e.g. slim
> AudioWorklet), verification can run on the controller side or in a non-RT worker. It's shown in the processor box here
> for conceptual completeness.

---

## Detailed Data Flow

```mermaid
sequenceDiagram
  participant UI as UI Thread
  participant CTL as Controller Binding
  participant MEM as Shared Memory
  participant PROC as Processor Binding
  participant RT as Real-Time Loop
  Note over UI, RT: 1. SETUP PHASE (Main Thread)
  UI ->> UI: defineSpec() with id
  UI ->> UI: planLayout() → Plan
  UI ->> MEM: allocateShared(plan) → SharedArrayBuffer
  UI ->> CTL: bindController(spec, backing)
  UI ->> UI: buildHandoff(plan, backing)
  UI ->> PROC: postMessage({ type: 'HANDOFF', handoff })
  Note over UI, RT: 2. WORKER INIT (Processor Side)
  PROC ->> PROC: receiveHandoff(handoff)
  Note over PROC: Optional safety step:
  PROC ->> PROC: verifyHandoff(plan, received)
  PROC ->> PROC: bindProcessor(spec, backing)
  PROC ->> RT: Start processing loop
  Note over UI, RT: 3. RUNTIME FLOW

  loop On UI interaction
    UI ->> CTL: controller.params.set('gain', value)
    CTL ->> MEM: Atomic write into PF32 plane
    CTL ->> MEM: Update PU seqlock (LOCK/SEQ)
  end

  loop On each RT tick (e.g. per quantum)
    RT ->> PROC: processor.params.within(callback)
    PROC ->> MEM: Read PU seqlock + param planes
    MEM -->> PROC: Coherent param snapshot
    PROC ->> RT: Run DSP with snapshot
    RT ->> PROC: processor.meters.publish(writer)
    PROC ->> MEM: Atomic writes into MF32/MU32 planes
    PROC ->> MEM: Update MU seqlock (LOCK/SEQ)
  end

  loop On each animation frame
    UI ->> CTL: controller.meters.snapshot()
    CTL ->> MEM: Read MU seqlock + meter planes
    MEM -->> CTL: Coherent meter snapshot
    CTL ->> UI: Update HUD / meters / graphs
  end
```

> **Seqlock nuance:** Writers bump `LOCK` on enter/exit and bump `SEQ` on commit.
> The diagram compresses this as a single "update seqlock" step for readability.

---

## Memory Layout Visualization

```mermaid
graph LR
  subgraph "SharedArrayBuffer"
    subgraph "Params Domain"
      P1[PF32<br/>Float32 params]
      P2[PI32<br/>Int32 / enum params]
      P3[PB<br/>Boolean params]
      P4[PU<br/>Params seqlock<br/>LOCK / SEQ]
    end

    subgraph "Meters Domain"
      M1[MF32<br/>Float32 meters]
      M2[MF64<br/>Float64 meters]
      M3[MU32<br/>Uint32 meters]
      M4[MU<br/>Meters seqlock<br/>LOCK / SEQ]
    end
  end

  P1 --> W1[gain: 0.80]
  P1 --> W2[frequency: 440]
  P3 --> W3[mute: false]
  P4 --> W4[PU: LOCK=42, SEQ=21]
  M1 --> R1[rms: 0.324]
  M1 --> R2[peak: 0.891]
  M4 --> R3[MU: LOCK=38, SEQ=19]
```

- Plan decides how each param/meter key maps into these planes.
- Backing allocates and exposes the actual SAB + views.
- Both controller and processor see the same bytes; Seqlok enforces safe access.

---

## Seqlock Protocol Flow

```mermaid
stateDiagram-v2
  state "Writer (Controller / Processor)" as W
  state "Reader (Controller / Processor)" as R
  state "Memory State" as M

  state M {
    [*] --> Quiescent: LOCK even
    Quiescent --> Writing: LOCK++
    Writing --> Quiescent: LOCK++ , SEQ++
  }

  state W {
    [*] --> Ready
    Ready --> WritingParams: Begin write
    WritingParams --> Commit: Write complete
    Commit --> Ready: LOCK++, SEQ++
  }

  state R {
    [*] --> AttemptRead
    AttemptRead --> CheckLock: Read LOCK
    CheckLock --> Spinning: LOCK odd
    Spinning --> AttemptRead: Retry
    CheckLock --> Capture: LOCK even
    Capture --> Validate: Read data + SEQ
    Validate --> Success: LOCK/SEQ stable
    Validate --> Retry: LOCK/SEQ changed
    Success --> Coherent: Use snapshot
    Retry --> AttemptRead: Try again (bounded)
  }

  W --> M: Writes payload + LOCK/SEQ
  R --> M: Reads LOCK/SEQ + payload
```

Key guarantees:

- Readers never see partially written data; they either:

  - Get a coherent snapshot, or
  - Retry a bounded number of times.

- Writers remain single-writer per domain (params vs meters), avoiding data races.

---

## Type Safety Flow

```mermaid
graph TB
  subgraph "Compile Time"
    A[defineSpec DSL] --> B[Inferred Spec Type S]
    B --> C[ParamKeys<S>]
    B --> D[MeterKeys<S>]
    B --> E[ParamValueFor<S,K>]
    B --> F[MeterValueFor<S,K>]
    B --> G[ControllerBinding<S>, ProcessorBinding<S>]
  end

  subgraph "Runtime API"
    H[controller.params.set] --> I[Key: ParamKeys<S>]
    H --> J[Value: ParamValueFor<S,K>]
    K[controller.meters.snapshot] --> L[Result: MeterValues<S>]
    M[processor.params.within] --> N[params: ParamShape<S>]
    O[processor.meters.publish] --> P[writer: MeterWriter<S>]
  end

  C --> I
  E --> J
  F --> L
  G --> H
  G --> K
  G --> M
  G --> O
```

This is the core "compile-time → runtime" story:

- The DSL (`defineSpec`) defines a single source of truth.
- All keys, shapes, and bindings derive from that spec type.
- Controllers and processors are strongly typed on that `S`.
- Invalid keys/values or mismatched meters are caught by TypeScript.

---

## Complete E2E Timeline (Conceptual)

This is an **illustrative** timeline, not a performance chart. Units are relative.

```mermaid
gantt
  title Seqlok E2E Timeline (Conceptual)
  dateFormat X
  axisFormat %s

  section Main Thread
    Define Spec & Plan: a1, 0, 10
    Allocate Memory: a2, after a1, 5
    Bind Controller: a3, after a2, 3
    Create Handoff: a4, after a3, 2
    Send to Worker: a5, after a4, 1
    UI Controls (ongoing): a6, after a5, 300
    Meter Reads (ongoing): a7, after a5, 300

  section Worker Thread
    Receive Handoff: b1, after a5, 2
    Verify Handoff (optional): b2, after b1, 3
    Bind Processor: b3, after b2, 3
    Process Loop (ongoing): b4, after b3, 300

  section Shared Memory
    Memory Ready: c1, after a2, 310
    Param Updates (ongoing): c2, after a6, 290
    Meter Updates (ongoing): c3, after b4, 290
```

---

## 🎯 Key Visual Takeaways

1. **Two independent domains**

- Params and meters live in separate planes with separate seqlocks.
- Controller writes params; processor writes meters. No contention.

2. **Seqlock synchronization**

- Lock-free reads with bounded retry.
- Single writer per domain; no torn reads.

3. **Type safety end-to-end**

- One spec type `S` drives all keys, param/meter shapes, and bindings.
- The compiler rejects invalid keys/values; runtime enforces plan.

4. **Zero serialization, zero copies on the hot path**

- SharedArrayBuffer + TypedArrays + Atomics – no JSON, no cloning.

5. **Real-time friendly**

- Processor reads/writes are predictable, allocation-free on the hot path.
- Controller can be "messy JS", processor stays tightly scoped.

This is the E2E picture: Seqlok wires UI and real-time threads through a **planned, shared memory plan** with \*
\*seqlock-based coherence** and **TypeScript-enforced contracts\*\*.
