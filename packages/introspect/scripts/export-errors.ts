import { writeFileSync } from "node:fs";

import { buildErrorRegistrySchema } from "../src/errors/export-json";

const schema = buildErrorRegistrySchema();
writeFileSync(
  "dist/error-registry.schema.json",
  JSON.stringify(schema, null, 2),
);
