# Handoff and Acceptance

The handoff is the concrete boundary value. It carries the planned layout and the supported backing descriptor. A message, port, or process bridge may transport it, but the receiving side should treat the value as untrusted until `acceptHandoff(...)` accepts it.

## Owner Side

The owner side plans and allocates memory once:

```ts
const plan = planLayout(spec);
const backing = allocatePacked(plan);
const handoff = buildHandoff(plan, backing);
```

The handoff is not a second spec and it is not a request for the receiver to re-plan. It is the transport envelope for the owner-side plan and backing.

## Receiver Side

When the handoff type is preserved, the runtime side can bind directly:

```ts
const processor = bindProcessor(handoff);
```

`acceptHandoff(...)` validates the protocol version, plan shape, packing mode, and backing sizes. It returns a smaller accepted capability containing the plan and backing descriptor a binding needs.

Use it at unknown transport boundaries:

```ts
const processor = bindProcessor(acceptHandoff(message.data));
```

## Verification

`verifyHandoff(localPlan, remotePlan)` compares plan identity and byte length when both sides have an expected plan. Use it for hardening and diagnostics, not as a replacement for accepting inbound artifacts.

## Supported Packing

| Packing | Meaning |
| --- | --- |
| `packed` | One contiguous `SharedArrayBuffer` backs all planes. |
| `partitioned` | One `SharedArrayBuffer` backs each logical plane. |

WASM-oriented backing exists as an allocation path, but the current handoff protocol does not serialize `wasm` backing.
