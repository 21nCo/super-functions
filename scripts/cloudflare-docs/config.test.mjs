import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { routesFor, parseProducts } from "./config.mjs";

for (const environment of ["dev", "live"]) {
  test(`ApiFn ${environment} routes cover root/docs without taking unrelated paths`, () => {
    const host = environment === "dev" ? "dev.apifn.com" : "apifn.com";
    const routes = routesFor(environment, ["apifn"]);
    assert.deepEqual(routes.map(route => route.pattern), [`${host}/docs*`, `${host}/`]);
    for (const route of routes) {
      assert.equal(route.zoneName, "apifn.com");
      assert.equal(route.script, `superfunctions-apifn-docs-${environment}`);
    }
    const matches = pathname => routes.some(({ pattern }) =>
      new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`).test(host + pathname));
    for (const pathname of ["/", "/docs", "/docs/guide", "/docs/search.json", "/docs/_app/immutable/main.js"]) assert(matches(pathname), pathname);
    for (const pathname of ["/api", "/api/auth", "/dashboard", "/other"]) assert(!matches(pathname), pathname);
    assert.deepEqual(parseProducts("apifn"), ["apifn"]);
  });
  test(`existing ${environment} product routes/aliases are unchanged`, () => {
    const prefix = environment === "dev" ? "dev." : "";
    const expected = [`${prefix}datafn.dev/docs*`, `${prefix}filefn.com/docs*`, `${prefix}searchfn.com/docs*`, `${prefix}authfn.com/docs*`];
    if (environment === "live") expected.splice(1, 0, "www.datafn.dev/docs*");
    if (environment === "live") expected.splice(4, 0, "www.searchfn.com/docs*");
    assert.deepEqual(routesFor(environment, ["datafn", "filefn", "searchfn", "authfn"]).map(route => route.pattern), expected);
  });
}
test("route-sync dispatch exposes ApiFn with zone/token/environment wiring", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/superfunctions-docs-cloudflare-routes.yml", import.meta.url), "utf8");
  assert.match(workflow, /options:\s*\n\s*- all\s*\n\s*- apifn/);
  assert(workflow.includes("CLOUDFLARE_ZONE_ID_APIFN_COM: ${{ vars.CLOUDFLARE_ZONE_ID_APIFN_COM }}"));
  assert(workflow.includes("CLOUDFLARE_ROUTES_TOKEN"));
  assert(workflow.includes("--products=${{ github.event.inputs.product }}"));
});
