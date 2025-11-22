<!-- GENERATED FILE: do not edit by hand.
     Regenerate via: pnpm bench:report -->

# Bench Results

> Generated from `bench-results.json` by `scripts/format-bench.ts`. Re-run `pnpm bench:report` after changing benchmarks.

_Bench run: 2025-11-20T15:51:02.101Z_

## Hot path micro-operations

| Operation                                          | Mean time (µs) | Throughput (M ops/s) |
| -------------------------------------------------- | -------------: | -------------------: |
| Seqlock publish uncontended                        |          0.086 |                11.62 |
| meter scalar: writer.level(0.75)                   |          0.124 |                 8.09 |
| meter scalar: writer.set('level', 0.75)            |          0.135 |                 7.42 |
| controller.params.stage (eqBands f32[8])           |          0.136 |                 7.38 |
| Seqlock tryRead uncontended                        |          0.149 |                 6.70 |
| controller.params.set (two scalars)                |          0.214 |                 4.67 |
| controller.params.update (3 scalars)               |          0.243 |                 4.11 |
| controller.params.hydrate (3 scalars + f32[8])     |          0.330 |                 3.03 |
| controller.params.update (3 scalars + f32[8])      |          0.389 |                 2.57 |
| processor.params.within (scalars + eqBands f32[8]) |          0.566 |                 1.77 |
| processor.params.within (scalars only)             |          0.568 |                 1.76 |
| meter array: writer.stage('spectrum', cb)          |          0.736 |                 1.36 |
| interleaved controller.update + processor.within   |          0.880 |                 1.14 |

## E2E setup: `spec → plan → backing → handoff → bindings`

| Spec size   | Mean setup time (ms) | Setups per second |
| ----------- | -------------------: | ----------------: |
| Small spec  |                0.024 |             41637 |
| Medium spec |                0.045 |             22358 |
| Large spec  |                0.067 |             14990 |

_Note:_ numbers are from a single Node 20 + Vitest bench run and are meant for relative comparison, not absolute tuning.
