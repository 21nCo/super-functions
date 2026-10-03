import { defineConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { docsSiteCorePlugin } from "./vite";

const sitePackagePath = resolve(process.cwd(), "package.json");
const sitePackage = JSON.parse(readFileSync(sitePackagePath, "utf8"));
if (!sitePackage.name?.endsWith("/docs") || !sitePackage.dependencies?.["@docsfn/core"]) {
  throw new Error("Run DocsFn site tests from a consuming docs workspace, for example npm test --workspace @botfn/docs");
}

export default defineConfig({
  plugins: [docsSiteCorePlugin(pathToFileURL(sitePackagePath).href)],
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "llms.test.mjs"] },
});
