import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { loadLlmsSiteSource } from "./llms.mjs";

describe("LLM consumer content roots", () => {
  it.each(["default", "relative", "absolute"])("reads %s roots independently of the invocation directory", async (layout) => {
    const cwd = mkdtempSync(join(tmpdir(), "docs-llms-root-"));
    try {
      const contentRoot = layout === "default" ? cwd : join(cwd, "content");
      for (const directory of ["guide", "pages", "blog", "api", "static"]) {
        mkdirSync(join(contentRoot, directory), { recursive: true });
      }
      writeFileSync(join(contentRoot, "guide", "index.md"), "# Isolated fixture\n\nCorrect consumer body.");
      const config = {
        schemaVersion: 1,
        site: { title: "Fixture", basePath: "/docs" },
        content: {
          root: layout === "default" ? "." : layout === "absolute" ? contentRoot : "content",
          docsDir: "guide", pagesDir: "pages", blogDir: "blog", apiDir: "api", assetsDir: "static",
        },
        navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } },
        search: { enabled: false, scopes: [] },
      };
      writeFileSync(join(cwd, "docsfn.config.ts"), `export default ${JSON.stringify(config)};`);
      const source = await loadLlmsSiteSource(cwd, { buildManifest, loadDocsConfig, FsContentProvider });
      expect(source.manifest.pages["docs:index.md"].body).toContain("Correct consumer body.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
