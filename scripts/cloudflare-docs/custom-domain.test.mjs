import assert from "node:assert/strict";
import { test } from "node:test";
import { customDomainsFor } from "./config.mjs";
import { verifyCustomDomainOwnership, customDomainPublication, attachCustomDomain } from "./custom-domain.mjs";

function fixture(environment = "dev", edits = {}) {
  const target = customDomainsFor(environment, ["apifn"])[0];
  const data = {
    zone: { id: target.zoneId, name: "apifn.dev", status: "active", type: "full", account: { id: target.accountId } },
    dns: [], domains: [], routes: [], rulesets: [{ id: "managed", kind: "managed", phase: "http_request_sanitize" }], pagerules: [],
    ...edits,
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(new URL(url).origin, "https://api.cloudflare.com");
    assert.equal(options.method, "GET", "ownership preflight cannot mutate infrastructure");
    const path = new URL(url).pathname;
    let result;
    if (path.endsWith("/dns_records")) result = data.dns;
    else if (path.endsWith("/workers/domains")) result = data.domains;
    else if (path.endsWith("/workers/routes")) result = data.routes;
    else if (path.endsWith("/rulesets")) result = data.rulesets;
    else if (path.endsWith("/pagerules")) result = data.pagerules;
    else { assert.equal(path, `/client/v4/zones/${target.zoneId}`); result = data.zone; }
    const paginated = path.endsWith("/dns_records");
    if (!paginated) assert.equal(new URL(url).search, "", "complete array endpoints have no page/per_page parameters");
    const page = Number(new URL(url).searchParams.get("page") || 1);
    const rows = paginated ? result.slice(page - 1, page) : result;
    const payload = { success: true, result: rows, ...(paginated ? { result_info: { page, total_count: result.length } } : {}) };
    return new Response(JSON.stringify(payload));
  };
  return { target, data, calls, options: { accountId: target.accountId, token: "test-only-token", fetchImpl } };
}

for (const environment of ["dev", "live"]) {
  test(`${environment}: new docs domain requires the approved active zone/account and empty ownership`, async () => {
    const { target, calls, options } = fixture(environment);
    assert.deepEqual(await verifyCustomDomainOwnership(target, options), { hostname: target.hostname, existing: false });
    assert(calls.every(({ url, method }) => method === "GET" && new URL(url).origin === "https://api.cloudflare.com"));
    for (const endpoint of ["dns_records", "workers/domains", "workers/routes", "rulesets", "pagerules"]) {
      assert(calls.some(({ url }) => new URL(url).pathname.endsWith(endpoint)));
    }
  });
  test(`${environment}: own matching domain redeploy accepts only its proxied address records`, async () => {
    const { target, data, options } = fixture(environment);
    data.domains = [{ id: "own", hostname: target.hostname, zone_id: target.zoneId, service: target.script, environment: "production" }];
    data.dns = [{ id: "own-dns", name: target.hostname, type: "AAAA", proxied: true }];
    assert.deepEqual(await verifyCustomDomainOwnership(target, options), { hostname: target.hostname, existing: true });
  });
}
for (const change of [
  { hostname: "apifn.dev" }, { hostname: "dev.apifn.com" }, { script: "superfunctions-apifn-landing-dev" },
  { accountId: "foreign" }, { zoneId: "foreign" },
]) {
  test(`unapproved target fails before any network: ${JSON.stringify(change)}`, async () => {
    const f = fixture();
    await assert.rejects(verifyCustomDomainOwnership({ ...f.target, ...change }, f.options), /Unapproved/);
    assert.equal(f.calls.length, 0);
  });
}
for (const credentials of [{ accountId: "foreign" }, { accountId: undefined }, { token: undefined }]) {
  test(`missing/wrong deployment credentials fail before network: ${JSON.stringify(credentials)}`, async () => {
    const f = fixture();
    await assert.rejects(verifyCustomDomainOwnership(f.target, { ...f.options, ...credentials }), /approved CLOUDFLARE_ACCOUNT_ID/);
    assert.equal(f.calls.length, 0);
  });
}
for (const change of [{ name: "apifn.com" }, { id: "foreign" }, { type: "partial" }, { status: "pending" }, { account: { id: "foreign" } }]) {
  test(`zone ownership mismatch blocks attachment: ${JSON.stringify(change)}`, async () => {
    const f = fixture(); Object.assign(f.data.zone, change);
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /approved active owner/);
    assert.equal(f.calls.length, 1);
  });
}
for (const record of [
  { name: "dev-docs.apifn.dev", type: "CNAME", proxied: true },
  { name: "dev-docs.apifn.dev", type: "A", proxied: true },
  { name: "*.apifn.dev", type: "AAAA", proxied: true },
  { name: "dev-docs.apifn.dev", type: "NS" },
]) {
  test(`late-page DNS conflict is preserved: ${JSON.stringify(record)}`, async () => {
    const f = fixture(); f.data.dns = [{ id: "unrelated", name: "app.apifn.dev", type: "CNAME" }, { id: "foreign", ...record }];
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /Conflicting docs DNS/);
    assert(f.calls.some(({ url }) => new URL(url).pathname.endsWith("dns_records") && Number(new URL(url).searchParams.get("page")) > 1));
  });
}
for (const change of [{ service: "superfunctions-apifn-landing-dev" }, { zone_id: "foreign" }, { environment: "staging" }]) {
  test(`complete single-array domain inventory finds a foreign owner beyond the first row: ${JSON.stringify(change)}`, async () => {
    const f = fixture(); f.data.domains = [{ id: "unrelated", hostname: "app.apifn.dev", service: "application", zone_id: f.target.zoneId, environment: "production" }, {
      id: "foreign", hostname: f.target.hostname, service: f.target.script, zone_id: f.target.zoneId, environment: "production", ...change,
    }];
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /another service/);
    assert(f.calls.some(({ url }) => new URL(url).pathname.endsWith("workers/domains") && !new URL(url).search));
  });
}
for (const pattern of ["dev-docs.apifn.dev/docs*", "https://*.apifn.dev/*", "http*://*apifn.dev/api*", "*/*"]) {
  test(`overlapping Route or Page Rule blocks even a partial path: ${pattern}`, async () => {
    const f = fixture(); f.data.routes = [{ id: "conflict-route", pattern, script: null }];
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /route\/ruleset/);
    f.data.routes = []; f.data.pagerules = [{ id: "conflict-rule", status: "active", targets: [{ constraint: { value: pattern } }] }];
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /route\/ruleset/);
  });
}
test("zone custom redirect/origin rule fails closed, unrelated hostname routes remain untouched", async () => {
  const f = fixture(); f.data.routes = [{ id: "application-route", pattern: "app.apifn.dev/*", script: "application" }];
  await verifyCustomDomainOwnership(f.target, f.options);
  f.data.rulesets.push({ kind: "zone", phase: "http_request_origin", id: "application-origin" });
  await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /route\/ruleset/);
});
test("own domain does not authorize DNS CNAME/unproxied-record replacement", async () => {
  const f = fixture(); f.data.domains = [{ id: "own", hostname: f.target.hostname, service: f.target.script, zone_id: f.target.zoneId, environment: "production" }];
  for (const record of [{ type: "CNAME", proxied: true }, { type: "AAAA", proxied: false }]) {
    f.data.dns = [{ id: "conflict", name: f.target.hostname, ...record }];
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /DNS ownership/);
  }
});
test("attachment never requests Wrangler's non-interactive ownership overrides", async () => {
  const f = fixture(); const reads = f.options.fetchImpl; const mutations = [];
  const publication = customDomainPublication(f.target);
  assert.deepEqual(publication.body, {
    override_scope: false, override_existing_origin: false, override_existing_dns_record: false,
    origins: [{ hostname: "dev-docs.apifn.dev", zone_id: "9e8b538ad4b7a44ce7bd85ff8db1cfdc" }],
  });
  await attachCustomDomain(f.target, { ...f.options, fetchImpl: async (url, options) => {
    if (options.method === "GET") return reads(url, options);
    assert.equal(options.method, "PUT");
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${f.target.accountId}/workers/scripts/superfunctions-apifn-docs-dev/domains/records`);
    mutations.push(JSON.parse(options.body));
    return new Response('{"success":true}');
  } });
  assert.deepEqual(mutations, [publication.body]);
  f.data.dns = [{ id: "late-conflict", name: f.target.hostname, type: "CNAME" }];
  await assert.rejects(attachCustomDomain(f.target, f.options), /DNS ownership/);
});
test("attachment server conflict is reported as partial deployment, not overridden or retried", async () => {
  const f = fixture(); let writes = 0;
  await assert.rejects(attachCustomDomain(f.target, { ...f.options, fetchImpl: (url, options) => {
    if (options.method === "GET") return f.options.fetchImpl(url, options);
    writes++; return new Response('{"success":false}', { status: 409 });
  } }), /uploaded but Custom Domain attachment failed/);
  assert.equal(writes, 1);
});
test("another hostname on the same Worker blocks a redeploy, even outside the zone", async () => {
  const f = fixture(); f.data.domains = [{ id: "other-host", hostname: "other.example.com", service: f.target.script, zone_id: "another-zone", environment: "production" }];
  await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /already serves another hostname/);
});
test("duplicate late-page inventory IDs fail instead of hiding a conflict", async () => {
  const f = fixture(); f.data.dns = [{ id: "duplicate", name: "app.apifn.dev", type: "CNAME" }, { id: "duplicate", name: "app.apifn.dev", type: "CNAME" }];
  await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /Incomplete or changing/);
});
for (const environment of ["dev", "live"]) {
  test(`${environment}: zone apex NS is not docs-host delegation`, async () => {
    const f = fixture(environment);
    f.data.dns = [{ id: "apex-ns", name: "apifn.dev", type: "NS" }];
    assert.equal((await verifyCustomDomainOwnership(f.target, f.options)).existing, false);
    f.data.dns.push({ id: "delegation", name: f.target.hostname, type: "NS" });
    await assert.rejects(verifyCustomDomainOwnership(f.target, f.options), /Conflicting docs DNS/);
  });
  test(`${environment}: later Rulesets cursor conflict blocks preflight and attachment without writes`, async () => {
    const f = fixture(environment); const original = f.options.fetchImpl; const calls = [];
    const options = { ...f.options, fetchImpl: async (url, request) => {
      calls.push({ url, method: request.method });
      assert.equal(request.method, "GET", "a later-cursor conflict cannot authorize PUT");
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith("/rulesets")) return original(url, request);
      return new Response(JSON.stringify(parsed.searchParams.has("cursor") ? {
        success: true, result: [{ id: "late-origin", kind: "zone", phase: "http_request_origin" }], result_info: { count: 1 },
      } : {
        success: true, result: [{ id: "managed", kind: "managed", phase: "http_request_sanitize" }], result_info: { cursor: "next/+?&=", count: 1 },
      }));
    } };
    await assert.rejects(verifyCustomDomainOwnership(f.target, options), /route\/ruleset/);
    await assert.rejects(attachCustomDomain(f.target, options), /route\/ruleset/);
    assert(calls.some(({ url }) => new URL(url).searchParams.get("cursor") === "next/+?&="));
  });
}
test("denied, malformed and incomplete inventories never permit deployment", async () => {
  const f = fixture();
  for (const response of [new Response("{}", { status: 403 }), new Response('{"success":false}'), new Response('{"success":true,"result":null}')]) {
    await assert.rejects(verifyCustomDomainOwnership(f.target, { ...f.options, fetchImpl: async () => response.clone() }));
  }
  const original = f.options.fetchImpl;
  await assert.rejects(verifyCustomDomainOwnership(f.target, { ...f.options, fetchImpl: async (url, options) => {
    const response = await original(url, options); const payload = await response.json();
    if (url.includes("dns_records")) delete payload.result_info;
    return new Response(JSON.stringify(payload));
  } }), /Incomplete/);
});
