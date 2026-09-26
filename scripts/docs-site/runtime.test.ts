import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDocsSiteRuntime } from "./runtime";
import { buildManifest, type DocsConfig } from "@docsfn/core";

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
