import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vitest/config";

const testingSource = fileURLToPath(new URL("./src/testing.ts", import.meta.url));

/** Workspace Vitest config so adapter tests resolve the harness source without a prior dist build. */
export function searchfnAdapterVitestConfig(overrides: UserConfig = {}): UserConfig {
  return defineConfig({
    ...overrides,
    resolve: {
      ...overrides.resolve,
      alias: {
        "@searchfn/adapter-contracts/testing": testingSource
      }
    },
    test: {
      globals: true,
      environment: "node",
      include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"],
      ...overrides.test
    }
  });
}

export default searchfnAdapterVitestConfig();
