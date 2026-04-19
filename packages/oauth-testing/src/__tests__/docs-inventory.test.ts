import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const readmeInventory = [
  "packages/oauth-core/README.md",
  "packages/oauth-http/README.md",
  "packages/oauth-storage/README.md",
  "packages/oauth-providers/README.md",
  "packages/oauth-flow/README.md",
  "packages/oauth-testing/README.md",
  "packages/oauth-router/README.md",
];

describe("shared OAuth docs inventory", () => {
  it("keeps the audited package README set present and free of stale repo-doc links", () => {
    const missingFiles = readmeInventory.filter((file) => !existsSync(resolve(repoRoot, file)));
    expect(missingFiles).toEqual([]);

    const staleRepoDocLinks = readmeInventory.flatMap((file) => {
      const content = readFileSync(resolve(repoRoot, file), "utf8");
      const matches = content.match(/\.\.\/\.\.\/docs\/content\/docs\/[^\s)]+/g) ?? [];
      return matches.map((match) => `${file}:${match}`);
    });

    expect(staleRepoDocLinks).toEqual([]);
  });
});
