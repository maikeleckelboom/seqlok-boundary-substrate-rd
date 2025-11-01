# Consumer Usage Patterns (Validated)

All examples use the final API:

- `snapshot({ keys, into? })` → values object
- `snapshotWithStatus({ keys, into? })` → [values, status] tuple

## 1) 60fps UI updates (zero-alloc)

```ts
const buf = new Float32Array(512);
const { spectrum, peak } = ctl.meters.snapshot({
  keys: ['spectrum', 'peak'],
  into: { spectrum: buf },
});
```

## 2) Telemetry with contention detection

```ts
const [vals, status] = ctl.meters.snapshotWithStatus({
  keys: ['spectrum', 'peak', 'rms'],
  into: { spectrum: buf },
});
if (status.retries > 10) console.warn('High contention', status);
```

## 3) Full snapshot for debug tools

```ts
const all = ctl.params.snapshot();
```

## 4) Recording: zero-alloc read, explicit copies for storage

```ts
const vals = ctl.meters.snapshot({
  keys: ['spectrum', 'histogram'],
  into: { spectrum: s512, histogram: h256 },
});
archive.push({
  spectrum: Float32Array.from(vals.spectrum),
  histogram: Float32Array.from(vals.histogram),
});
```

## 5) Scalar-only hot path

```ts
const { peak, rms, crestFactor } = ctl.meters.snapshot({
  keys: ['peak', 'rms', 'crestFactor'],
});
```
