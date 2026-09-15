import { defineConfig } from "vitest/config";
import { adapterContractsTestingAlias } from "../adapter-contracts/testing-alias";

export default defineConfig({
  resolve: {
    alias: adapterContractsTestingAlias
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"]
  }
});
