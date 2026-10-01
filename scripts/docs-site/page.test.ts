import { describe, expect, it, vi } from "vitest";
import { loadDocsPage } from "./page";
import type { DocsSiteSource } from "./runtime";
import { compileSvelteContent, resolveMarkdownRelativeLinks } from "@docsfn/core";
const fixture = vi.hoisted(() => ({ entry: {} as Record<string, unknown>, surface: {} as Record<string, unknown> }));
vi.mock("@docsfn/sveltekit", () => ({ resolveDocsRouteDataOrThrow: () => fixture.entry, resolveDocsPageSurface: () => fixture.surface }));

describe("docs loader boundaries", () => {
  it.each(["docs", "pages"])("passes %s source identity without duplicating raw provider payload", async collection => {
    fixture.entry = { kind: "page", route: "/docs/guide", page: { id: `${collection}:guide/index.md`, body: "raw provider body" } };
    fixture.surface = { sidebarId: "docs" };
    const sidebar = { id: "docs", items: [] };
    const source = { manifest: { sidebars: { docs: sidebar }, routes: { "/docs/guide/child": "child" } }, searchArtifact: {}, siteTitle: "Fixture" } as unknown as DocsSiteSource;
    const rewrite = vi.fn(({ compiled }) => compiled);
    const result = await loadDocsPage({ slug: "guide", source, getCompiledDocsPage: vi.fn().mockResolvedValue({ html: "compiled" }), resolveMarkdownRelativeLinks: rewrite });
    expect(result.sidebar).toBe(sidebar);expect(result.routeEntry).toEqual({ kind: "page" });
    expect(JSON.stringify(result)).not.toContain("raw provider body");
    expect(rewrite.mock.calls[0][0]).toMatchObject({ sourcePath: "guide/index.md", isIndexRoute: true });
  });
  it.each(["docs", "pages"])("renders %s collection index links using filename identity", async collection => {
    fixture.entry = { kind: "page", route: "/docs/custom", page: { id: `${collection}:index.md`, body: "raw" } }; fixture.surface = {};
    const source = { manifest: { sidebars: {}, routes: {} }, searchArtifact: {} } as unknown as DocsSiteSource;
    const compiled = compileSvelteContent({ source: "[Next](./next.md)", sourcePath: "index.md" });
    const data = await loadDocsPage({ slug: "custom", source, getCompiledDocsPage: vi.fn().mockResolvedValue(compiled), resolveMarkdownRelativeLinks });
    expect(data.compiled?.blocks).toContainEqual(expect.objectContaining({ html: '<a href="/docs/custom/next.md">Next</a>' }));
  });
  it.each([undefined, "", "https://docs.example", "https://docs.example/", "https://docs.example" + "/".repeat(10000)])("retains API ownership without caller fallback overriding API navigation (%s)", async canonicalUrl => {
    fixture.entry = { kind: "api", route: "/docs/api/http", api: { title: "HTTP", frontmatter: {} } };
    const source = { canonicalUrl, manifest: { sidebars: { docs: { id: "docs", items: [] } }, navigation: { topNav: [] }, versions: [] }, searchArtifact: {} } as unknown as DocsSiteSource;
    const data = await loadDocsPage({ slug: "api/http", source, getCompiledDocsPage: vi.fn(), resolveMarkdownRelativeLinks: vi.fn() });
    expect(data.routeEntry).toEqual(fixture.entry);expect(data.sidebar).toBeUndefined();
    expect(data.surface.canonicalUrl).toBe(canonicalUrl ? "https://docs.example/docs/api/http" : "/docs/api/http");
  });
});
