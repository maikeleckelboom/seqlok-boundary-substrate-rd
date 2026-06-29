import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import DefaultTheme from "vitepress/theme";

import "@shikijs/vitepress-twoslash/style.css";
import "./custom.css";

import type { Theme } from "vitepress";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.use(TwoslashFloatingVue);
  },
} satisfies Theme;
