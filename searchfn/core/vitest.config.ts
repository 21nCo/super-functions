import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      provider: "v8"
    }
  }
});
