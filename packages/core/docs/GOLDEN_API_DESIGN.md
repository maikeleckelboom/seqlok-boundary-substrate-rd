# Golden API Design (vNext)

## Principles

- **SWMR domains:** PU (Controller writer) and MU (Processor writer) are independent.
- **Coherence:** seqlocks ensure readers see a consistent epoch.
- **No boolean flags in public surface.**
- **Zero‑alloc is opt‑in via `into` (per array key).**
- **Controller values:** object syntax; diagnostics via a separate method returning a pair.

## Controller API — examples

### Subset (values only)

```ts
const { peak, frameIndex } = ctl.meters.snapshot({ keys: ['peak', 'frameIndex'] });
```

### Zero‑alloc arrays (values only)

```ts
const spectrumBuf = new Float32Array(512);
const { spectrum, peak } = ctl.meters.snapshot({
  keys: ['spectrum', 'peak'],
  into: { spectrum: spectrumBuf }, // spectrum === spectrumBuf
});
```

### Diagnostics (values + status tuple)

```ts
const [vals, st] = ctl.meters.snapshotWithStatus({
  keys: ['spectrum', 'rms'],
  into: { spectrum: spectrumBuf },
});
if (st.retries > 10) console.warn('High contention', st);
```

## Processor API — unchanged

```ts
proc.params.within((v) => {
  const rate = v.rate; // scalars as captured numbers
  const coeffs = v.coeffs; // arrays as scratch views (copy if needed)
  // ... DSP ...
  proc.meters.publish((w) => {
    /* commit meters in one MU bump */
  });
});
```

## Non‑Goals

- No positional tuple snapshots in core.
- No per‑call tuning knobs (reader policy is internal and stable).
