import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const docsInventory = [
  "packages/oauth-core/README.md",
  "packages/oauth-http/README.md",
  "packages/oauth-storage/README.md",
  "packages/oauth-providers/README.md",
  "packages/oauth-flow/README.md",
  "packages/oauth-testing/README.md",
  "packages/oauth-router/README.md",
  "docs/content/docs/authentication/oauth-storage.mdx",
  "docs/content/docs/authentication/oauth-flow.mdx",
  "docs/content/docs/authentication/oauth-providers.mdx",
  "docs/content/docs/authentication/oauth-router.mdx",
  "docs/content/docs/architecture/oauth-flow-architecture.mdx",
];

describe("shared OAuth docs inventory", () => {
  it("keeps the audited README and docs set present and navigable", () => {
    const missingFiles = docsInventory.filter((file) => !existsSync(resolve(repoRoot, file)));
    expect(missingFiles).toEqual([]);

    const nav = JSON.parse(
      readFileSync(resolve(repoRoot, "docs/content/docs/authentication/meta.json"), "utf8"),
    ) as { pages?: string[] };

    expect(nav.pages).toContain("oauth-router");
  });
});
