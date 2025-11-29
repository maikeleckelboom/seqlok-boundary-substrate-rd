import { defineConfig, type UserConfigFnObject } from "vite";

const config: UserConfigFnObject = defineConfig(({ mode }) => ({
  define: {
    __SEQLOK_DEV_ASSERTS__: mode === "development" ? "true" : "false",
  },
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
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
}));

export default config;
