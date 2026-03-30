import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

function resolvePackageAlias(packageName: string, siblingSource: string): string {
  const siblingPath = resolve(__dirname, siblingSource);
  if (existsSync(siblingPath)) {
    return siblingPath;
  }

  return resolve(__dirname, `node_modules/${packageName}/dist/index.js`);
}

export default defineConfig({
  resolve: {
    alias: {
      "@searchfn/core": resolvePackageAlias("@searchfn/core", "../core/src/index.ts"),
      "@searchfn/adapter-contracts": resolvePackageAlias("@searchfn/adapter-contracts", "../adapter-contracts/src/index.ts"),
      "@searchfn/adapter-memory": resolvePackageAlias("@searchfn/adapter-memory", "../adapter-memory/src/index.ts"),
      "@searchfn/adapter-indexeddb": resolvePackageAlias("@searchfn/adapter-indexeddb", "../adapter-indexeddb/src/index.ts"),
    },
  },
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
