import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { docsSiteCorePlugin } from "./vite";

// A plain config avoids loading a different root-hoisted Vitest during bootstrap.
export default {
  plugins: [docsSiteCorePlugin(pathToFileURL(resolve(process.cwd(), "package.json")).href)],
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["runtime.test.ts", "page.test.ts", "llms.test.mjs", "vite.test.mjs"] },
};
