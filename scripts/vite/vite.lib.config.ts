import { defineConfig } from "vite";

import type { UserConfig } from "vite";

export interface LibraryConfigOptions {
  readonly entries: Readonly<Record<string, string>>;
}

export function createLibraryConfig(options: LibraryConfigOptions): UserConfig {
  return defineConfig(({ mode }) => ({
    define: {
      __SEQLOK_DEV_ASSERTS__: mode === "development" ? "true" : "false",
    },
    build: {
      lib: {
        entry: options.entries,
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
  }));
}
