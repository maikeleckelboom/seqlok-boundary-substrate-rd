import { createLibraryConfig } from "../../scripts/vite/vite.lib.config";

export default createLibraryConfig({
  entries: {
    index: "src/index.ts",
    diagnostics: "src/diagnostics.ts",
  },
});
