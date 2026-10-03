import { it, expect, vi } from "vitest";
import { type DocsConfig } from "@docsfn/core";
import { createDocsSiteRuntime } from "./runtime";
import { load as authDocsLoad } from "../../authfn/docs/src/routes/docs/[...slug]/+page.server";
import { load as fileDocsLoad } from "../../filefn/docs/src/routes/docs/[...slug]/+page.server";
import { load as authLayoutLoad } from "../../authfn/docs/src/routes/+layout.server";
import { load as fileLayoutLoad } from "../../filefn/docs/src/routes/+layout.server";
import { load as authPostLoad } from "../../authfn/docs/src/routes/blog/[slug]/+page.server";
import { load as filePostLoad } from "../../filefn/docs/src/routes/blog/[slug]/+page.server";
import { load as authBlogLoad } from "../../authfn/docs/src/routes/blog/+page.server";
import { load as fileBlogLoad } from "../../filefn/docs/src/routes/blog/+page.server";

const fixture = vi.hoisted(() => ({ source: undefined as any, compile: undefined as any }));
// Only replace the route's provider adapter. Manifest, compiler, routes,
// surfaces and link resolution are the real published consumer implementations.
vi.mock("$lib/server/docs-site-source", () => ({
  loadDocsSiteSource: async () => fixture.source,
  getCompiledDocsPage: async (id: string) => fixture.compile(id),
  getCompiledDocsPost: async (id: string) => fixture.compile(id),
}));
const config: DocsConfig = {
  schemaVersion: 1, site: { title: "Published fixture", basePath: "/docs" },
  content: { root: ".", docsDir: "guide", pagesDir: "pages", apiDir: "api", blogDir: "blog", assetsDir: "static" },
  navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } }, search: { enabled: false },
};
const callers = [
  { name: "AuthFn", docs: authDocsLoad, layout: authLayoutLoad, post: authPostLoad, blog: authBlogLoad },
  { name: "FileFn", docs: fileDocsLoad, layout: fileLayoutLoad, post: filePostLoad, blog: fileBlogLoad },
];
for (const caller of callers) {
  it(`${caller.name}'s actual layout/docs caller keeps the complete provider server-only and resolves real index links`, async () => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../guide/api/index.md": "---\ntitle: Guide\nproviderOnly: PRIVATE_METADATA\n---\n[Parent](../reference/routes) [Next](./next.md)",
      "../../../guide/reference/routes.md": "# Routes",
    }, {});
    fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPage;
    const page = fixture.source.manifest.pages["docs:api/index.md"];
    expect(page).not.toHaveProperty("relativePath"); expect(page).not.toHaveProperty("sourcePath");
    const layout = await caller.layout({} as any);
    expect(Object.keys(layout.source).sort()).toEqual(["config", "siteTitle"]);
    expect(Object.keys(layout.source.config).sort()).toEqual(["navigation", "site"]);
    const result = await caller.docs({ params: { slug: "api" }, parent: () => { throw new Error("Provider must remain server-only"); } } as any);
    expect(JSON.stringify(result.compiled?.blocks)).toContain("/docs/reference/routes");
    expect(JSON.stringify(result.compiled?.blocks)).toContain("/docs/api/next.md");
    expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
    expect(result.routeEntry).toEqual({ kind: "page" });
    expect(JSON.stringify(result)).not.toContain('"body":');
    expect(JSON.stringify(result)).not.toContain("PRIVATE_METADATA");
  });
  it(`${caller.name}'s actual post derives published index identity and projects public metadata`, async () => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../blog/leaf/index.md": "---\ntitle: News\ndate: '2026-01-01'\nproviderOnly: PRIVATE_POST_METADATA\n---\n[Next](./next.md)",
    }, {});
    fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPost;
    const post = fixture.source.manifest.posts["blog:leaf/index.md"];
    expect(post.slug).toBe("leaf"); expect(post).not.toHaveProperty("relativePath");
    const result = await caller.post({ params: { slug: post.slug }, parent: () => { throw new Error("Provider must remain server-only"); } } as any);
    expect(JSON.stringify(result.compiled.blocks)).toContain("/blog/leaf/next.md");
    expect(result.post).not.toHaveProperty("body"); expect(result.post).not.toHaveProperty("frontmatter");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_POST_METADATA");
  });
  it(`${caller.name}'s actual blog index hides drafts, sorts valid dated posts and projects metadata`, async () => {
    const runtime = createDocsSiteRuntime(config, {
      "../../../blog/dated.md": "---\ntitle: Dated\ndate: '2026-01-01'\n---\nPublished body",
      "../../../blog/older.md": "---\ntitle: Older\ndate: '2025-01-01'\n---\nOlder body",
      "../../../blog/draft.md": "---\ntitle: Draft\ndate: '2026-02-01'\ndraft: true\n---\nDraft body",
    }, {});
    fixture.source = await runtime.loadDocsSiteSource();
    const result = await caller.blog({} as any);
    expect(result.posts.map(post => post.title)).toEqual(["Dated", "Older"]);
    expect(result.posts.every(post => !("body" in post) && !("frontmatter" in post))).toBe(true);
    await expect(caller.post({ params: { slug: "draft" } } as any)).rejects.toMatchObject({ status: 404 });
    await expect(caller.post({ params: { slug: "missing" } } as any)).rejects.toMatchObject({ status: 404 });
  });
}
it("AuthFn's actual API caller retains the docs fallback when there is no API sidebar", async () => {
  const runtime = createDocsSiteRuntime(config, {
    "../../../guide/index.md": "# Docs",
    "../../../api/http.json": JSON.stringify({ openapi: "3.0.0", info: { title: "HTTP", version: "1" }, paths: {} }),
  }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = vi.fn();
  const result = await authDocsLoad({ params: { slug: "api/http" } } as any);
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
  expect(result.surface.breadcrumbs[1].href).toBe("/docs/api");
  expect(result.routeEntry.kind).toBe("api"); expect(fixture.compile).not.toHaveBeenCalled();
});
