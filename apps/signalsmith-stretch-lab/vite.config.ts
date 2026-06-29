import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const boundarySource = fileURLToPath(
  new URL("../../packages/core/src/index.ts", import.meta.url),
);

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  build: {
    target: "es2022",
  },
  preview: {
    headers: isolationHeaders,
  },
  resolve: {
    alias: {
      "@exclave/boundary": boundarySource,
    },
  },
  server: {
    headers: isolationHeaders,
  },
});
