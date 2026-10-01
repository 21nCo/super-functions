import { describe, expect, it, vi } from "vitest";
import { loadDocsPage } from "./page";
import type { DocsSiteSource } from "./runtime";
import { compileSvelteContent, resolveMarkdownRelativeLinks } from "@docsfn/core";

const fixture = vi.hoisted(() => ({
  entry: {} as Record<string, unknown>,
  surface: {} as Record<string, unknown>,
}));
vi.mock("@docsfn/sveltekit", () => ({
  resolveDocsRouteDataOrThrow: () => fixture.entry,
  resolveDocsPageSurface: () => fixture.surface,
}));

describe("docs page load data", () => {
  it.each(["docs", "pages"])("passes %s source paths without duplicating provider body", async (collection) => {
    fixture.entry = { kind: "page", route: "/docs/guide", page: {
      id: `${collection}:guide/index.md`, body: "raw provider body",
    } };
    fixture.surface = { sidebarId: "missing" };
    const sidebar = { id: "docs", items: [] };
    const source = { manifest: { sidebars: { docs: sidebar }, routes: { "/docs/guide/child": "child" } },
      searchArtifact: { documents: [], scopes: [] }, siteTitle: "Contract" } as unknown as DocsSiteSource;
    const resolveLinks = vi.fn(({ compiled }) => compiled);
    const result = await loadDocsPage({ slug: "guide", source,
      getCompiledDocsPage: vi.fn().mockResolvedValue({ html: "compiled" }),
      resolveMarkdownRelativeLinks: resolveLinks, options: { fallbackSidebarId: "docs" } });
    expect(resolveLinks.mock.calls[0][0]).toMatchObject({ sourcePath: "guide/index.md", isIndexRoute: true });
    expect(result.routeEntry).toEqual({ kind: "page" });
    expect(JSON.stringify(result)).not.toContain("raw provider body");
    expect(result.sidebar).toBe(sidebar);
  });

  it.each(["docs", "pages"])("renders links from %s index pages using the published source path", async (collection) => {
    fixture.entry = { kind: "page", route: "/docs/custom", page: {
      id: `${collection}:index.md`, body: "raw provider body",
    } };
    fixture.surface = {};
    const source = { manifest: { sidebars: {}, routes: {} }, searchArtifact: {},
      siteTitle: "Contract" } as unknown as DocsSiteSource;
    const compiled = compileSvelteContent({ source: "[Next](./next.md)", sourcePath: "index.md" });
    const result = await loadDocsPage({ slug: "custom", source,
      getCompiledDocsPage: vi.fn().mockResolvedValue(compiled), resolveMarkdownRelativeLinks });
    expect(result.compiled?.blocks).toContainEqual(expect.objectContaining({
      html: '<a href="/docs/custom/next.md">Next</a>',
    }));
  });

  it.each([
    ["unset", undefined, "/docs/api/http"],
    ["empty", "", "/docs/api/http"],
    ["origin", "https://docs.example", "https://docs.example/docs/api/http"],
    ["suffix", "https://docs.example/", "https://docs.example/docs/api/http"],
    ["long suffix", "https://docs.example" + "/".repeat(10000), "https://docs.example/docs/api/http"],
  ])("preserves API data and canonical URL with %s base", async (_label, canonicalUrl, expected) => {
    const api = { title: "HTTP API", frontmatter: {} };
    fixture.entry = { kind: "api", route: "/docs/api/http", api };
    const source = { canonicalUrl,
      manifest: { sidebars: {}, navigation: { topNav: [] }, versions: [] },
      searchArtifact: { documents: [], scopes: [] } } as unknown as DocsSiteSource;
    const result = await loadDocsPage({ slug: "api/http", source,
      getCompiledDocsPage: vi.fn(), resolveMarkdownRelativeLinks: vi.fn() });
    expect(result.routeEntry).toEqual(fixture.entry);
    expect(result.surface.canonicalUrl).toBe(expected);
    expect(result.surface.breadcrumbs[1].href).toBe("/docs/api");
  });
});
