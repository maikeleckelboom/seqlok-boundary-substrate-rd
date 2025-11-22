<!-- GENERATED FILE: do not edit by hand.
     Regenerate via: pnpm bench:report -->

# Bench Results

> Generated from `bench-results.json` by `scripts/format-bench.ts`. Re-run `pnpm bench:report` after changing benchmarks.

_Bench run: 2025-11-22T06:07:27.243Z_

## Hot path micro-operations

| Operation                                          | Mean time (µs) | Throughput (M ops/s) |
|----------------------------------------------------|---------------:|---------------------:|
| Seqlock publish uncontended                        |          0.088 |                11.42 |
| meter scalar: writer.set('level', 0.75)            |          0.121 |                 8.25 |
| meter scalar: writer.level(0.75)                   |          0.127 |                 7.90 |
| controller.params.stage (eqBands f32[8])           |          0.134 |                 7.44 |
| Seqlock tryRead uncontended                        |          0.151 |                 6.64 |
| controller.params.set (two scalars)                |          0.208 |                 4.81 |
| controller.params.update (3 scalars)               |          0.232 |                 4.31 |
| controller.params.hydrate (3 scalars + f32[8])     |          0.293 |                 3.42 |
| controller.params.update (3 scalars + f32[8])      |          0.312 |                 3.21 |
| processor.params.within (scalars + eqBands f32[8]) |          0.555 |                 1.80 |
| processor.params.within (scalars only)             |          0.588 |                 1.70 |
| meter array: writer.stage('spectrum', cb)          |          0.655 |                 1.53 |
| interleaved controller.update + processor.within   |          0.761 |                 1.31 |

## E2E setup: `spec → plan → backing → handoff → bindings`

| Spec size   | Mean setup time (ms) | Setups per second |
|-------------|---------------------:|------------------:|
| Small spec  |                0.016 |             62100 |
| Medium spec |                0.028 |             35271 |
| Large spec  |                0.040 |             24849 |

_Note:_ numbers are from a single Node 20 + Vitest bench run and are meant for relative comparison, not absolute tuning.
