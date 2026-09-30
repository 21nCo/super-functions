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

// Exercise the shared loader's serialization/consumer contract independently of
// the route resolver. Published core uses sourcePath, not provider relativePath.
describe("docs page load data", () => {
  it.each(["docs", "pages"])("passes %s source paths and omits raw source from page payloads", async (collection) => {
    fixture.entry = { kind: "page", route: "/docs/guide", page: {
      id: `${collection}:guide/index.md`, sourcePath: "guide/index.md", body: "private raw source",
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
    expect(JSON.stringify(result)).not.toContain("private raw source");
    expect(result.sidebar).toBe(sidebar);
  });

  it.each(["docs", "pages"])("renders relative links from %s index pages using the published source path", async (collection) => {
    fixture.entry = { kind: "page", route: "/docs/custom", page: {
      id: `${collection}:index.md`, sourcePath: "index.md", body: "raw provider body",
    } };
    fixture.surface = {};
    const source = { manifest: { sidebars: {}, routes: {} }, searchArtifact: {},
      siteTitle: "Contract" } as unknown as DocsSiteSource;
    const compiled = compileSvelteContent({ source: "[Next](./next.md)", sourcePath: "index.md" });
    const result = await loadDocsPage({ slug: "custom", source,
      getCompiledDocsPage: vi.fn().mockResolvedValue(compiled), resolveMarkdownRelativeLinks });
    expect(JSON.stringify(result.compiled?.blocks)).toContain('href=\\"/docs/custom/next.md\\"');
    expect(JSON.stringify(result)).not.toContain("raw provider body");
  });

  it("preserves API records and normalizes canonical paths without backtracking", async () => {
    const api = { title: "HTTP API", frontmatter: {} };
    fixture.entry = { kind: "api", route: "/docs/api/http", api };
    const source = { canonicalUrl: "https://docs.example" + "/".repeat(10000),
      manifest: { sidebars: {}, navigation: { topNav: [] }, versions: [] },
      searchArtifact: { documents: [], scopes: [] } } as unknown as DocsSiteSource;
    const result = await loadDocsPage({ slug: "api/http", source,
      getCompiledDocsPage: vi.fn(), resolveMarkdownRelativeLinks: vi.fn() });
    expect(result.routeEntry).toEqual(fixture.entry);
    expect(result.surface.canonicalUrl).toBe("https://docs.example/docs/api/http");
    expect(result.surface.breadcrumbs[1].href).toBe("/docs/api");
  });
});
