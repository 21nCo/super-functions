import { expect, it } from "vitest";
import { getPaginationFromSidebarWithTitles, selectApiReferenceRoute } from "./helpers";
import { buildOpenApiReference } from "./openapi";
import type { ApiReference, DocPage, Sidebar } from "./types";

it("keeps the other pagination direction when only one direction is overridden", () => {
  const pages = Object.fromEntries(["a", "b", "c"].map((slug) => [slug, {
    kind: "page", id: slug, slug, path: `/${slug}`, title: slug.toUpperCase(),
    body: "", headings: [], frontmatter: slug === "b" ? { prev: "/custom" } : {},
  } satisfies DocPage]));
  const sidebar: Sidebar = { id: "docs", items: ["a", "b", "c"].map((slug) => ({ type: "link", text: slug, link: `/${slug}` })) };
  expect(getPaginationFromSidebarWithTitles("/b", sidebar, pages)).toMatchObject({
    prev: { path: "/custom" }, next: { path: "/c", title: "C" },
  });
});

it("projects API subroutes without mutating the manifest overview", () => {
  const spec = buildOpenApiReference({ sourceId: "api:x.json", sourcePath: "x.json", fallbackTitle: "X", body: JSON.stringify({
    openapi: "3.0.3", info: { title: "X", version: "1" },
    paths: { "/a": { get: { tags: ["A"], responses: {} } }, "/b": { get: { tags: ["B"], responses: {} } } },
  }) });
  const api: ApiReference = { kind: "api", id: "x", slug: "x", path: spec.routes.overview, title: spec.title, frontmatter: {}, spec };
  const operation = spec.operations[0];
  operation.summary = "   ";
  const selected = selectApiReferenceRoute(api, operation.routePath);
  expect(selected.title).toBe(`X — ${operation.id}`);
  expect(selected.path).toBe(operation.routePath);
  expect((selected.spec as typeof spec).title).toBe(selected.title);
  expect((selected.spec as typeof spec).operations).toEqual([operation]);
  expect(spec.operations).toHaveLength(2);
  expect(selectApiReferenceRoute(api, api.path)).toBe(api);
});

it.each(["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "data:text/html,x", "//evil.example/x", "\\evil.example/x"])("rejects unsafe pagination override %s", value => {
  const page = { kind: "page", id: "x", slug: "x", path: "/x", title: "X", body: "", headings: [], frontmatter: { prev: value } } as DocPage;
  expect(() => getPaginationFromSidebarWithTitles("/x", { id: "docs", items: [] }, { x: page })).toThrow(expect.objectContaining({ code: "DOCS_ENTRY_INVALID" }));
});

it("encodes spaces in local pagination overrides", () => {
  const page = { kind: "page", id: "x", slug: "x", path: "/x", title: "X", body: "", headings: [], frontmatter: { prev: "/docs/Getting Started" } } as DocPage;
  expect(getPaginationFromSidebarWithTitles("/x", { id: "docs", items: [] }, { x: page }).prev?.path).toBe("/docs/Getting%20Started");
});

it("resolves pagination titles before encoding href spaces", () => {
  const target = { kind: "page", id: "target", slug: "Getting Started", path: "/docs/Getting Started", title: "Welcome", body: "", headings: [], frontmatter: {} } as DocPage;
  const page = { ...target, id: "current", path: "/current", frontmatter: { prev: target.path } };
  expect(getPaginationFromSidebarWithTitles(page.path, { id: "docs", items: [] }, { page, target }).prev).toEqual({ path: "/docs/Getting%20Started", title: "Welcome" });
});
