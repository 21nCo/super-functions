import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDocsSiteRuntime } from "./runtime";
import { buildManifest, compileSvelteContent, resolveMarkdownRelativeLinks, type DocsConfig } from "@docsfn/core";
import { loadDocsPage } from "./page";

// Keep the real manifest/provider pipeline; inject one transient initialization failure.
vi.mock("@docsfn/core", async (original) => {
  const core = await original<typeof import("@docsfn/core")>();
  return { ...core, buildManifest: vi.fn(core.buildManifest) };
});
const config: DocsConfig = {
  schemaVersion: 1,
  site: { title: "Contract test", basePath: "/docs" },
  content: { root: ".", docsDir: "guide", pagesDir: "pages", blogDir: "blog", apiDir: "api", assetsDir: "static", metaFileName: "META.json" },
  navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } },
  search: { enabled: false },
};
beforeEach(() => { vi.mocked(buildManifest).mockClear(); });

describe("bundled DocsFn provider", () => {
  it.each(["\n", "\r\n", "BOM"])("preserves structured YAML and source paths with %s", async (ending) => {
    let markdown = '---\ntitle: "true"\norder: 2\ntags: [memory, api]\ndescription: |\n  First line: detail\n  Second line\n---\n# Heading\n\nConsumer body.\n';
    if (ending === "BOM") markdown = "\uFEFF" + markdown;
    else markdown = markdown.replaceAll("\n", ending);
    const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": markdown }, {});
    const source = await runtime.loadDocsSiteSource();
    const page = source.manifest.pages["docs:index.md"];
    expect(page.title).toBe("true");
    expect(page.frontmatter.order).toBe(2);
    expect(page.frontmatter.tags).toEqual(["memory", "api"]);
    expect(page.frontmatter.description).toContain("First line: detail\nSecond line");
    expect(page.body).not.toContain("order: 2");
    const provider = vi.mocked(buildManifest).mock.calls[0][0];
    const entries = await provider.listEntries({ config, collections: ["docs"] });
    expect(entries[0].absolutePath).toBe("guide/index.md");
    expect(entries[0].updatedAt).toBeUndefined();
  });

  it("classifies configured collections and control files, preserving UTF-8 byte lengths", async () => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../guide/index.md": "# Guide",
      "../../../guide/META.json": '{"title":"Guide"}',
      "../../../pages/about.mdx": "# About",
      "../../../blog/post.md": "---\ntitle: Post\ndate: '2026-01-01'\n---\nPost",
      "../../../api/openapi.json": '{"openapi":"3.0.0","info":{"title":"Example","version":"1"},"paths":{}}',
      "../../../guide/.gitkeep": "",
      "../../../unrelated/skipped.md": "skip",
    }, { "../../../static/index.txt": "café" });
    await runtime.loadDocsSiteSource();
    const provider = vi.mocked(buildManifest).mock.calls[0][0];
    const entries = await provider.listEntries({ config, collections: ["docs", "pages", "blog", "api", "assets"] });
    expect(entries.map(({ id }) => id).sort()).toEqual(["api:openapi.json", "assets:index.txt", "blog:post.md", "docs:META.json", "docs:index.md", "pages:about.mdx"].sort());
    expect(entries.find(({ relativePath }) => relativePath === "META.json")?.entryType).toBe("control");
    expect(entries.find(({ collection }) => collection === "assets")?.bytes).toBe(5);
  });

  it("shares successful initialization, caches compiled pages, and rejects unknown IDs", async () => {
    const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# Guide" }, {});
    const [left, right] = await Promise.all([runtime.loadDocsSiteSource(), runtime.loadDocsSiteSource()]);
    expect(left).toBe(right);
    expect(buildManifest).toHaveBeenCalledTimes(1);
    expect(await runtime.getCompiledDocsPage("docs:index.md")).toBe(await runtime.getCompiledDocsPage("docs:index.md"));
    await expect(runtime.getCompiledDocsPage("docs:missing.md")).rejects.toMatchObject({ code: "DOCS_ARTIFACT_INVALID" });
    const other = createDocsSiteRuntime(config, { "../../../guide/index.md": "# Other" }, {});
    expect(await other.loadDocsSiteSource()).not.toBe(left);
  });

  it("covers posts, cache summaries, missing entries and enabled search queries", async () => {
    const runtime = createDocsSiteRuntime({ ...config, search: { enabled: true, scopes: ["docs", "blog"], defaultScope: "all", bodyIndexing: "summary" } }, {
      "../../../guide/index.md": "# Parrot guide\n\nParrot searchable overview.",
      "../../../blog/launch.md": "---\ntitle: Parrot launch\ndate: '2026-09-26'\n---\n# Parrot announcement",
    }, {});
    const source = await runtime.loadDocsSiteSource();
    expect(source.manifest.sidebars.docs.items.length).toBeGreaterThan(0);
    const post = await runtime.getCompiledDocsPost("blog:launch.md");
    expect(await runtime.getCompiledDocsPost("blog:launch.md")).toBe(post);expect(post.blocks.length).toBeGreaterThan(0);
    await expect(runtime.getCompiledDocsPost("blog:missing.md")).rejects.toThrow("cache key is missing");
    const summary = await runtime.getDocsSiteCompiledCacheSummary();
    expect(summary.pageKeys).toHaveLength(1);expect(summary.postKeys).toHaveLength(1);expect(summary.framework).toBe("svelte");
    expect(await runtime.getDocsSiteCompiledCacheSummary()).toEqual(summary);
    const search = await runtime.createDocsSiteSearchRuntime();
    const result = await search.query({ query: "parrot", scope: "all", limit: 10 });
    expect(result).toHaveLength(2);expect(new Set(result.map(hit => hit.kind))).toEqual(new Set(["page", "post"]));
  });

  it("uses real provider index filenames and preserves ordinary generated navigation", async () => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../guide/about/index.md": "# About\n\n[Next](child.md)",
      "../../../guide/about/child.md": "# Child",
      "../../../guide/about/guide.md": "# Guide\n\n[Next](child.md)",
    }, {});
    const source = await runtime.loadDocsSiteSource();
    const result = await loadDocsPage({ slug: "about", source, getCompiledDocsPage: runtime.getCompiledDocsPage, resolveMarkdownRelativeLinks });
    // Manifest/cache pre-resolve links. Also compile actual raw provider entries,
    // exercising the loader's relative-block contract without fictional fields.
    const provider = vi.mocked(buildManifest).mock.calls[0][0];
    const entries = await provider.listEntries({ config, collections: ["docs"] });
    const compileBody = async (id: string) => {
      const entry = entries.find(entry => entry.id === id);
      if (!entry) throw new Error("Missing actual provider entry");
      return compileSvelteContent({ source: entry.body });
    };
    const uncachedIndex = await loadDocsPage({ slug: "about", source, getCompiledDocsPage: compileBody, resolveMarkdownRelativeLinks });
    expect(JSON.stringify(uncachedIndex.compiled)).toContain('/docs/about/child.md');
    const leaf = await loadDocsPage({ slug: "about/guide", source, getCompiledDocsPage: compileBody, resolveMarkdownRelativeLinks });
    expect(JSON.stringify(leaf.compiled)).toContain('/docs/about/child.md');
    expect(JSON.stringify(leaf.compiled)).not.toContain('/docs/about/guide/child.md');
    expect(JSON.stringify(result.compiled)).toContain('/docs/about/child.md');
    expect(JSON.stringify(result.routeEntry)).not.toContain("body");expect(result.sidebar?.items.length).toBeGreaterThan(0);
  });

  it.each(["json", "yaml"])("retains real %s API records and caller-specific docs fallback", async extension => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../guide/index.md": "# Guide",
      [`../../../api/http.${extension}`]: extension === "json"
        ? JSON.stringify({ openapi: "3.0.0", info: { title: "HTTP", version: "1" }, paths: { "/thing": { get: { responses: { "200": { description: "OK" } } } } } })
        : "openapi: 3.0.0\ninfo:\n  title: HTTP\n  version: '1'\npaths:\n  /thing:\n    get:\n      responses:\n        '200':\n          description: OK\n",
    }, {});
    const source = await runtime.loadDocsSiteSource();
    const path = Object.values(source.manifest.apis)[0].path;
    const input = { slug: path.replace(/^\/docs\/?/, ""), source, getCompiledDocsPage: runtime.getCompiledDocsPage, resolveMarkdownRelativeLinks };
    expect((await loadDocsPage(input)).sidebar).toBeUndefined();
    const data = await loadDocsPage({ ...input, options: { fallbackSidebarId: "docs", apiBreadcrumbLabel: "Package reference", apiBreadcrumbHref: "/docs/reference" } });
    expect(data.sidebar).toBe(source.manifest.sidebars.docs);expect(data.routeEntry.kind).toBe("api");expect(data.compiled).toBeUndefined();
    expect(data.surface.breadcrumbs).toContainEqual({ label: "Package reference", href: "/docs/reference" });
  });

  it("retries after a rejected initialization", async () => {
    vi.mocked(buildManifest).mockRejectedValueOnce(new Error("transient"));
    const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# Guide" }, {});
    const attempts = await Promise.allSettled([runtime.loadDocsSiteSource(), runtime.loadDocsSiteSource()]);
    expect(attempts.map(({ status }) => status)).toEqual(["rejected", "rejected"]);
    expect(buildManifest).toHaveBeenCalledTimes(1);
    await expect(runtime.loadDocsSiteSource()).resolves.toHaveProperty("siteTitle", "Contract test");
    expect(buildManifest).toHaveBeenCalledTimes(2);
  });
});
