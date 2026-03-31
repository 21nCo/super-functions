import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    include: ["__tests__/benchmarks.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
