import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @fileoverview
 * Format Vitest benchmark JSON into Markdown + ASCII charts
 * for Seqlok documentation.
 */

/**
 * Single benchmark sample as emitted by the Vitest bench JSON reporter.
 *
 * Durations are reported in milliseconds; we convert to microseconds
 * for hot-path charts and keep milliseconds for setup timings.
 */
interface BenchSample {
  readonly name: string;
  readonly hz: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p75: number;
  readonly p99: number;
  readonly p995: number;
  readonly p999: number;
}

/**
 * Logical benchmark group (suite) containing multiple named samples.
 */
interface BenchGroup {
  readonly fullName: string;
  readonly benchmarks: readonly BenchSample[];
}

/**
 * Single bench file entry as written by Vitest.
 *
 * The `filepath` is whatever Vitest reports for the test file and is
 * used here for suffix-based matching.
 */
interface BenchFile {
  readonly filepath: string;
  readonly groups: readonly BenchGroup[];
}

/**
 * Root bench report container. Matches `bench-results.json`.
 */
interface BenchReport {
  readonly files: readonly BenchFile[];
}

/**
 * Hot-path micro operation row for the tabular summary.
 */
interface MicroOpRow {
  readonly operation: string;
  readonly meanUs: number;
  readonly hz: number;
}

/**
 * End-to-end setup benchmark row.
 */
interface SetupRow {
  readonly label: string;
  readonly meanMs: number;
  readonly hz: number;
}

/**
 * Reference to a specific benchmark sample for chart extraction.
 *
 * Matching is performed by:
 *  - file suffix,
 *  - group name substring,
 *  - benchmark name.
 */
interface OpRef {
  readonly label: string;
  readonly fileSuffix: string;
  readonly groupMatch: string;
  readonly benchName: string;
}

/**
 * Single row in an ASCII chart: label + value in microseconds.
 */
interface ChartRow {
  readonly label: string;
  readonly valueUs: number;
}

/**
 * Loads a bench report from disk and parses it into a typed structure.
 *
 * @param path Absolute or relative path to `bench-results.json`.
 * @returns Parsed {@link BenchReport} instance.
 * @throws {Error} If the file cannot be read or the JSON is invalid.
 */
function loadReport(path: string): BenchReport {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as BenchReport;
}

/**
 * Locate a bench file by suffix.
 */
function findFile(report: BenchReport, needle: string): BenchFile {
  const file = report.files.find((f) => f.filepath.endsWith(needle));
  if (!file) {
    throw new Error(
      `Benchmark file ending with "${needle}" not found in bench-results.json`,
    );
  }
  return file;
}

/**
 * In all current benches, each file has exactly one group.
 * Keep this simple but explicit.
 */
function getSingleGroup(file: BenchFile): BenchGroup {
  if (file.groups.length !== 1) {
    throw new Error(
      `Expected exactly one group in "${file.filepath}", found ${String(
        file.groups.length,
      )}`,
    );
  }

  const group = file.groups[0];
  if (!group) {
    throw new Error(`Internal error: missing group at index 0 for "${file.filepath}"`);
  }

  return group;
}

/**
 * Find a benchmark by its name within a group.
 */
function findBench(group: BenchGroup, name: string): BenchSample {
  const bench = group.benchmarks.find((b) => b.name === name);
  if (!bench) {
    throw new Error(`Benchmark "${name}" not found in group "${group.fullName}"`);
  }
  return bench;
}

/**
 * Collect hot-path micro operations into a flat list for tabular output.
 *
 * Uses the param + MeterWriter + seqlock benches as the canonical set.
 */
function collectMicroOps(report: BenchReport): MicroOpRow[] {
  const rows: MicroOpRow[] = [];

  const seqlockFile = findFile(report, 'seqlock.bench.ts');
  const seqlockGroup = getSingleGroup(seqlockFile);

  const paramFile = findFile(report, 'param-operations.bench.ts');
  const paramGroup = getSingleGroup(paramFile);

  const metersFile = findFile(report, 'array-vs-stage-and-meters.bench.ts');
  const metersGroup = getSingleGroup(metersFile);

  const push = (operation: string, bench: BenchSample): void => {
    rows.push({
      operation,
      // JSON stores mean in milliseconds → convert to microseconds.
      meanUs: bench.mean * 1_000,
      hz: bench.hz,
    });
  };

  // Seqlock primitives
  push(
    'Seqlock tryRead uncontended',
    findBench(seqlockGroup, 'tryRead uncontended (spin=0, retry=0)'),
  );
  push('Seqlock publish uncontended', findBench(seqlockGroup, 'publish uncontended'));

  // Controller / processor param ops
  push(
    'controller.params.set (two scalars)',
    findBench(paramGroup, 'controller.params.set (two scalars)'),
  );
  push(
    'controller.params.update (3 scalars)',
    findBench(paramGroup, 'controller.params.update (3 scalars)'),
  );
  push(
    'controller.params.update (3 scalars + f32[8])',
    findBench(paramGroup, 'controller.params.update (3 scalars + f32[8])'),
  );
  push(
    'controller.params.hydrate (3 scalars + f32[8])',
    findBench(paramGroup, 'controller.params.hydrate (3 scalars + f32[8])'),
  );
  push(
    'controller.params.stage (eqBands f32[8])',
    findBench(paramGroup, 'controller.params.stage (eqBands f32[8])'),
  );
  push(
    'processor.params.within (scalars only)',
    findBench(paramGroup, 'processor.params.within (scalars only)'),
  );
  push(
    'processor.params.within (scalars + eqBands f32[8])',
    findBench(paramGroup, 'processor.params.within (scalars + eqBands f32[8])'),
  );
  push(
    'interleaved controller.update + processor.within',
    findBench(paramGroup, 'interleaved controller.update + processor.within'),
  );

  // MeterWriter sugar
  push(
    'meter scalar: writer.level(0.75)',
    findBench(metersGroup, 'meter scalar: writer.level(0.75)'),
  );
  push(
    "meter scalar: writer.set('level', 0.75)",
    findBench(metersGroup, "meter scalar: writer.set('level', 0.75)"),
  );
  push(
    "meter array: writer.stage('spectrum', cb)",
    findBench(metersGroup, "meter array: writer.stage('spectrum', cb)"),
  );

  // Sort by mean ascending for nicer tables.
  return [...rows].sort((a, b) => a.meanUs - b.meanUs);
}

/**
 * Collect end-to-end setup benchmarks.
 */
function collectSetup(report: BenchReport): SetupRow[] {
  const file = findFile(report, 'e2e-pipeline.bench.ts');
  const group = getSingleGroup(file);

  const mkRow = (label: string, benchName: string): SetupRow => {
    const bench = findBench(group, benchName);
    return {
      label,
      // JSON stores mean in milliseconds already.
      meanMs: bench.mean,
      hz: bench.hz,
    };
  };

  return [
    mkRow('Small spec', 'small spec: full setup'),
    mkRow('Medium spec', 'medium spec: full setup'),
    mkRow('Large spec', 'large spec: full setup'),
  ];
}

/**
 * Resolves a single benchmark mean value in microseconds for charting.
 *
 * This performs a strict lookup by:
 *  - file suffix,
 *  - group name substring,
 *  - benchmark name.
 */
function findMeanUs(report: BenchReport, ref: OpRef): number {
  const file = report.files.find((f) => f.filepath.endsWith(ref.fileSuffix));
  if (!file) {
    throw new Error(`Bench file not found for suffix "${ref.fileSuffix}"`);
  }

  const group = file.groups.find((g) => g.fullName.includes(ref.groupMatch));
  if (!group) {
    throw new Error(`Group "${ref.groupMatch}" not found in file "${file.filepath}"`);
  }

  const bench = group.benchmarks.find((b) => b.name === ref.benchName);
  if (!bench) {
    throw new Error(
      `Benchmark "${ref.benchName}" not found in group "${group.fullName}"`,
    );
  }

  // JSON uses milliseconds; convert to microseconds.
  return bench.mean * 1_000;
}

/**
 * Renders a compact left-aligned ASCII bar chart.
 *
 * Labels and numeric values are padded for alignment. Bars are normalized
 * against the largest value in the dataset.
 */
function renderAsciiChart(title: string, rows: readonly ChartRow[]): string {
  const maxLabelLen = rows.reduce(
    (acc, row) => (row.label.length > acc ? row.label.length : acc),
    0,
  );
  const maxValue = rows.reduce((acc, row) => (row.valueUs > acc ? row.valueUs : acc), 0);

  const maxBarWidth = 10;

  const lines: string[] = [];
  lines.push(title);
  lines.push('');

  for (const row of rows) {
    const barLength =
      maxValue > 0 ? Math.max(1, Math.round((row.valueUs / maxValue) * maxBarWidth)) : 1;
    const bar = '█'.repeat(barLength).padEnd(maxBarWidth, ' ');
    const labelPadded = row.label.padEnd(maxLabelLen, ' ');
    const valueStr = row.valueUs.toFixed(3).padStart(7, ' ');
    lines.push(`${labelPadded}  ${bar}  ${valueStr}`);
  }

  return lines.join('\n');
}

/**
 * Builds the dataset for the "cost ladder" chart.
 *
 * Each entry corresponds to a hot-path operation in the Seqlok kernel
 * or bindings. The mapping relies on current bench names and group
 * labels and will need maintenance if benchmarks are renamed.
 */
function buildCostLadder(report: BenchReport): ChartRow[] {
  const refs: readonly OpRef[] = [
    {
      label: 'Seqlock publish',
      fileSuffix: 'seqlock.bench.ts',
      groupMatch: 'Seqlock (micro): tryRead vs publish (uncontended)',
      benchName: 'publish uncontended',
    },
    {
      label: 'params.stage',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.stage (eqBands f32[8])',
    },
    {
      label: 'writer.set',
      fileSuffix: 'array-vs-stage-and-meters.bench.ts',
      groupMatch: 'MeterWriter sugar',
      benchName: "meter scalar: writer.set('level', 0.75)",
    },
    {
      label: 'writer.level',
      fileSuffix: 'array-vs-stage-and-meters.bench.ts',
      groupMatch: 'MeterWriter sugar',
      benchName: 'meter scalar: writer.level(0.75)',
    },
    {
      label: 'Seqlock tryRead',
      fileSuffix: 'seqlock.bench.ts',
      groupMatch: 'Seqlock (micro): tryRead vs publish (uncontended)',
      benchName: 'tryRead uncontended (spin=0, retry=0)',
    },
    {
      label: 'params.update',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.update (3 scalars)',
    },
    {
      label: 'params.set',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.set (two scalars)',
    },
    {
      label: 'params.hydrate',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.hydrate (3 scalars + f32[8])',
    },
    {
      label: 'params.update+array',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.update (3 scalars + f32[8])',
    },
    {
      label: 'processor.within',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'processor.params.within (scalars only)',
    },
    {
      label: 'processor.within+arr',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'processor.params.within (scalars + eqBands f32[8])',
    },
    {
      label: 'writer.stage',
      fileSuffix: 'array-vs-stage-and-meters.bench.ts',
      groupMatch: 'MeterWriter sugar',
      benchName: "meter array: writer.stage('spectrum', cb)",
    },
    {
      label: 'interleaved',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'interleaved controller.update + processor.within',
    },
  ];

  return refs.map((ref) => ({
    label: ref.label,
    valueUs: findMeanUs(report, ref),
  }));
}

/**
 * Builds the dataset for the parameter write strategies chart.
 *
 * Rows compare the relative cost of different controller-side write
 * APIs (stage, update, set, hydrate) over a shared spec.
 */
function buildParamWriteChart(report: BenchReport): ChartRow[] {
  const refs: readonly OpRef[] = [
    {
      label: 'stage (array only)',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.stage (eqBands f32[8])',
    },
    {
      label: 'update (scalars)',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.update (3 scalars)',
    },
    {
      label: 'set (scalars)',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.set (two scalars)',
    },
    {
      label: 'hydrate (mixed)',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.hydrate (3 scalars + f32[8])',
    },
    {
      label: 'update+array',
      fileSuffix: 'param-operations.bench.ts',
      groupMatch: 'Parameter operations',
      benchName: 'controller.params.update (3 scalars + f32[8])',
    },
  ];

  return refs.map((ref) => ({
    label: ref.label,
    valueUs: findMeanUs(report, ref),
  }));
}

/**
 * Render a markdown performance summary.
 *
 * This intentionally covers the "hot micro" and "E2E" parts;
 * higher-level narrative stays hand-written.
 */
function renderMarkdown(micro: MicroOpRow[], setup: SetupRow[]): string {
  const lines: string[] = [];

  const runIso = new Date().toISOString();

  const opHeader = 'Operation';
  const meanHeader = 'Mean time (µs)';
  const thrHeader = 'Throughput (M ops/s)';

  const meanStrings = micro.map((row) => row.meanUs.toFixed(3));
  const throughputStrings = micro.map((row) => (row.hz / 1_000_000).toFixed(2));

  const operationWidth = micro.reduce(
    (acc, row) => (row.operation.length > acc ? row.operation.length : acc),
    opHeader.length,
  );

  let meanWidth = meanHeader.length;
  for (const value of meanStrings) {
    if (value.length > meanWidth) {
      meanWidth = value.length;
    }
  }

  let throughputWidth = thrHeader.length;
  for (const value of throughputStrings) {
    if (value.length > throughputWidth) {
      throughputWidth = value.length;
    }
  }

  const specHeader = 'Spec size';
  const setupHeader = 'Mean setup time (ms)';
  const setupsPerSecHeader = 'Setups per second';

  const specStrings = setup.map((row) => row.label);
  const setupMeanStrings = setup.map((row) => row.meanMs.toFixed(3));
  const setupsPerSecStrings = setup.map((row) => Math.round(row.hz).toString());

  let specWidth = specHeader.length;
  for (const value of specStrings) {
    if (value.length > specWidth) {
      specWidth = value.length;
    }
  }

  let setupWidth = setupHeader.length;
  for (const value of setupMeanStrings) {
    if (value.length > setupWidth) {
      setupWidth = value.length;
    }
  }

  let setupsPerSecWidth = setupsPerSecHeader.length;
  for (const value of setupsPerSecStrings) {
    if (value.length > setupsPerSecWidth) {
      setupsPerSecWidth = value.length;
    }
  }

  lines.push('<!-- GENERATED FILE: do not edit by hand.');
  lines.push('     Regenerate via: pnpm bench:report -->');
  lines.push('');
  lines.push('# Bench Results');
  lines.push('');
  lines.push(
    '> Generated from `bench-results.json` by `scripts/format-bench.ts`.' +
      ' Re-run `pnpm bench:report` after changing benchmarks.',
  );
  lines.push('');
  lines.push(`_Bench run: ${runIso}_`);
  lines.push('');
  lines.push('## Hot path micro-operations');
  lines.push('');

  lines.push(
    `| ${opHeader.padEnd(operationWidth, ' ')} | ${meanHeader.padStart(
      meanWidth,
      ' ',
    )} | ${thrHeader.padStart(throughputWidth, ' ')} |`,
  );
  lines.push(
    `|${'-'.repeat(operationWidth + 2)}|${'-'.repeat(meanWidth + 1)}:|${'-'.repeat(
      throughputWidth + 1,
    )}:|`,
  );

  for (let i = 0; i < micro.length; i += 1) {
    const row = micro[i];
    const meanStr = meanStrings[i];
    const thrStr = throughputStrings[i];

    if (row === undefined || meanStr === undefined || thrStr === undefined) {
      throw new Error(
        `Internal error: mismatched micro row lengths at index ${String(i)}`,
      );
    }

    lines.push(
      `| ${row.operation.padEnd(operationWidth, ' ')} | ${meanStr.padStart(
        meanWidth,
        ' ',
      )} | ${thrStr.padStart(throughputWidth, ' ')} |`,
    );
  }

  lines.push('');
  lines.push('## E2E setup: `spec → plan → backing → handoff → bindings`');
  lines.push('');

  lines.push(
    `| ${specHeader.padEnd(specWidth, ' ')} | ${setupHeader.padStart(
      setupWidth,
      ' ',
    )} | ${setupsPerSecHeader.padStart(setupsPerSecWidth, ' ')} |`,
  );
  lines.push(
    `|${'-'.repeat(specWidth + 2)}|${'-'.repeat(setupWidth + 1)}:|${'-'.repeat(
      setupsPerSecWidth + 1,
    )}:|`,
  );

  for (let i = 0; i < setup.length; i += 1) {
    const row = setup[i];
    const meanStr = setupMeanStrings[i];
    const perSecStr = setupsPerSecStrings[i];

    if (row === undefined || meanStr === undefined || perSecStr === undefined) {
      throw new Error(
        `Internal error: mismatched setup row lengths at index ${String(i)}`,
      );
    }

    lines.push(
      `| ${row.label.padEnd(specWidth, ' ')} | ${meanStr.padStart(
        setupWidth,
        ' ',
      )} | ${perSecStr.padStart(setupsPerSecWidth, ' ')} |`,
    );
  }

  lines.push('');
  lines.push(
    '_Note:_ numbers are from a single Node 20 + Vitest bench run and are meant for relative comparison, not absolute tuning.',
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Entry point.
 *
 * Loads `bench-results.json`, generates:
 *  - docs/performance/bench-results.generated.md
 *  - docs/performance/bench-results.json (raw copy)
 * and prints an ASCII chart summary to stdout.
 */
function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));

  const defaultJsonPath = join(scriptDir, '..', 'bench-results.json');
  const defaultOutPath = join(
    scriptDir,
    '..',
    'docs',
    'performance',
    'bench-results.generated.md',
  );
  const defaultJsonCopyDest = join(
    scriptDir,
    '..',
    'docs',
    'performance',
    'bench-results.json',
  );

  const jsonPath = process.argv[2] ?? defaultJsonPath;
  const outPath = process.argv[3] ?? defaultOutPath;

  const report = loadReport(jsonPath);

  // Markdown summary (tables)
  const micro = collectMicroOps(report);
  const setup = collectSetup(report);
  const markdown = renderMarkdown(micro, setup);

  writeFileSync(outPath, markdown, 'utf8');

  console.log(`Bench summary written to ${outPath}`);

  // If caller didn't override the JSON path, also copy the raw JSON
  // next to the generated markdown so perf artifacts live together.
  if (process.argv[2] === undefined) {
    try {
      copyFileSync(jsonPath, defaultJsonCopyDest);

      console.log(`Bench JSON copied to ${defaultJsonCopyDest}`);
    } catch (err) {
      console.log(
        `Warning: could not copy bench JSON from ${jsonPath} to ${defaultJsonCopyDest}`,
        err,
      );
    }
  }

  // ASCII charts for quick copy-paste into docs / README.
  const costLadder = buildCostLadder(report);
  const paramWrites = buildParamWriteChart(report);

  const costChart = renderAsciiChart(
    'Hot Path Operations (µs) – lower is better',
    costLadder,
  );
  const paramChart = renderAsciiChart(
    'Parameter Writes (µs) – lower is better',
    paramWrites,
  );

  console.log('```');

  console.log(costChart);

  console.log();

  console.log(paramChart);

  console.log('```');
}

main();
