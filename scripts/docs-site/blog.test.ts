import { expect, it } from "vitest";
import { type DocsConfig, resolveMarkdownRelativeLinks } from "@docsfn/core";
import { createDocsSiteRuntime } from "./runtime";
import { createBlogFeed, assertDocsBlogMount, loadBlogIndex, loadBlogPost } from "./blog";

const config: DocsConfig = {
  schemaVersion: 1,
  site: { title: "Public Blog", basePath: "/docs" },
  content: { root: ".", docsDir: "guide", blogDir: "blog" },
  search: { enabled: true, scopes: ["docs", "blog"], bodyIndexing: "summary" },
};
const raw = {
  "../../../guide/index.md": "# Documentation",
  "../../../blog/flat.md": "---\ntitle: Needle Flat\ndate: '2026-01-02'\n---\nPublic flat body",
  "../../../blog/nested/index.md": "---\ntitle: Needle Nested\ndate: '2026-01-01'\n---\n[Child](./child.md)",
  "../../../blog/nested/child.md": "---\ntitle: Needle Child\ndate: '2025-01-01'\n---\nPublic child body",
  "../../../blog/draft.md": "---\ntitle: PRIVATE Draft\ndate: '2026-01-03'\ndraft: true\n---\nUnpublished draft",
};

it("retains published Blog paths in both actual SDK metadata and exported snapshot", async () => {
  const runtime = createDocsSiteRuntime(config, raw, {}, "../../../", { mountBlogAtDocs: true });
  const source = await runtime.loadDocsSiteSource();
  expect(source.manifest.posts["blog:flat.md"].path).toBe("/docs/blog/flat");
  const docs = source.searchArtifact.documents.filter((document) => document.kind === "post");
  expect(docs.map(({ path }) => path).sort()).toEqual(["/docs/blog/flat", "/docs/blog/nested", "/docs/blog/nested/child"]);
  expect(JSON.stringify(source.searchArtifact.snapshot)).not.toContain('"path":"/blog/');
  expect(JSON.stringify(source.searchArtifact)).not.toContain("PRIVATE Draft");
  const search = await runtime.createDocsSiteSearchRuntime();
  const results = await search.query({ query: "Needle", scope: "blog" });
  expect(results.map(({ path }) => path).sort()).toEqual(docs.map(({ path }) => path).sort());
});

it("projects thin ordered index/post data and actual index-relative links under the public mount", async () => {
  const runtime = createDocsSiteRuntime(config, raw, {});
  const source = await runtime.loadDocsSiteSource();
  const index = loadBlogIndex(source);
  expect(index.posts.map(({ path }) => path)).toEqual(["/docs/blog/flat", "/docs/blog/nested", "/docs/blog/nested/child"]);
  expect(index.posts.every((post) => !("body" in post) && !("frontmatter" in post))).toBe(true);
  const data = await loadBlogPost({ slug: "nested", source, getCompiledDocsPost: runtime.getCompiledDocsPost, resolveMarkdownRelativeLinks });
  expect(data.post.id).toBe("blog:nested/index.md");
  expect(JSON.stringify(data.compiled.blocks)).toContain("/docs/blog/nested/child.md");
  expect(data.post).not.toHaveProperty("frontmatter");
  expect(data.post).not.toHaveProperty("body");
  await expect(loadBlogPost({ slug: "missing", source, getCompiledDocsPost: runtime.getCompiledDocsPost, resolveMarkdownRelativeLinks })).rejects.toMatchObject({ status: 404 });
  await expect(loadBlogPost({ slug: "draft", source, getCompiledDocsPost: runtime.getCompiledDocsPost, resolveMarkdownRelativeLinks })).rejects.toMatchObject({ status: 404 });
});

it("redirects exact provider source aliases without compilation and keeps draft/unknown aliases private", async () => {
  const runtime = createDocsSiteRuntime(config, {
    ...raw,
    "../../../blog/news:team/index.md": "---\ntitle: Colon source\ndate: '2025-01-01'\n---\nPublic body",
    "../../../blog/unicode/主.md": "---\ntitle: Unicode source\ndate: '2025-01-01'\n---\nPublic body",
  }, {}, "../../../", { mountBlogAtDocs: true });
  const source = await runtime.loadDocsSiteSource();
  const compiled: string[] = [];
  const getCompiledDocsPost = (id: string) => { compiled.push(id); return runtime.getCompiledDocsPost(id); };
  for (const [slug, location] of [
    ["flat.md", "/docs/blog/flat"], ["nested/index.md", "/docs/blog/nested"],
    ["nested/child.md", "/docs/blog/nested/child"], ["news:team/index.md", "/docs/blog/news:team"],
    ["unicode/主.md", "/docs/blog/unicode/%E4%B8%BB"],
  ]) {
    await expect(loadBlogPost({ slug, source, getCompiledDocsPost, resolveMarkdownRelativeLinks }))
      .rejects.toMatchObject({ status: 308, location });
  }
  for (const slug of ["draft.md", "missing.md", "../flat.md"]) {
    await expect(loadBlogPost({ slug, source, getCompiledDocsPost, resolveMarkdownRelativeLinks }))
      .rejects.toMatchObject({ status: 404 });
  }
  expect(compiled).toEqual([]);
});

it("builds real SDK RSS links under the same public mount for incoming dev/live/local origins", async () => {
  const source = await createDocsSiteRuntime(config, raw, {}).loadDocsSiteSource();
  for (const origin of ["https://authfn.com", "https://dev.authfn.com", "http://localhost:6005"]) {
    const response = createBlogFeed(source, new URL(`${origin}/blog/rss.xml?legacy=true`));
    const xml = await response.text();
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(xml).toContain(`${origin}/docs/blog/rss.xml`);
    expect(xml).toContain(`${origin}/docs/blog/nested/child`);
    expect(xml).not.toContain(`${origin}/blog/`);
    expect(xml).not.toContain("PRIVATE Draft");
  }
});

it("fails closed before indexing on native mount/feed collisions", async () => {
  const collision = createDocsSiteRuntime(config, { ...raw, "../../../guide/blog/index.md": "# Conflicting native route" }, {}, "../../../", { mountBlogAtDocs: true });
  await expect(collision.loadDocsSiteSource()).rejects.toThrow("reserved public Blog mount");
  const feedCollision = createDocsSiteRuntime(config, { "../../../blog/rss.xml.md": "---\ntitle: Reserved feed\ndate: '2026-01-01'\n---\nFeed collision" }, {}, "../../../", { mountBlogAtDocs: true });
  await expect(feedCollision.loadDocsSiteSource()).rejects.toThrow("mount/feed");
});

it("leaves opt-out consumers and original published manifest paths unchanged", async () => {
  const source = await createDocsSiteRuntime(config, raw, {}).loadDocsSiteSource();
  expect(source.searchArtifact.documents.some(({ path }) => path === "/docs/blog/flat")).toBe(true);
  const original = JSON.stringify(source.manifest);
  assertDocsBlogMount(source.manifest);
  expect(JSON.stringify(source.manifest)).toBe(original);
});
