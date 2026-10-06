import type { ViteUserConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { docsSiteCorePlugin } from "./vite";

const hint = "Run DocsFn site tests from a consuming docs workspace, for example npm test --workspace @devfn/docs (or set DOCS_SITE_DIR)";
const sitePackagePath = process.env.DOCS_SITE_DIR
  ? resolve(process.env.DOCS_SITE_DIR, "package.json")
  : resolve(process.env.npm_package_json ?? resolve(process.cwd(), "package.json"));
let sitePackage: unknown;
try {
  sitePackage = JSON.parse(readFileSync(sitePackagePath, "utf8"));
} catch {
  throw new Error(hint);
}
if (!sitePackage || typeof sitePackage !== "object" || !("name" in sitePackage) ||
    typeof sitePackage.name !== "string" || !sitePackage.name.endsWith("/docs") ||
    !("dependencies" in sitePackage) || !sitePackage.dependencies ||
    typeof sitePackage.dependencies !== "object" || !("@docsfn/core" in sitePackage.dependencies) ||
    typeof sitePackage.dependencies["@docsfn/core"] !== "string") {
  throw new Error(hint);
}

export default {
  plugins: [docsSiteCorePlugin(pathToFileURL(sitePackagePath).href)],
  resolve: { alias: { $lib: resolve(dirname(sitePackagePath), "src/lib") } },
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", verbatimModuleSyntax: true } }) },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "blog.test.ts", "llms.test.mjs", "vite.test.mjs", "dependency-owner.test.ts"] },
} satisfies ViteUserConfig;
