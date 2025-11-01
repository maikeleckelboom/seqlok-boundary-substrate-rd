# Q&A — Staging, Commit, and "Power-User" Control (vNext, Final)

**Q: Did we remove `commit()`?**
**A:** Yes. There is **no public `commit()`**. Atomic boundaries are defined by **RAII** operations:

- Controller scalars: `params.update({ ... })` → **1 PU bump**
- Controller arrays: `params.stage('key', cb(view))` → **1 PU bump**
- Processor meters: `meters.publish(cb(writer))` (with `writer.stage(...)` for arrays) → **1 MU bump**

These calls open a short, deterministic window and auto-commit on scope exit.

---

**Q: Did we remove "staging"?**
**A:** No. Staging is **how** arrays are written—just scoped:

- **Controller arrays:**

  ```ts
  ctl.params.stage('coeffs', (view) => {
    view.set(newCoeffs);
  }); // 1 PU bump
  ```

- **Processor array meters:**

  ```ts
  proc.meters.publish((w) => {
    w.stage('spectrum', (dst) => {
      dst.set(scratch);
    }); // 1 MU bump
  });
  ```

No writer or scratch view may escape the callback.

---

**Q: Why no public `commit()`? I want max control.**
**A:** Three reasons:

1. **RT safety:** Open-ended transactions are a footgun on real-time threads; RAII keeps windows bounded.
2. **Invariants:** “One operation → one bump” is easy to reason about, hard to violate.
3. **Clarity & evolution:** Users think in operations (`update`, `stage`, `publish`), not lock states. Internals can
   evolve without breaking user code.

---

**Q: How do I perform atomic multi-value writes?**
**A:**

- **Scalars together:**

  ```ts
  ctl.params.update({ rate: 440, gain: 0.5, mode: 'normal' }); // 1 PU bump
  ```

- **Arrays:** place coupled values in a **single array param** and write once:

  ```ts
  ctl.params.stage('filter', (v) => {
    v.set(new Float32Array([cutoff, q, drive]));
  }); // 1 PU bump
  ```

Multiple `stage(...)` calls are multiple bumps; design your spec accordingly.

---

**Q: Can I make PU and MU "commit together"?**
**A:** No. **PU** (params) and **MU** (meters) are intentionally separate SWMR domains. Correlate with **stamps** (e.g.,
`frameIndex`, `paramsEpoch`) published as meters. Consumers match reads by stamp.

---

**Q: What if I need a long preparation then a single atomic swap?**
**A:** Prepare in **local buffers** (or an array pool) over time, then do a single RAII write at the boundary:

```ts
// prep work over many frames...
ctl.params.stage('table', (v) => v.set(precomputedTable)); // 1 PU bump at the swap point
```

For engine reconfiguration in Dekzer, keep using the driver strategy: **spawn + prime + preWarm + crossFade** with
scheduled param swaps.

---

**Q: Can I publish meters outside `params.within`?**
**A:** Yes. It's common to **decouple** read cadence from publish cadence:

```ts
proc.params.within((v) => {
  this.mode = v.mode; /* heavy analysis... */
});
if (tick % 16 === 0) {
  proc.meters.publish((w) => {
    w.mode(this.mode); /* stage arrays here */
  });
}
```

Rules still apply: one `publish` → one MU bump; staged array views don’t escape.

---

**Q: What happens if I leak a writer or staged view?**
**A:** In dev builds we throw; in production it’s undefined behavior. Keep everything inside the callback:

```ts
// ❌ BAD
let leaked;
proc.meters.publish((w) => {
  leaked = w;
}); // will error in dev

// ✅ GOOD
proc.meters.publish((w) => {
  w.stage('spectrum', (dst) => dst.set(buf));
});
```

---

**Q: How do controller reads work now?**
**A:** Values as **named objects**; diagnostics via a **separate** method:

```ts
// Values only
const vals = ctl.meters.snapshot({
  keys: ['peak', 'rms'],
  into: {
    /* arrays here */
  },
});

// Values + status
const [vals2, status] = ctl.meters.snapshotWithStatus({ keys: ['peak'] });
// status: { spins: number, retries: number, fallback: boolean }
```

No boolean flags like `withStatus: true` and no positional tuples for values.

---

**Q: Which errors should I expect from write/read misuse?**
**A:** Programming & shape errors only (read contention never throws):

- `params.outOfRange` (range policy `'reject'`)
- `params.unknownKey` / `meters.unknownKey`
- `params.intoTypeMismatch` / `params.intoLengthMismatch`
- `meters.intoTypeMismatch` / `meters.intoLengthMismatch`
- `handoff.*`, `env.unsupported`, `bind.*` for setup/lifecycle

---

**Q: Is there any way to get lower-level, commit-like primitives?**
**A:** Not in `@seqlok/core`. If we ever expose them, it will be **opt-in** under an experimental package with clear
warnings. Core remains RAII-only to preserve safety and invariants.

---

**Q: What are the hard guarantees I can rely on?**
**A:**

- **One-bump principle:** each `update` / `stage` / `publish` emits **exactly one** bump.
- **Coherent windows:** `params.within` guarantees a self-consistent read epoch.
- **Zero-alloc reads:** for arrays, `snapshot({ into: { key: buffer } })` **fills in place** and returns the **same
  identity**.
- **No public knobs:** spin/retry budgets are internal; contention is observable only via `snapshotWithStatus`.
