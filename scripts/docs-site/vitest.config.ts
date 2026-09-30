import { defineConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { docsSiteCorePlugin } from "./vite";

export default defineConfig({
  plugins: [docsSiteCorePlugin(pathToFileURL(resolve(process.cwd(), "package.json")).href)],
  resolve: { alias: { $lib: resolve(process.cwd(), "src/lib") } },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "auth-page.test.ts", "llms.test.mjs"] },
});
