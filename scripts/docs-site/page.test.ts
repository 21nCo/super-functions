import { describe, expect, it, vi } from "vitest";
import { compileSvelteContent, resolveMarkdownRelativeLinks, type DocsConfig } from "@docsfn/core";
import { isHttpError } from "@sveltejs/kit";
import { loadDocsPage } from "./page";
import { createDocsSiteRuntime } from "./runtime";

const config: DocsConfig = {
  schemaVersion: 1,
  site: { title: "Provider contract", basePath: "/docs", canonicalUrl: "https://docs.example/" },
  content: { root: ".", docsDir: "guide", pagesDir: "pages", blogDir: "blog", apiDir: "api", assetsDir: "static" },
  navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } },
  search: { enabled: false, scopes: ["docs"] },
};

// Use actual manifest pages and published route/surface/compiler helpers, not
// fabricated provider fields or a mock of the route resolver.
describe("published page/provider boundary", () => {
  const cases = [
    { file: "guide/index.md", slug: undefined, id: "docs:index.md", parent: "/reference/routes", child: "/docs/next.md?q=1#part" },
    { file: "guide/api/index.md", slug: "api", id: "docs:api/index.md", parent: "/docs/reference/routes", child: "/docs/api/next.md?q=1#part" },
    { file: "guide/api/index.mdx", slug: "api", id: "docs:api/index.mdx", parent: "/docs/reference/routes", child: "/docs/api/next.md?q=1#part" },
    { file: "guide/api.md", slug: "api", id: "docs:api.md", parent: "/reference/routes", child: "/docs/next.md?q=1#part" },
    { file: "guide/sub:dir/index.md", slug: "sub:dir", id: "docs:sub:dir/index.md", parent: "/docs/reference/routes", child: "/docs/sub:dir/next.md?q=1#part" },
    { file: "pages/docs/api/index.md", slug: "api", id: "pages:docs/api/index.md", parent: "/docs/reference/routes", child: "/docs/api/next.md?q=1#part" },
  ];
  for (const { file, slug, id, parent, child } of cases) {
    it.each([false, true])(`${id} uses source identity with nested routes=%s`, async (nested) => {
      const body = '[Parent](../reference/routes) [Child](./next.md?q=1#part) [External](https://example.com/path)';
      const runtime = createDocsSiteRuntime(config, {
        [`../../../${file}`]: `---\ntitle: Guide\nproviderOnly: PRIVATE_METADATA\n---\n${body}`,
        ...(nested ? { "../../../guide/api/child.md": "# Child" } : {}),
      }, {});
      const source = await runtime.loadDocsSiteSource();
      const page = source.manifest.pages[id];
      // Published auto-sidebars cover docs, not standalone pages. Disable that
      // unrelated navigation surface for the pages-collection identity case.
      if (id.startsWith("pages:")) source.manifest.sidebars = {};
      expect(page).toBeDefined();
      expect(page).not.toHaveProperty("sourcePath");
      expect(page).not.toHaveProperty("relativePath");
      // Both the actual default cache and a freshly compiled published artifact.
      for (const getCompiledDocsPage of [runtime.getCompiledDocsPage,
        async () => compileSvelteContent({ source: page.body, sourcePath: page.id })]) {
        const result = await loadDocsPage({ slug, source, getCompiledDocsPage, resolveMarkdownRelativeLinks });
        const blocks = JSON.stringify(result.compiled?.blocks);
        expect(blocks).toContain(`href=\\"${parent}\\"`);
        expect(blocks).toContain(`href=\\"${child}\\"`);
        expect(blocks).toContain('href=\\"https://example.com/path\\"');
        expect(result.routeEntry).toEqual({ kind: "page" });
        expect(result.routeEntry).not.toHaveProperty("page");
        for (const field of ["searchDocumentCount", "searchScopes", "compatPreset"]) {
          expect(result).not.toHaveProperty(field);
        }
        expect(JSON.stringify(result)).not.toContain('"body":');
        expect(JSON.stringify(result)).not.toContain("PRIVATE_METADATA");
        expect(result.surface.title).toBe("Guide");
      }
    });
  }

  it.each([
    ["unset", undefined, "/docs/api/http"],
    ["empty", "", "/docs/api/http"],
    ["origin", "https://docs.example", "https://docs.example/docs/api/http"],
    ["suffix", "https://docs.example/", "https://docs.example/docs/api/http"],
    ["long suffix", "https://docs.example" + "/".repeat(10000), "https://docs.example/docs/api/http"],
  ])("retains actual API records, sidebar and canonical normalization with %s base", async (_label, canonicalUrl, expected) => {
    const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# Docs",
      "../../../api/http.json": JSON.stringify({ openapi: "3.0.0", info: { title: "HTTP API", version: "1" }, paths: {} }) }, {});
    const source = await runtime.loadDocsSiteSource();
    source.canonicalUrl = canonicalUrl;
    const compiler = vi.fn();
    const result = await loadDocsPage({ slug: "api/http", source, getCompiledDocsPage: compiler,
      resolveMarkdownRelativeLinks, options: { fallbackSidebarId: "docs" } });
    expect(result.routeEntry.kind).toBe("api");
    if (result.routeEntry.kind === "api") expect(result.routeEntry.api).toBe(source.manifest.apis["api:http.json"]);
    expect(result.compiled).toBeUndefined();
    expect(compiler).not.toHaveBeenCalled();
    expect(result.sidebar).toBe(source.manifest.sidebars.docs);
    expect(result.surface.canonicalUrl).toBe(expected);
    expect(result.surface.breadcrumbs?.[1].href).toBe("/docs/api");
  });

  it("uses a consumer-recognizable 404 without invoking the compiler", async () => {
    const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# Docs" }, {});
    const source = await runtime.loadDocsSiteSource();
    const compiler = vi.fn();
    let caught: unknown;
    try { await loadDocsPage({ slug: "missing", source, getCompiledDocsPage: compiler, resolveMarkdownRelativeLinks }); }
    catch (error) { caught = error; }
    expect(isHttpError(caught, 404)).toBe(true);
    expect(compiler).not.toHaveBeenCalled();
  });
});
