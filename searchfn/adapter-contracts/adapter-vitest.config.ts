import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vitest/config";

const testingSource = fileURLToPath(new URL("./src/testing.ts", import.meta.url));

/** Workspace Vitest config so adapter tests resolve the harness source without a prior dist build. */
export function searchfnAdapterVitestConfig(overrides: UserConfig = {}): UserConfig {
  const inheritedAliases = overrides.resolve?.alias;
  const alias = Array.isArray(inheritedAliases)
    ? [
        { find: "@searchfn/adapter-contracts/testing", replacement: testingSource },
        ...inheritedAliases
      ]
    : {
        ...inheritedAliases,
        "@searchfn/adapter-contracts/testing": testingSource
      };

  return defineConfig({
    ...overrides,
    resolve: {
      ...overrides.resolve,
      alias
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
