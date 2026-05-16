import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@apifn/collections": path.resolve(__dirname, "../collections/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
  },
});
