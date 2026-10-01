import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, loadDocsConfig, buildLlmsTxtArtifacts } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { buildLlmsSiteArtifacts, withSourceLinks } from "./llms.mjs";

describe("filesystem LLM consumer contract", () => {
  it.each(["default", "relative", "absolute"])("reads %s root consistently across provider and manifest", async layout => {
    const cwd = mkdtempSync(join(tmpdir(), "docs-root-"));
    try {
      const root = layout === "default" ? cwd : join(cwd, "content");
      for (const dir of ["guide", "pages", "blog", "api", "static"]) mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, "guide/index.md"), "# Fixture\n\nCorrect consumer body.");
      writeFileSync(join(cwd, "docsfn.config.ts"), `export default ${JSON.stringify({ schemaVersion: 1, site: { title: "Fixture", basePath: "/docs", canonicalUrl: "https://configured.test" }, content: { root: layout === "default" ? "." : layout === "absolute" ? root : "content", docsDir: "guide", pagesDir: "pages", blogDir: "blog", apiDir: "api", assetsDir: "static" }, search: { enabled: false, scopes: [] } })}`);
      const deps = { buildManifest, loadDocsConfig, FsContentProvider, buildLlmsTxtArtifacts };
      const defaults = await buildLlmsSiteArtifacts(cwd, deps);
      expect(defaults.manifest.pages["docs:index.md"].body).toContain("Correct consumer body.");
      expect(defaults.artifacts.llmsTxt).toContain("https://configured.test/docs");
      const override = await buildLlmsSiteArtifacts(cwd, deps, { canonicalUrl: "https://override.test" });
      expect(override.canonicalUrl).toBe("https://override.test");expect(override.artifacts.llmsTxt).toContain("https://override.test/docs");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  it("preserves default dev links but supports encoded refs, filenames, queries and hashes", () => {
    const manifest = { pages: { x: { id: "docs:Folder/Child page.md", path: "/docs/child" } } };
    const text = "[Child](/docs/child?mode=raw#section)";
    expect(withSourceLinks(text, manifest, "mailfn", undefined)).toContain("blob/dev/mailfn/docs/content/docs/Folder/Child%20page.md?mode=raw#section");
    expect(withSourceLinks(text, manifest, "mailfn", undefined, "release/v1")).toContain("blob/release%2Fv1/mailfn/");
    expect(withSourceLinks(text, manifest, "mailfn", "https://public.test", "release/v1")).toBe(text);
  });
});
