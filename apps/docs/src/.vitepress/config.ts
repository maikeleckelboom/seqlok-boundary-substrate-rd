import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Exclave Boundary",
  description:
    "typed shared-memory boundary substrate for coherent state, deterministic layout, explicit handoff, and timing-sensitive runtimes.",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Exclave Boundary", link: "/" },
      { text: "Guide", link: "/quickstart" },
      { text: "API", link: "/api" },
      { text: "Release", link: "/release-checklist" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Install", link: "/install" },
          { text: "Quickstart", link: "/quickstart" },
          { text: "Boundary Flow", link: "/core-flow" },
        ],
      },
      {
        text: "Model",
        items: [
          { text: "Authored AST vs Runtime", link: "/authoring-contract" },
          { text: "API Reference", link: "/api" },
          { text: "Examples", link: "/examples" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Migration Notes", link: "/migration" },
          { text: "Package Boundaries", link: "/package-boundaries" },
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
