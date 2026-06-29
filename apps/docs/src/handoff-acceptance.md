# Handoff and Acceptance

The handoff is the concrete boundary value. It carries the planned layout and the supported backing descriptor. A message, port, or process bridge may transport it, but the receiving side should treat the value as untrusted until `acceptHandoff(...)` accepts it.

## Owner Side

The owner side plans and allocates memory once:

```ts
const plan = planLayout(spec);
const backing = allocateShared(plan);
const handoff = buildHandoff(plan, backing);
```

The handoff is not a second spec and it is not a request for the receiver to re-plan. It is the transport envelope for the owner-side plan and backing.

## Receiver Side

The runtime side accepts the handoff before binding:

```ts
const accepted = acceptHandoff(inbound);
const processor = bindProcessor(accepted);
```

`acceptHandoff(...)` validates the protocol version, plan shape, packing mode, and backing sizes. It returns a smaller accepted capability containing the plan and backing descriptor a binding needs.

## Verification

`verifyHandoff(localPlan, remotePlan)` compares plan identity and byte length when both sides have an expected plan. Use it for hardening and diagnostics, not as a replacement for accepting inbound artifacts.

## Supported Packing

| Packing | Meaning |
| --- | --- |
| `shared` | One contiguous `SharedArrayBuffer` backs all planes. |
| `shared-partitioned` | One `SharedArrayBuffer` backs each logical plane. |

WASM-oriented backing exists as an allocation path, but the current handoff protocol does not serialize `wasm-shared` backing.
