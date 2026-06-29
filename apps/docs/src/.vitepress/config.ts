import { fileURLToPath } from "node:url";

import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import { createFileSystemTypesCache } from "@shikijs/vitepress-twoslash/cache-fs";
import ts from "typescript";
import { defineConfig } from "vitepress";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const twoslashCacheDir = fileURLToPath(
  new URL("./cache/twoslash", import.meta.url),
);

export default defineConfig({
  title: "Exclave Boundary",
  description:
    "typed shared-memory boundary substrate for coherent state, deterministic layout, explicit handoff, and timing-sensitive runtimes.",
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    languages: ["js", "jsx", "ts", "tsx", "json", "vue"],
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache({
          dir: twoslashCacheDir,
        }),
        twoslashOptions: {
          compilerOptions: {
            baseUrl: repoRoot,
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            paths: {
              "@exclave/boundary": ["packages/core/src/index.ts"],
              "@exclave/boundary/diagnostics": [
                "packages/core/src/diagnostics.ts",
              ],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: [],
          },
        },
      }),
    ],
  },
  themeConfig: {
    nav: [
      { text: "Start", link: "/quickstart" },
      { text: "Concepts", link: "/core-flow" },
      { text: "API", link: "/api" },
      { text: "Examples", link: "/examples" },
      { text: "Internals", link: "/memory-layout" },
      { text: "Blog", link: "/blog/" },
      { text: "Release", link: "/release-checklist" },
    ],
    outline: {
      level: [2, 3],
    },
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Install", link: "/install" },
          { text: "Quickstart", link: "/quickstart" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Boundary Flow", link: "/core-flow" },
          { text: "Authored AST vs Runtime", link: "/authoring-contract" },
          { text: "Handoff and Acceptance", link: "/handoff-acceptance" },
          { text: "Controller, Processor, Observer", link: "/roles" },
        ],
      },
      {
        text: "API",
        items: [
          { text: "API Reference", link: "/api" },
          { text: "Diagnostics", link: "/diagnostics" },
          { text: "Error Model", link: "/error-model" },
        ],
      },
      {
        text: "Examples",
        items: [{ text: "Examples", link: "/examples" }],
      },
      {
        text: "Internals",
        items: [
          { text: "Memory and Layout Model", link: "/memory-layout" },
          { text: "Package Boundaries", link: "/package-boundaries" },
          { text: "Migration from Seqlok", link: "/migration" },
        ],
      },
      {
        text: "Blog",
        items: [
          { text: "Blog Index", link: "/blog/" },
          {
            text: "Why Exclave Boundary exists",
            link: "/blog/why-exclave-boundary-exists",
          },
          {
            text: "Specs, layout, and handoff",
            link: "/blog/specs-layout-handoff-boundary-contract",
          },
        ],
      },
      {
        text: "Release",
        items: [
          { text: "FAQ", link: "/faq" },
          { text: "Release Checklist", link: "/release-checklist" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
  },
});
