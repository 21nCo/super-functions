import { defineConfig } from "vitest/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { docsSiteCorePlugin } from "./vite";

export default defineConfig({
  plugins: [docsSiteCorePlugin(pathToFileURL(resolve(process.cwd(), "package.json")).href)],
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts"] },
});
