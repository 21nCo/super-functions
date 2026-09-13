import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@secfn/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      provider: "v8",
    },
  },
});
