import type { ViteUserConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { docsSiteCorePlugin } from "./vite";

const sitePackagePath = resolve(process.cwd(), "package.json");
const sitePackage: unknown = JSON.parse(readFileSync(sitePackagePath, "utf8"));
if (!sitePackage || typeof sitePackage !== "object" || !("name" in sitePackage) ||
    typeof sitePackage.name !== "string" || !sitePackage.name.endsWith("/docs")) {
  throw new Error("Run DocsFn site tests from a consuming docs workspace, for example npm test --workspace @botfn/docs");
}

export default {
  plugins: [docsSiteCorePlugin(pathToFileURL(sitePackagePath).href)],
  resolve: { alias: { $lib: resolve(process.cwd(), "src/lib") } },
  // Runtime transforms do not borrow another owner's generated Kit config.
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", verbatimModuleSyntax: true } }) },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "blog.test.ts", "llms.test.mjs", "vite.test.mjs", "dependency-owner.test.ts"] },
} satisfies ViteUserConfig;
