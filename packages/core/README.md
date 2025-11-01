# @seqlok/core

**Coherent, atomic, SWMR state sync for real-time systems**

---

### Coherent Read (Controller, values-only)

```mermaid
%%{init: {"theme":"base","themeVariables":{"textColor":"#ffffff","primaryTextColor":"#ffffff","lineColor":"#94a3b8","primaryColor":"#111827","secondaryColor":"#0f172a","tertiaryColor":"#0b1220","clusterBkg":"#0f172a","clusterBorder":"#334155","primaryBorderColor":"#94a3b8"}} }%%
flowchart TD
    Start["meters.snapshot({ keys, into? })"] --> R1["load seq s1"]
    R1 --> Odd{is s1 odd?}
    Odd -- yes --> Spin["spin / yield briefly"] --> R1
    Odd -- no --> Read["read selected values\n(copy arrays; use 'into' if provided)"]
    Read --> R2["load seq s2"]
    R2 --> Stable{"s1 equals s2 and even?"}
    Stable -- yes --> Ret["return values object"]
    Stable -- no --> Retry["bounded retry (internal policy)"] --> R1
```

> Notes: values-only, no status in the return; bounded spin/retry is **internal policy** (not configurable).

---

### `snapshotWithStatus` wrapper (diagnostics pair)

```mermaid
%%{init: {"theme":"base","themeVariables":{"textColor":"#ffffff","primaryTextColor":"#ffffff","lineColor":"#94a3b8","primaryColor":"#111827","secondaryColor":"#0f172a","tertiaryColor":"#0b1220","clusterBkg":"#0f172a","clusterBorder":"#334155","primaryBorderColor":"#94a3b8"}} }%%
flowchart TD
    A["meters.snapshotWithStatus({ keys, into? })"] --> B["enable internal counters"]
    B --> C["invoke values reader\n(same path as snapshot)"]
    C --> D["collect counters → SnapshotStatus"]
    D --> E["return [values, status] tuple"]
```

> Status includes `spins`, `retries`, `fallback`. Values remain a named object.

---

### Processor coherent window (`params.within(cb)`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"textColor":"#ffffff","primaryTextColor":"#ffffff","lineColor":"#94a3b8","primaryColor":"#111827","secondaryColor":"#0f172a","tertiaryColor":"#0b1220","clusterBkg":"#0f172a","clusterBorder":"#334155","primaryBorderColor":"#94a3b8"}} }%%
flowchart TD
    P0["params.within(cb)"] --> P1["load PU seq s1"]
    P1 --> Podd{is s1 odd?}
    Podd -- yes --> Pspin["bounded spin (internal)"] --> P1
    Podd -- no --> Pcap["capture scalars; copy array views to scratch"]
    Pcap --> P2["load PU seq s2"]
    P2 --> Pstable{"s1 equals s2 and even?"}
    Pstable -- yes --> Pinvoke["invoke cb with coherent window"] --> Pdone["return"]
    Pstable -- no --> Pret["bounded retry (internal)"] --> P1
```

> Scratch views must **not** escape the callback; copy to owned buffers if needed later.

---

### Snapshot coherence (Controller, values-only—concise view)

```mermaid
%%{init: {"theme":"base","themeVariables":{"textColor":"#ffffff","primaryTextColor":"#ffffff","lineColor":"#94a3b8","primaryColor":"#111827","secondaryColor":"#0f172a","tertiaryColor":"#0b1220","clusterBkg":"#0f172a","clusterBorder":"#334155","primaryBorderColor":"#94a3b8"}} }%%
flowchart TD
    A["meters.snapshot({ keys, into? })"] --> B["if seq odd → wait briefly"]
    B --> C["read values (arrays copied; 'into' honored)"]
    C --> D["verify seq unchanged and even"]
    D -- stable --> E["return values object"]
    D -- changed --> B
```

---

### Backing memory planes

```
PF32  : Float32 param plane
PI32  : Int32   param plane (incl. enums as int indices)
PB    : Byte    param plane (booleans)
PU    : Uint32  params lock + sequence

MF32  : Float32 meter plane
MF64  : Float64 meter plane
MU32  : Uint32  meter plane (e.g., counters)
MU    : Uint32  meters lock + sequence
```

---
