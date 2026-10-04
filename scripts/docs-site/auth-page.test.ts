import { it, expect, vi } from "vitest";
import { type DocsConfig, type CompiledContentArtifact } from "@docsfn/core";
import { createDocsSiteRuntime, type DocsSiteSource } from "./runtime";
import { load } from "../../authfn/docs/src/routes/docs/[...slug]/+page.server";
import { load as fileDocsLoad } from "../../filefn/docs/src/routes/docs/[...slug]/+page.server";
import { load as fileLayoutLoad } from "../../filefn/docs/src/routes/+layout.server";
import { load as filePostLoad } from "../../filefn/docs/src/routes/blog/[slug]/+page.server";
import { load as fileBlogLoad } from "../../filefn/docs/src/routes/blog/+page.server";
import { load as authMountedPost } from "../../authfn/docs/src/routes/docs/blog/[...slug]/+page.server";
import { load as fileMountedPost } from "../../filefn/docs/src/routes/docs/blog/[...slug]/+page.server";

interface RouteFixture {
  source?: DocsSiteSource;
  compile?: (id: string) => Promise<CompiledContentArtifact>;
}
const fixture = vi.hoisted<RouteFixture>(() => ({}));
vi.mock("$lib/server/docs-site-source", () => ({
  loadDocsSiteSource: async () => {
    if (!fixture.source) throw new Error("Provider fixture must be initialized");
    return fixture.source;
  },
  getCompiledDocsPage: async (id: string) => {
    if (!fixture.compile) throw new Error("Compiler fixture must be initialized");
    return fixture.compile(id);
  },
  getCompiledDocsPost: async (id: string) => {
    if (!fixture.compile) throw new Error("Compiler fixture must be initialized");
    return fixture.compile(id);
  },
}));
function loaded<T>(value: T): Exclude<T, void | null> {
  expect(value).toBeDefined();
  if (value === undefined || value === null) throw new Error("Actual loader must return data");
  return value as Exclude<T, void | null>;
}
const config: DocsConfig = {
  schemaVersion: 1, site: { title: "Auth fixture", basePath: "/docs" },
  content: { root: ".", docsDir: "guide", pagesDir: "pages", apiDir: "api", blogDir: "blog", assetsDir: "static" },
  navigation: { sidebars: { docs: { root: true, include: ["docs/**"] } } },
  search: { enabled: false, scopes: ["docs", "api", "blog"] },
};

// These are explicit minimal caller fixtures, not fabricated complete HTTP events.
it("AuthFn's actual caller retains published index links and ordinary sidebar without duplicate provider data", async () => {
  const runtime = createDocsSiteRuntime(config, {
    "../../../guide/api/index.md": "---\ntitle: Auth guide\nproviderOnly: PRIVATE_METADATA\n---\n[Parent](../reference/routes) [Next](./next.md)",
    "../../../guide/reference/routes.md": "# Routes",
  }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPage;
  const page = fixture.source.manifest.pages["docs:api/index.md"];
  expect(page).not.toHaveProperty("sourcePath"); expect(page).not.toHaveProperty("relativePath");
  const event = { params: { slug: "api" } } satisfies Pick<Parameters<typeof load>[0], "params">;
  const result = loaded(await load(event as Parameters<typeof load>[0]));
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
  fixture.source = await runtime.loadDocsSiteSource();
  fixture.compile = vi.fn(async () => { throw new Error("API must not compile Markdown"); });
  const event = { params: { slug: "api/http" } } satisfies Pick<Parameters<typeof load>[0], "params">;
  const result = loaded(await load(event as Parameters<typeof load>[0]));
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
  expect(result.surface.breadcrumbs[1].href).toBe("/docs/api");
  expect(result.routeEntry.kind).toBe("api");
  expect(fixture.compile).not.toHaveBeenCalled();
});

it("FileFn's actual layout and docs caller keep provider/search data server-only", async () => {
  const runtime = createDocsSiteRuntime(config, { "../../../guide/index.md": "# File docs" }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPage;
  const layout = loaded(await fileLayoutLoad());
  expect(Object.keys(layout.source).sort()).toEqual(["config", "siteTitle"]);
  expect(layout.source.config).toEqual({ site: config.site, navigation: config.navigation });
  const event = { params: { slug: "" }, parent: () => { throw new Error("Must not request a serialized provider parent"); } } satisfies Pick<Parameters<typeof fileDocsLoad>[0], "params" | "parent">;
  const result = loaded(await fileDocsLoad(event as unknown as Parameters<typeof fileDocsLoad>[0]));
  expect(result.routeEntry).toEqual({ kind: "page" });
  expect(result.sidebar).toBe(fixture.source.manifest.sidebars.docs);
});

it("FileFn's actual post caller derives index identity and returns compiled content without raw provider fields", async () => {
  const runtime = createDocsSiteRuntime(config, { "../../../blog/leaf/index.md": "---\ntitle: News\ndate: '2026-01-01'\n---\n[Next](./next.md)" }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPost;
  const post = fixture.source.manifest.posts["blog:leaf/index.md"];
  expect(post.slug).toBe("leaf");
  expect(post).not.toHaveProperty("relativePath");
  const event = { params: { slug: post.slug }, parent: () => { throw new Error("Must remain server-only"); } } satisfies Pick<Parameters<typeof filePostLoad>[0], "params" | "parent">;
  const result = loaded(await filePostLoad(event as unknown as Parameters<typeof filePostLoad>[0]));
  expect(JSON.stringify(result.compiled.blocks)).toContain("/docs/blog/leaf/next.md");
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
  const result = loaded(await fileBlogLoad());
  expect(result.posts.map(post => post.title)).toEqual(["Dated", "Older"]);
  expect(result.posts.every(post => !("body" in post) && !("frontmatter" in post))).toBe(true);
  expect(result.posts.map(post => post.path)).toEqual(["/docs/blog/dated", "/docs/blog/older"]);
});

it("both actual mounted post callers retain nested provider identity and a thin public payload", async () => {
  const runtime = createDocsSiteRuntime(config, { "../../../blog/leaf/nested.md": "---\ntitle: Nested\ndate: '2026-01-01'\n---\n[Next](./next.md)" }, {});
  fixture.source = await runtime.loadDocsSiteSource(); fixture.compile = runtime.getCompiledDocsPost;
  for (const caller of [authMountedPost, fileMountedPost]) {
    const event = { params: { slug: "leaf/nested" } } satisfies Pick<Parameters<typeof caller>[0], "params">;
    const result = loaded(await caller(event as Parameters<typeof caller>[0]));
    expect(result.post.path).toBe("/docs/blog/leaf/nested");
    expect(JSON.stringify(result.compiled.blocks)).toContain("/docs/blog/leaf/next.md");
    expect(result.post).not.toHaveProperty("body");
    expect(result.post).not.toHaveProperty("frontmatter");
  }
});
