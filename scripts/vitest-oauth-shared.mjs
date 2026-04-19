import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function fromRoot(relativePath) {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

const oauthSharedWorkspaceAliases = [
  {
    find: /^@superfunctions\/db\/adapters$/,
    replacement: fromRoot("packages/db/src/adapters/index.ts"),
  },
  {
    find: /^@superfunctions\/db\/testing$/,
    replacement: fromRoot("packages/db/src/testing/index.ts"),
  },
  {
    find: /^@superfunctions\/db$/,
    replacement: fromRoot("packages/db/src/index.ts"),
  },
  {
    find: /^@superfunctions\/http\/middleware$/,
    replacement: fromRoot("packages/http/src/middleware/index.ts"),
  },
  {
    find: /^@superfunctions\/http$/,
    replacement: fromRoot("packages/http/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-core$/,
    replacement: fromRoot("packages/oauth-core/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-http$/,
    replacement: fromRoot("packages/oauth-http/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-storage$/,
    replacement: fromRoot("packages/oauth-storage/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-providers$/,
    replacement: fromRoot("packages/oauth-providers/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-flow$/,
    replacement: fromRoot("packages/oauth-flow/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-testing$/,
    replacement: fromRoot("packages/oauth-testing/src/index.ts"),
  },
  {
    find: /^@superfunctions\/oauth-router$/,
    replacement: fromRoot("packages/oauth-router/src/index.ts"),
  },
];

export function createOAuthSharedVitestConfig() {
  return defineConfig({
    resolve: {
      alias: oauthSharedWorkspaceAliases,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
      exclude: ["dist/**", "node_modules/**"],
    },
  });
}
