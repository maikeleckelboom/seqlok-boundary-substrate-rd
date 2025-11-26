import {mergeConfig, type UserConfig} from "vite";
import {defineConfig} from "vitest/config";

import viteConfig from "./vite.config";

const config = mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      reporters: ["default"],
      environment: "jsdom",
      fileParallelism: false,
      isolate: false,
      testTimeout: 30_000,
      hookTimeout: 15_000,
      include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
      exclude: ["dist/**", "node_modules/**"],
      coverage: {
        provider: "v8",
        enabled: false,
        reporter: ["text", "html", "lcov"],
        exclude: ["dist/**"],
      },
    },
  }),
) as UserConfig;

export default config;
