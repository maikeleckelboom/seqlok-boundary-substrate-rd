import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PACKAGES: readonly string[] = [
  "base",
  "primitives",
  "core",
  "commands",
  "hotswap",
  "integration",
  "introspect",
  "streambuf",
];

interface TypeSummary {
  readonly packageName: string;
  readonly hasIndex: boolean;
  readonly extraDtsFiles: readonly string[];
  readonly workspaceImports: readonly string[];
  readonly badRelativeImports: readonly string[];
  readonly sizeBytes: number;
}

interface Colors {
  readonly dim: (text: string) => string;
  readonly green: (text: string) => string;
  readonly red: (text: string) => string;
  readonly yellow: (text: string) => string;
}

function supportsColor(): boolean {
  if (process.env.NO_COLOR != null) {
    return false;
  }
  return typeof process.stdout.isTTY === "boolean" && process.stdout.isTTY;
}

function createColors(): Colors {
  if (!supportsColor()) {
    return {
      dim: (text) => text,
      green: (text) => text,
      red: (text) => text,
      yellow: (text) => text,
    };
  }

  const wrap = (code: number) => (text: string) =>
    `\x1b[${code}m${text}\x1b[0m`;

  return {
    dim: wrap(90),
    green: wrap(32),
    red: wrap(31),
    yellow: wrap(33),
  };
}

const colors = createColors();

function readIndexDts(packageName: string): string | null {
  const filePath = join("packages", packageName, "dist", "index.d.ts");
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function listDtsFiles(packageName: string): string[] {
  const distDir = join("packages", packageName, "dist");
  try {
    const entries = readdirSync(distDir);
    return entries.filter((entry) => entry.endsWith(".d.ts"));
  } catch {
    return [];
  }
}

function analyzeImports(content: string): {
  workspaceImports: string[];
  badRelativeImports: string[];
} {
  const importPattern = /^import\s+[^;]*?from\s+["']([^"']+)["'];/gm;
  const workspaceImports: string[] = [];
  const badRelativeImports: string[] = [];

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = importPattern.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier == null) {
      continue;
    }

    if (specifier.startsWith("@seqlok/")) {
      workspaceImports.push(specifier);
    }

    if (specifier.startsWith("..")) {
      badRelativeImports.push(specifier);
    }
  }

  return { workspaceImports, badRelativeImports };
}

function summarizePackage(packageName: string): TypeSummary {
  const indexContent = readIndexDts(packageName);
  const dtsFiles = listDtsFiles(packageName).filter(
    (name) => name !== "index.d.ts",
  );

  if (indexContent === null) {
    return {
      packageName,
      hasIndex: false,
      extraDtsFiles: dtsFiles,
      workspaceImports: [],
      badRelativeImports: [],
      sizeBytes: 0,
    };
  }

  const { workspaceImports, badRelativeImports } = analyzeImports(indexContent);
  const sizeBytes = Buffer.byteLength(indexContent, "utf8");

  return {
    packageName,
    hasIndex: true,
    extraDtsFiles: dtsFiles,
    workspaceImports,
    badRelativeImports,
    sizeBytes,
  };
}

function formatSize(bytes: number): string {
  const kilobytes = bytes / 1024;
  return `${kilobytes.toFixed(2)} KB`;
}

function main(): void {
  const summaries: TypeSummary[] = PACKAGES.map(summarizePackage);
  const showImports =
    process.argv.includes("--imports") || process.argv.includes("--verbose");

  let hasError = false;

  // Compute header column width
  let maxHeaderLength = 0;
  for (const summary of summaries) {
    const header = `@seqlok/${summary.packageName}`;
    if (header.length > maxHeaderLength) {
      maxHeaderLength = header.length;
    }
  }

  // One compact line per package
  for (const summary of summaries) {
    const header = `@seqlok/${summary.packageName}`;

    if (!summary.hasIndex) {
      // eslint-disable-next-line no-console
      console.error(colors.red(`${header}  missing dist/index.d.ts`));
      hasError = true;
      continue;
    }

    const sizeStr = formatSize(summary.sizeBytes);
    const paddedHeader = header.padEnd(maxHeaderLength, " ");
    const sizeCol = colors.dim(sizeStr.padStart(10, " "));

    const parts: string[] = [];

    if (summary.extraDtsFiles.length > 0) {
      const extra = summary.extraDtsFiles.join(", ");
      parts.push(colors.yellow(`extra .d.ts: ${extra}`));
    }

    if (summary.badRelativeImports.length > 0) {
      hasError = true;
      const uniqueBad = Array.from(new Set(summary.badRelativeImports)).sort();
      parts.push(colors.red(`relative imports: ${uniqueBad.join(", ")}`));
    }

    if (showImports && summary.workspaceImports.length > 0) {
      const uniqueImports = Array.from(
        new Set(summary.workspaceImports),
      ).sort();
      parts.push(`imports: ${uniqueImports.join(", ")}`);
    }

    const suffix = parts.length > 0 ? `  | ${parts.join(" | ")}` : "";

    // eslint-disable-next-line no-console
    console.log(`${colors.green(paddedHeader)} ${sizeCol}${suffix}`);
  }

  if (hasError) {
    process.exitCode = 1;
  }
}

main();
