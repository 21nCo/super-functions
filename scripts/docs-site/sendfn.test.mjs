import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = file => readFileSync(root + file, "utf8");

it("SendFn public /docs landing and local root delegate to one product component", () => {
  const rootRoute = read("sendfn/docs/src/routes/+page.svelte");
  expect(read("sendfn/docs/src/routes/docs/+page.svelte")).toBe(rootRoute);
  expect(rootRoute).toContain('<SendFnLanding {data} />');
  const component = read("sendfn/docs/src/lib/components/SendFnLanding.svelte");
  expect(component).toContain('name="SendFn"');
  expect(component).toContain("One SDK for product communications.");
  expect(component).not.toContain("<style>");
});

it("source-backed SendFn guide owns spelling and the parser required by pinned adapter 0.1.2", () => {
  const source = read("sendfn/typescript/README.md").replace(/^# [^\r\n]+\r?\n\r?\n/, "");
  const mirror = read("sendfn/docs/content/docs/reference/typescript.md");
  expect(mirror).toBe(`---\ntitle: TypeScript SDK source guide\ndescription: Current source README for the TypeScript package.\n---\n\n${source}`);
  expect(source).toContain("@superfunctions/http@0.1.2 @superfunctions/http-express@0.1.2 express");
  expect(source).toContain("express.json({ type: ['application/json', 'text/plain'], limit: '2mb' })");
  expect(source.indexOf('app.use(express.json')).toBeLessThan(source.indexOf('app.use(toExpress'));
  expect(source).not.toContain('app.use(express.raw');
});

it.each(["sendfn", "authfn", "filefn"])("%s text producer retains supported static text while excluding binary extensions", product => {
  const source = read(`${product}/docs/src/lib/server/docs-site-source.ts`);
  const extensions = source.match(/static\/\*\*\/\*\.\{([^}]+)\}/)?.[1].split(",");
  expect(new Set(extensions)).toEqual(new Set(["txt", "json", "yaml", "yml", "md", "mdx"]));
});
