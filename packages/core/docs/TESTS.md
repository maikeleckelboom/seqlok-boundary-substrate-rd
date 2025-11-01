# Tests to Add/Keep (vNext)

## Negative type tests

```ts
// scalar key cannot appear in `into`
// @ts-expect-error
ctl.meters.snapshot({ keys: ['peak'], into: { peak: new Float32Array(1) } });

// wrong typed array class
// @ts-expect-error
ctl.meters.snapshot({ keys: ['spectrum'], into: { spectrum: new Uint32Array(512) } });

// unknown key in into
// @ts-expect-error
ctl.meters.snapshot({ keys: ['spectrum'], into: { spectrumm: new Float32Array(512) } });
```

## Positive type tests

```ts
const buf = new Float32Array(512);
const { spectrum } = ctl.meters.snapshot({ keys: ['spectrum'], into: { spectrum: buf } });
const [vals, st] = ctl.meters.snapshotWithStatus({ keys: ['peak', 'rms'] });
```
