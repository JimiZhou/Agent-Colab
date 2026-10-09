import prettier from "prettier";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import * as contracts from "../packages/core/src/contracts.js";
mkdirSync("docs/schemas", { recursive: true });
for (const [name, schema] of Object.entries(contracts))
  if (name.endsWith("Schema") && schema instanceof z.ZodType)
    writeFileSync(
      `docs/schemas/${name}.json`,
      await prettier.format(JSON.stringify(z.toJSONSchema(schema)), {
        parser: "json",
      }),
    );
