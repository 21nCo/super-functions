import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@secfn/core/id": resolve(__dirname, "../core/src/id.ts"),
      "@secfn/core": resolve(__dirname, "../core/src/index.ts"),
      "@superfunctions/db/adapters": resolve(__dirname, "../../packages/db/src/adapters/index.ts"),
      "@superfunctions/db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@superfunctions/http": resolve(__dirname, "../../packages/http/src/index.ts"),
      "@superfunctions/middleware/rate-limit": resolve(
        __dirname,
        "../../packages/middleware/src/rate-limit.ts"
      ),
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
