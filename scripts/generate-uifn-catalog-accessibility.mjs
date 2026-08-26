import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(repoRoot, "uifn", "catalog", "generated", "catalog.json");
const outputPath = path.join(
  repoRoot,
  "uifn",
  "examples",
  "shared",
  "src",
  "catalog-accessibility.generated.ts"
);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const accessibilityBySlug = Object.fromEntries(
  catalog.primitives.map((primitive) => [
    primitive.id,
    {
      profile: primitive.accessibility.profile,
      primitiveNotes: primitive.accessibility.primitiveNotes,
      rules: primitive.accessibility.rules,
    },
  ])
);
const output = `// Generated from uifn/catalog/generated/catalog.json. Do not edit by hand.\n` +
  `export const CATALOG_ACCESSIBILITY = ${JSON.stringify(accessibilityBySlug, null, 2)} as const;\n`;

if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) {
  fs.writeFileSync(outputPath, output);
}

console.log(JSON.stringify({
  ok: true,
  command: "generate:uifn-catalog-accessibility",
  primitiveCount: Object.keys(accessibilityBySlug).length,
  outputPath,
}));
