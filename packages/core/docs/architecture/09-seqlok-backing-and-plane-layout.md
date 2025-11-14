# Backing & Plane Layout (Internals)

**Deterministic, allocation-free memory mapping for Seqlok.**

This document explains how a validated **Plan** maps to concrete shared memory **Backings** and **Views**, including
alignment and packing rules.

---

## Mental Model: Data Flow

$$\text{Spec} \xrightarrow{\text{planLayout}} \text{Plan} \xrightarrow{\text{allocate/map}} \text{Backing} \xrightarrow{\text{mapViews}} \text{Views}$$

| Component   | Role                                           | Output                                                   |
| :---------- | :--------------------------------------------- | :------------------------------------------------------- |
| **Spec**    | User-defined parameter/meter structure         | —                                                        |
| **Plan**    | Blueprint (byte lengths, offsets, slot tables) | `bytesTotal`, `planeBaseOffsets`, `slotTables`           |
| **Backing** | Concrete shared storage                        | `SharedArrayBuffer` / `WebAssembly.Memory`               |
| **Views**   | TypedArray accessors per plane & seqlock       | `PF32`, `PI32`, `PB`, `PU`, `MF32`, `MF64`, `MU32`, `MU` |

> **Indexing rule:** slot tables use **byte** `offset` and **element** `length`. Compute **TypedArray index** as
> `index = offset / elemBytes`.

---

## Planes, Alignment, and Packing

### Canonical Planes & Element Sizes

| Plane    | Purpose         | Data Types                                   | Elem Size |
| :------- | :-------------- | :------------------------------------------- | :-------- |
| **PF32** | Params: Float32 | `f32`, `f32.array`                           | **4 B**   |
| **PI32** | Params: Int32   | `i32`, `i32.array`, `enum(.array)` (indices) | **4 B**   |
| **PB**   | Params: Boolean | `bool(.array)` (0/1 bytes)                   | **1 B**   |
| **PU**   | Params: Control | Seqlock **[LOCK, SEQ]** (`Int32Array`)       | **4 B**   |
| **MF32** | Meters: Float32 | `f32`, `f32.array`                           | **4 B**   |
| **MF64** | Meters: Float64 | `f64`, `f64.array`                           | **8 B**   |
| **MU32** | Meters: Uint32  | `u32` flags/counters, `bool` as 0/1          | **4 B**   |
| **MU**   | Meters: Control | Seqlock **[LOCK, SEQ]** (`Int32Array`)       | **4 B**   |

### Alignment & Packing Rules

1. **Plane alignment:** each plane’s base is aligned to its element size (e.g., **8-byte** alignment for **MF64**).
2. **Packing order (stable):**
   `PF32 → PI32 → PB → PU → MF32 → MF64 → MU32 → MU`
3. **Packing loop:** for each plane in order
   • **Align** cursor to `BYTES_PER_ELEM[plane]`
   • **Assign** base = aligned cursor
   • **Advance** cursor by the plane's computed byte length

> **Primitives:** helpers such as `roundUpTo(offset, alignment)` and `isAligned(offset, plane)` enforce these rules.

### Control-Only (Lock) Planes

**PU** and **MU** hold the seqlock counters and are always `Int32Array`:

| Index | Name     | Role                                                       |
| :---: | :------- | :--------------------------------------------------------- |
| **0** | **LOCK** | Odd during write, even when quiescent                      |
| **1** | **SEQ**  | Increments exactly once per successful commit (“one-bump”) |

> **Internal policy:** the planner may optionally pad PU/MU up to a cache line (e.g., 64 B) to reduce false sharing.
> This is not a public API contract.

---

## Backing Flavors

All flavors honor the same plan and yield identical observable semantics; they differ only in ownership/container.

| Flavor                  | Container                                     | Plane Mapping                               | Allocation / Ownership                                  |
| :---------------------- | :-------------------------------------------- | :------------------------------------------ | :------------------------------------------------------ |
| **Shared (Contiguous)** | **One** `SharedArrayBuffer`                   | All plane views slice the **same SAB**      | **Default:** best locality, minimal allocations         |
| **SharedPartitioned**   | **One** `SharedArrayBuffer` **per plane**     | Each plane maps to its **own SAB**          | For isolation or tooling that prefers per-plane buffers |
| **WasmShared**          | **One** `WebAssembly.Memory` (`shared: true`) | All views map over `memory.buffer` (an SAB) | For scenarios where a WASM DSP kernel owns the memory   |

### Reference API (backing layer)

| Category     | Function                                                                                    |
| :----------- | :------------------------------------------------------------------------------------------ |
| **Allocate** | `allocateShared(plan)` · `allocateSharedPartitioned(plan)` · `attachWasmShared(plan, opts)` |
| **Map**      | `mapViews(plan, backing)`                                                                   |
| **Utils**    | `getSharedBuffer(backing)` · `getBufferForPlane(backing, plane)`                            |

> **Guarantees:** mapping is **zero-alloc** and **deterministic**; all TypedArrays are correctly aligned.

---

## Error Conditions & Environment

| Condition                              | Error                      | Note                                           |
| :------------------------------------- | :------------------------- | :--------------------------------------------- |
| Undersized buffer at mapping time      | `backing.undersized`       | Provided buffer cannot fit the plan            |
| WASM buffer not shared                 | `backing.wasmNotShared`    | `memory.buffer` must be a `SharedArrayBuffer`  |
| Misalignment / invalid slot (internal) | `internal.assertionFailed` | Indicates an invalid plan or programming error |

> **Environment:** `SharedArrayBuffer` requires COOP/COEP (cross-origin isolation) in browsers. Node requires
> `worker_threads` (Node ≥ 20). WASM memory must not shrink below the planned size.

### Backing variants (ABI-stable)

Seqlok supports multiple backing strategies behind the same `Backing` interface:

- **Compact** — single SAB, tight packing (default)
- **Aligned** — extra padding for cache-line alignment
- **Split** — separate SABs per plane (advanced)

Bindings are agnostic to the choice; plans and offsets are identical.
