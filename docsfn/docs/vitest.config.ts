import path from "node:path";
import { sourceAliases } from "./source-aliases.mjs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      ...Object.entries(sourceAliases).map(([find, replacement]) => ({ find, replacement })),
      { find: "$lib", replacement: path.resolve(dirname, "src/lib") },
      { find: /^@docsfn\/core$/, replacement: path.resolve(dirname, "../core/src/index.ts") },
      { find: "@docsfn/provider-fs", replacement: path.resolve(dirname, "../provider-fs/src/index.ts") },
      { find: "@docsfn/sveltekit", replacement: path.resolve(dirname, "../sveltekit/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
