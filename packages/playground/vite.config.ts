import { defineConfig, type UserConfig } from "vite";

export default defineConfig({
  resolve: {
    conditions: ["source", "import", "module", "browser", "default"],
  },
  optimizeDeps: {
    exclude: [
      "@seqlok/foundation",
      "@seqlok/primitives",
      "@seqlok/diagnostics",
      "@seqlok/core",
      "@seqlok/commands",
      "@seqlok/hotswap",
      "@seqlok/integration",
    ],
  },
  server: {
    watch: {
      ignored: ["!**/node_modules/@seqlok/**"],
    },
  },
  build: {
    sourcemap: true,
  },
}) satisfies UserConfig;
