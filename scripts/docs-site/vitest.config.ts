import { defineConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { docsSiteCorePlugin } from "./vite";

const sitePackagePath = resolve(process.cwd(), "package.json");
const invocationHint = "Run DocsFn site tests from a consuming docs workspace, for example npm test --workspace @devfn/docs";
let sitePackage;
try {
  sitePackage = JSON.parse(readFileSync(sitePackagePath, "utf8"));
} catch (cause) {
  throw new Error(invocationHint, { cause });
}
if (!sitePackage?.name?.endsWith("/docs") || !sitePackage.dependencies?.["@docsfn/core"]) {
  throw new Error(invocationHint);
}

export default defineConfig({
  plugins: [docsSiteCorePlugin(pathToFileURL(sitePackagePath).href)],
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts"] },
});
