import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Run from a consuming workspace after its production build. Exercise the
// actual generated SvelteKit server; a successful build alone is not SSR proof.
const output = path.resolve(".svelte-kit/output/server");
const { Server } = await import(pathToFileURL(path.join(output, "index.js")));
const { manifest } = await import(pathToFileURL(path.join(output, "manifest.js")));
const server = new Server(manifest);
await server.init({ env: {} });
const results = [];
for (const [route, status] of [["/", 200], ["/docs", 200], ["/docs/__missing_docs_contract__", 404]]) {
  const response = await server.respond(new Request(`http://localhost${route}`), { getClientAddress: () => "127.0.0.1" });
  const html = await response.text();
  assert.equal(response.status, status, route);
  const titles = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g)].map((match) => match[1].replace(/<!--[\s\S]*?-->/g, "").trim());
  assert.equal(titles.length, 1, `${route} must have exactly one title`);
  assert(titles[0], `${route} title must not be empty`);
  if (route === "/") assert.equal([...html.matchAll(/<meta[^>]*name="description"[^>]*>/g)].length, 1);
  results.push({ route, status, titles });
}
// All consumers mount search at /docs; an explicit path can check a legacy alias.
const searchPath = process.argv[2] ?? "/docs/search.json";
const search = await server.respond(new Request(`http://localhost${searchPath}`), { getClientAddress: () => "127.0.0.1" });
assert.equal(search.status, 200);
const artifact = await search.json();
assert(Array.isArray(artifact.documents));
const child = artifact.documents.find((document) => document.path?.startsWith("/docs/") && document.title);
assert(child, "The built artifact must contain a titled child route");
const childResponse = await server.respond(new Request(`http://localhost${child.path}`), { getClientAddress: () => "127.0.0.1" });
assert.equal(childResponse.status, 200);
const childHtml = await childResponse.text();
const childTitles = [...childHtml.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g)].map((match) => match[1].replace(/<!--[\s\S]*?-->/g, "").trim());
assert.equal(childTitles.length, 1);
const expectedTitle = child.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
assert.equal(childTitles[0], expectedTitle, "Child title must override the layout fallback");
console.log(JSON.stringify({ routes: results, child: { path: child.path, title: childTitles[0] }, searchPath, searchDocuments: artifact.documents.length }));
