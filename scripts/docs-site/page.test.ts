import { describe, expect, it, vi } from "vitest";
import { loadDocsPage } from "./page";
import type { DocsSiteSource } from "./runtime";
import { compileSvelteContent, resolveMarkdownRelativeLinks } from "@docsfn/core";
const fixture = vi.hoisted(() => ({ entry: {} as Record<string, unknown>, surface: {} as Record<string, unknown> }));
vi.mock("@docsfn/sveltekit", () => ({ resolveDocsRouteDataOrThrow: () => fixture.entry, resolveDocsPageSurface: () => fixture.surface }));
describe("docs loader contracts", () => {
 it.each(["docs", "pages"])("retains %s filename identity and lean page envelope", async collection => {
  fixture.entry = { kind: "page", route: "/docs/custom", page: { id: `${collection}:index.md`, body: "raw provider record" } };fixture.surface = {};
  const source = { manifest: { routes: {}, sidebars: {} }, searchArtifact: {} } as unknown as DocsSiteSource;
  const compiled = compileSvelteContent({ source: "[Next](next.md)", sourcePath: "index.md" });
  const data = await loadDocsPage({ slug: "custom", source, getCompiledDocsPage: vi.fn().mockResolvedValue(compiled), resolveMarkdownRelativeLinks });
  expect(data.compiled?.blocks).toContainEqual(expect.objectContaining({ html: '<a href="/docs/custom/next.md">Next</a>' }));
  expect(data.routeEntry).toEqual({ kind: "page" });expect(JSON.stringify(data)).not.toContain("raw provider record");
 });
 it.each([undefined,"","https://docs.test","https://docs.test/","https://docs.test"+"/".repeat(10000)])("preserves API records, canonical normalization and caller fallback (%s)", async canonicalUrl => {
  fixture.entry = { kind: "api", route: "/docs/api/http", api: { title: "HTTP", frontmatter: {} } };
  const sidebar = { id: "docs", items: [] };
  const source = { canonicalUrl, manifest: { sidebars: { docs: sidebar }, navigation: { topNav: [] }, versions: [] }, searchArtifact: {} } as unknown as DocsSiteSource;
  const data = await loadDocsPage({ slug: "api/http", source, getCompiledDocsPage: vi.fn(), resolveMarkdownRelativeLinks: vi.fn(), options: { fallbackSidebarId: "docs" } });
  expect(data.routeEntry).toEqual(fixture.entry);expect(data.sidebar).toBe(sidebar);
  expect(data.surface.canonicalUrl).toBe(canonicalUrl ? "https://docs.test/docs/api/http" : "/docs/api/http");
 });
});
