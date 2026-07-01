/* eslint-disable no-console */

import {
  ALL_PLANES,
  BYTES_PER_ELEM,
} from "../../packages/core/src/primitives/planes.ts";

import type { PlaneKey } from "../../packages/core/src/primitives/planes.ts";

type OutputMode = "full" | "compact";

type CliFlags = Readonly<{
  mode: OutputMode;
  json: boolean;
  help: boolean;
}>;

type KindRow = Readonly<{
  section: "param" | "meter";
  kind: string;
  shape: "scalar" | "array";
  plane: PlaneKey;
  view: string;
  bytesPerElement: number;
}>;

type SupportReport = Readonly<{
  nodeVersion: string;
  runtime: Readonly<{
    sharedArrayBuffer: boolean;
    atomics: boolean;
    wasmSharedMemory: boolean;
    backingsAvailable: readonly string[];
  }>;
  planes: readonly Readonly<{
    plane: PlaneKey;
    role: string;
    view: string;
    bytesPerElement: number;
  }>[];
  kinds: readonly KindRow[];
}>;

type ColorFn = (value: string) => string;
type Style = Readonly<{
  bold: ColorFn;
  green: ColorFn;
  red: ColorFn;
  yellow: ColorFn;
  gray: ColorFn;
  cyan: ColorFn;
}>;

const PARAM_KINDS: readonly string[] = [
  "f32",
  "i32",
  "u32",
  "bool",
  "enum",
  "f32.array",
  "i32.array",
  "u32.array",
  "u8.array",
  "i8.array",
  "i16.array",
  "u16.array",
  "bool.array",
  "enum.array",
] as const;

const METER_KINDS: readonly string[] = [
  "f32",
  "f64",
  "i32",
  "u32",
  "bool",
  "enum",
  "f32.array",
  "f64.array",
  "u32.array",
  "bool.array",
] as const;

function planeOfParamKind(kind: string): PlaneKey {
  switch (kind) {
    case "f32":
    case "f32.array":
      return "PF32";
    case "i32":
    case "u32":
    case "enum":
    case "i32.array":
    case "u32.array":
    case "enum.array":
      return "PI32";
    case "bool":
    case "u8.array":
    case "i8.array":
    case "i16.array":
    case "u16.array":
    case "bool.array":
      return "PB";
    default:
      throw new Error(`Unknown param kind: ${kind}`);
  }
}

function planeOfMeterKind(kind: string): PlaneKey {
  switch (kind) {
    case "f32":
    case "f32.array":
      return "MF32";
    case "f64":
    case "f64.array":
      return "MF64";
    case "i32":
    case "u32":
    case "bool":
    case "enum":
    case "u32.array":
    case "bool.array":
      return "MU32";
    default:
      throw new Error(`Unknown meter kind: ${kind}`);
  }
}

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  return process.env.FORCE_COLOR !== undefined || process.stdout.isTTY;
}

function style(enabled: boolean): Style {
  const wrap =
    (open: string, close: string): ColorFn =>
    (value: string) =>
      enabled ? `${open}${value}${close}` : value;

  return {
    bold: wrap("\u001b[1m", "\u001b[22m"),
    green: wrap("\u001b[32m", "\u001b[39m"),
    red: wrap("\u001b[31m", "\u001b[39m"),
    yellow: wrap("\u001b[33m", "\u001b[39m"),
    gray: wrap("\u001b[90m", "\u001b[39m"),
    cyan: wrap("\u001b[36m", "\u001b[39m"),
  };
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

function width(value: string): number {
  return Array.from(stripAnsi(value)).length;
}

function pad(value: string, target: number): string {
  const current = width(value);
  return current >= target ? value : `${value}${" ".repeat(target - current)}`;
}

function planeView(plane: PlaneKey): string {
  switch (plane) {
    case "PF32":
    case "MF32":
      return "Float32Array";
    case "MF64":
      return "Float64Array";
    case "PI32":
      return "Int32Array";
    case "PB":
      return "Uint8Array";
    case "PU":
    case "MU32":
    case "MU":
      return "Uint32Array";
  }
}

function planeRole(plane: PlaneKey): string {
  if (plane === "PU") {
    return "param lock";
  }
  if (plane === "MU") {
    return "meter lock";
  }
  if (plane.startsWith("P")) {
    return "param data";
  }
  return "meter data";
}

function isArrayKind(kind: string): boolean {
  return kind.endsWith(".array");
}

function detectRuntime(): SupportReport["runtime"] {
  const sharedArrayBuffer = typeof globalThis.SharedArrayBuffer === "function";
  const atomics = typeof globalThis.Atomics === "object";

  let wasmSharedMemory = false;
  try {
    new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    wasmSharedMemory = true;
  } catch {
    wasmSharedMemory = false;
  }

  const backingsAvailable = [
    sharedArrayBuffer && atomics ? "packed" : undefined,
    sharedArrayBuffer && atomics ? "partitioned" : undefined,
    wasmSharedMemory && atomics ? "wasm" : undefined,
  ].filter((value): value is string => value !== undefined);

  return {
    sharedArrayBuffer,
    atomics,
    wasmSharedMemory,
    backingsAvailable,
  };
}

function buildReport(): SupportReport {
  const paramKinds = PARAM_KINDS.map((kind): KindRow => {
    const plane = planeOfParamKind(kind);
    return {
      section: "param",
      kind,
      shape: isArrayKind(kind) ? "array" : "scalar",
      plane,
      view: planeView(plane),
      bytesPerElement: BYTES_PER_ELEM[plane],
    };
  });

  const meterKinds = METER_KINDS.map((kind): KindRow => {
    const plane = planeOfMeterKind(kind);
    return {
      section: "meter",
      kind,
      shape: isArrayKind(kind) ? "array" : "scalar",
      plane,
      view: planeView(plane),
      bytesPerElement: BYTES_PER_ELEM[plane],
    };
  });

  return {
    nodeVersion: process.version,
    runtime: detectRuntime(),
    planes: ALL_PLANES.map((plane) => ({
      plane,
      role: planeRole(plane),
      view: planeView(plane),
      bytesPerElement: BYTES_PER_ELEM[plane],
    })),
    kinds: [...paramKinds, ...meterKinds],
  };
}

function parseArgs(): CliFlags {
  const args = process.argv.slice(2);
  let mode: OutputMode = "full";
  let json = false;
  let help = false;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--compact") {
      mode = "compact";
    } else if (arg === "--full") {
      mode = "full";
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return { mode, json, help };
}

function printHelp(): void {
  console.log(`Usage: pnpm support [flags]

Flags:
  --compact   Summary plus runtime backing support
  --full      Full support matrix [default]
  --json      Output machine-readable JSON
  --help      Show this help
`);
}

function renderTable(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  s: Style,
): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => width(row[index] ?? ""))),
  );
  const line = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
  const renderRow = (row: readonly string[]) =>
    `| ${widths.map((w, index) => pad(row[index] ?? "", w)).join(" | ")} |`;

  return [
    s.bold(title),
    renderRow(headers.map((header) => s.cyan(header))),
    line,
    ...rows.map(renderRow),
  ].join("\n");
}

function yesNo(value: boolean, s: Style): string {
  return value ? s.green("yes") : s.red("no");
}

function renderText(report: SupportReport, flags: CliFlags): string {
  const s = style(colorEnabled());
  const runtimeRows = [
    ["Node", report.nodeVersion],
    ["SharedArrayBuffer", yesNo(report.runtime.sharedArrayBuffer, s)],
    ["Atomics", yesNo(report.runtime.atomics, s)],
    ["Wasm shared memory", yesNo(report.runtime.wasmSharedMemory, s)],
    [
      "Available backings",
      report.runtime.backingsAvailable.length > 0
        ? report.runtime.backingsAvailable.join(", ")
        : s.yellow("none"),
    ],
  ];

  const sections = [
    renderTable("Runtime", ["Feature", "Value"], runtimeRows, s),
  ];

  if (flags.mode === "compact") {
    sections.push(
      renderTable(
        "Summary",
        ["Area", "Count"],
        [
          ["Planes", String(report.planes.length)],
          [
            "Param kinds",
            String(
              report.kinds.filter((kind) => kind.section === "param").length,
            ),
          ],
          [
            "Meter kinds",
            String(
              report.kinds.filter((kind) => kind.section === "meter").length,
            ),
          ],
        ],
        s,
      ),
    );
    return sections.join("\n\n");
  }

  sections.push(
    renderTable(
      "Planes",
      ["Plane", "Role", "View", "Bytes/elem"],
      report.planes.map((plane) => [
        plane.plane,
        plane.role,
        plane.view,
        String(plane.bytesPerElement),
      ]),
      s,
    ),
  );

  sections.push(
    renderTable(
      "Param Kinds",
      ["Kind", "Shape", "Plane", "View", "Bytes/elem"],
      report.kinds
        .filter((kind) => kind.section === "param")
        .map((kind) => [
          kind.kind,
          kind.shape,
          kind.plane,
          kind.view,
          String(kind.bytesPerElement),
        ]),
      s,
    ),
  );

  sections.push(
    renderTable(
      "Meter Kinds",
      ["Kind", "Shape", "Plane", "View", "Bytes/elem"],
      report.kinds
        .filter((kind) => kind.section === "meter")
        .map((kind) => [
          kind.kind,
          kind.shape,
          kind.plane,
          kind.view,
          String(kind.bytesPerElement),
        ]),
      s,
    ),
  );

  return sections.join("\n\n");
}

function main(): void {
  try {
    const flags = parseArgs();
    if (flags.help) {
      printHelp();
      return;
    }

    const report = buildReport();
    console.log(
      flags.json ? JSON.stringify(report, null, 2) : renderText(report, flags),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
