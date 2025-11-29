import type { UserConfig } from "vite";
import { createSeqlokWorkspaceAliases } from "./workspace-aliases";

export interface ViteLibConfigOptions {
  readonly entryRelative: string;
}

/**
 * Shared Vite library config for Seqlok packages.
 *
 * - Uses workspace aliases resolved via the workspace sentinel
 * - Emits a single ES module bundle to `dist/index.js`
 */
export function createLibraryViteConfig(
  options: ViteLibConfigOptions,
): UserConfig {
  const { entryRelative } = options;

  const aliases = createSeqlokWorkspaceAliases();

  return {
    resolve: {
      alias: aliases,
    },
    define: {
      __SEQLOK_DEV_ASSERTS__: "true",
    },
    build: {
      lib: {
        entry: {
          index: entryRelative,
        },
        formats: ["es"],
        fileName: (_format, entry) => `${entry}.js`,
      },
      minify: "esbuild",
      sourcemap: true,
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          preserveModules: false,
        },
      },
    },
    esbuild: {
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      legalComments: "none",
    },
  };
}
