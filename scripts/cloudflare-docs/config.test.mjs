import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { customDomainsFor, routesFor, parseProducts, routeDefinition } from "./config.mjs";

for (const environment of ["dev", "live"]) {
  test(`ApiFn ${environment} owns only the approved docs hostname, including root queries`, () => {
    const hostname = environment === "dev" ? "dev-docs.apifn.dev" : "docs.apifn.dev";
    const domains = customDomainsFor(environment, ["apifn"]);
    assert.deepEqual(domains, [{
      product: "apifn", environment, hostname,
      zoneName: "apifn.dev", zoneId: "9e8b538ad4b7a44ce7bd85ff8db1cfdc",
      accountId: "1befb9044360e6ea040ea5038f8ddb5a",
      script: `superfunctions-apifn-docs-${environment}`,
    }]);
    assert.deepEqual(routesFor(environment, ["apifn"]), []);
    assert.throws(() => routeDefinition("apifn", environment), /not Worker Routes/);
    // Custom Domains own a hostname, not URL patterns subject to query matching.
    const owns = (url) => domains.some((domain) => domain.hostname === new URL(url).hostname);
    for (const suffix of ["/", "/?utm_source=campaign", "/?q=%2F&q=%3F", "/docs", "/docs/?lang=ja", "/docs/search.json", "/docs/_app/immutable/main.js?v=1", "/unknown-docs-path"]) {
      assert(owns(`https://${hostname}${suffix}`), suffix);
    }
    for (const host of ["apifn.com", "dev.apifn.com", "apifn.dev", "dev.apifn.dev", "superfunctions-apifn-landing-dev.21n.workers.dev"]) {
      assert(!owns(`https://${host}/?q=1`), host);
    }
    assert.deepEqual(parseProducts("apifn"), ["apifn"]);
  });
  test(`existing ${environment} product routes/aliases are unchanged`, () => {
    const prefix = environment === "dev" ? "dev." : "";
    const expected = [`${prefix}datafn.dev/docs*`, `${prefix}filefn.com/docs*`, `${prefix}searchfn.com/docs*`, `${prefix}authfn.com/docs*`];
    if (environment === "live") expected.splice(1, 0, "www.datafn.dev/docs*");
    if (environment === "live") expected.splice(4, 0, "www.searchfn.com/docs*");
    const others = ["datafn", "filefn", "searchfn", "authfn"];
    assert.deepEqual(routesFor(environment, ["apifn", ...others]).map(route => route.pattern), expected);
    assert.deepEqual(customDomainsFor(environment, others), []);
  });
  test(`ApiFn ${environment} Route sync skips Custom Domains without credentials or network`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("sync-routes.mjs", import.meta.url)), environment, "--products=apifn"], {
      env: { PATH: process.env.PATH }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Custom Domain is managed by deploy.mjs/);
  });
}
test("route-sync dispatch retains product/environment wiring but no obsolete .com zone", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/superfunctions-docs-cloudflare-routes.yml", import.meta.url), "utf8");
  assert.match(workflow, /options:\s*\n\s*- all\s*\n\s*- apifn/);
  assert(!workflow.includes("APIFN_COM"));
  assert(workflow.includes("CLOUDFLARE_ROUTES_TOKEN"));
  assert(workflow.includes("--products=${{ github.event.inputs.product }}"));
});
