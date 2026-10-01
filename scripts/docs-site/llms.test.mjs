import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, loadDocsConfig, buildLlmsTxtArtifacts } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { buildLlmsSiteArtifacts } from "./llms.mjs";

describe("real filesystem LLM consumer root/canonical override", () => {
  it.each(["default", "relative", "absolute"])("reads %s root consistently across provider and manifest", async layout => {
    const cwd = mkdtempSync(join(tmpdir(), "docs-root-"));
    try {
      const root = layout === "default" ? cwd : join(cwd, "content");
      for (const dir of ["guide", "pages", "blog", "api", "static"]) mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, "guide/index.md"), "# Fixture\n\nCorrect consumer body.");
      writeFileSync(join(cwd, "docsfn.config.ts"), `export default ${JSON.stringify({ schemaVersion: 1, site: { title: "Fixture", basePath: "/docs", canonicalUrl: "https://configured.test" }, content: { root: layout === "default" ? "." : layout === "absolute" ? root : "content", docsDir: "guide", pagesDir: "pages", blogDir: "blog", apiDir: "api", assetsDir: "static" }, search: { enabled: false, scopes: [] } })}`);
      const dependencies = { buildManifest, loadDocsConfig, FsContentProvider, buildLlmsTxtArtifacts };
      const defaults = await buildLlmsSiteArtifacts(cwd, dependencies);
      expect(defaults.manifest.pages["docs:index.md"].body).toContain("Correct consumer body.");
      expect(defaults.canonicalUrl).toBe("https://configured.test");
      expect(defaults.artifacts.llmsTxt).toContain("https://configured.test/docs");
      const override = await buildLlmsSiteArtifacts(cwd, dependencies, { canonicalUrl: "https://overridden.test" });
      expect(override.canonicalUrl).toBe("https://overridden.test");
      expect(override.artifacts.llmsTxt).toContain("https://overridden.test/docs");
      expect(override.artifacts.llmsFullTxt).toContain("Correct consumer body.");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
