import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { docsSiteCorePlugin } from "./vite";
import type { ViteUserConfig } from "vitest/config";

// A plain config avoids loading a different root-hoisted Vitest during bootstrap.
export default {
  plugins: [docsSiteCorePlugin(pathToFileURL(resolve(process.cwd(), "package.json")).href)],
  resolve: { alias: { $lib: resolve(process.cwd(), "src/lib") } },
  // Runtime-only transforms must not borrow an unbuilt sibling's generated tsconfig.
  // Native type verification still uses each real SvelteKit-generated owner.
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", verbatimModuleSyntax: true } }) },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "auth-page.test.ts", "blog.test.ts", "llms.test.mjs", "vite.test.mjs", "dependency-owner.test.ts"] },
} satisfies ViteUserConfig;
