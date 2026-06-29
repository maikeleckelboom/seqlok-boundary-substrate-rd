import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Seqlok Core",
  description:
    "Typed shared-memory boundary substrate for controller, processor, and observer flows.",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
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
          { text: "Core Flow", link: "/core-flow" },
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
