import { it, expect, vi } from "vitest";
import { type DocsConfig } from "@docsfn/core";
import { createDocsSiteRuntime } from "./runtime";
import { load } from "../../authfn/docs/src/routes/docs/[...slug]/+page.server";
import { load as fileDocsLoad } from "../../filefn/docs/src/routes/docs/[...slug]/+page.server";
import { load as fileLayoutLoad } from "../../filefn/docs/src/routes/+layout.server";
import { load as filePostLoad } from "../../filefn/docs/src/routes/blog/[slug]/+page.server";
import { load as fileBlogLoad } from "../../filefn/docs/src/routes/blog/+page.server";

const fixture = vi.hoisted(() => ({ source: undefined as any, compile: undefined as any }));
// Replace only the route's provider adapter; manifest/route/surface/link helpers
// and the actual AuthFn caller remain real published implementations.
vi.mock("$lib/server/docs-site-source", () => ({
  loadDocsSiteSource: async () => fixture.source,
  getCompiledDocsPage: async (id: string) => fixture.compile(id),
  getCompiledDocsPost: async (id: string) => fixture.compile(id),
}));
const config: DocsConfig = {
  schemaVersion: 1, site: { title: "Auth fixture", basePath: "/docs" },
  content: { root: ".", docsDir: "guide", pagesDir: "pages", apiDir: "api", blogDir: "blog", assetsDir: "static" },
  navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } }, search: { enabled: false },
};

it("AuthFn's actual caller retains published index links and ordinary sidebar without duplicate provider data", async () => {
  const runtime = createDocsSiteRuntime(config, {
    "../../../guide/api/index.md": "---\ntitle: Auth guide\nproviderOnly: PRIVATE_METADATA\n---\n[Parent](../reference/routes) [Next](./next.md)",
    "../../../guide/reference/routes.md": "# Routes",
  }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPage;
  const page = fixture.source.manifest.pages["docs:api/index.md"];
  expect(page).not.toHaveProperty("sourcePath"); expect(page).not.toHaveProperty("relativePath");
  const result = await load({ params: { slug: "api" } } as Parameters<typeof load>[0]);
  expect(JSON.stringify(result.compiled?.blocks)).toContain('/docs/reference/routes');
  expect(JSON.stringify(result.compiled?.blocks)).toContain('/docs/api/next.md');
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
  expect(result.routeEntry).toEqual({ kind: "page" });
  expect(JSON.stringify(result)).not.toContain('"body":');
  expect(JSON.stringify(result)).not.toContain("PRIVATE_METADATA");
});

it("AuthFn's actual caller opts into docs fallback for an API without an API sidebar", async () => {
  const runtime = createDocsSiteRuntime(config, {
    "../../../guide/index.md": "# Docs",
    "../../../api/http.json": JSON.stringify({ openapi: "3.0.0", info: { title: "HTTP", version: "1" }, paths: {} }),
  }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = vi.fn();
  const result = await load({ params: { slug: "api/http" } } as Parameters<typeof load>[0]);
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
  expect(result.surface.breadcrumbs[1].href).toBe("/docs/api");
  expect(result.routeEntry.kind).toBe("api");
  expect(fixture.compile).not.toHaveBeenCalled();
});

it("FileFn's actual layout and docs caller keep provider/search data server-only", async () => {
  const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# File docs" }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPage;
  const layout = await fileLayoutLoad({} as Parameters<typeof fileLayoutLoad>[0]);
  expect(Object.keys(layout.source).sort()).toEqual(["config", "siteTitle"]);
  expect(layout.source.config).toEqual({ site: config.site, navigation: config.navigation });
  const result = await fileDocsLoad({ params: {}, parent: () => { throw new Error("Must not request a serialized provider parent"); } } as unknown as Parameters<typeof fileDocsLoad>[0]);
  expect(result.routeEntry).toEqual({ kind: "page" });
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
});

it("FileFn's actual post caller derives index identity and returns compiled content without raw provider fields", async () => {
  const runtime = createDocsSiteRuntime(config, { "../../../blog/leaf/index.md": "---\ntitle: News\ndate: '2026-01-01'\n---\n[Next](./next.md)" }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPost;
  const post = fixture.source.manifest.posts["blog:leaf/index.md"];
  expect(post.slug).toBe("leaf");
  expect(post).not.toHaveProperty("relativePath");
  const result = await filePostLoad({ params: { slug: post.slug }, parent: () => { throw new Error("Must remain server-only"); } } as unknown as Parameters<typeof filePostLoad>[0]);
  expect(JSON.stringify(result.compiled.blocks)).toContain("/blog/leaf/next.md");
  expect(result.post).not.toHaveProperty("body");
  expect(result.post).not.toHaveProperty("frontmatter");
});

it("FileFn's actual blog index hides drafts and projects public metadata from a valid provider", async () => {
  const runtime = createDocsSiteRuntime(config, {
    "../../../blog/dated.md": "---\ntitle: Dated\ndate: '2026-01-01'\n---\nPublished body",
    "../../../blog/older.md": "---\ntitle: Older\ndate: '2025-01-01'\n---\nOlder body",
    "../../../blog/draft.md": "---\ntitle: Draft\ndate: '2026-02-01'\ndraft: true\n---\nDraft body",
  }, {});
  fixture.source = await runtime.loadDocsSiteSource();
  const result = await fileBlogLoad({} as Parameters<typeof fileBlogLoad>[0]);
  expect(result.posts.map(post => post.title)).toEqual(["Dated", "Older"]);
  expect(result.posts.every(post => !("body" in post) && !("frontmatter" in post))).toBe(true);
});
