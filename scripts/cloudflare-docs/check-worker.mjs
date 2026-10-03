import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { repoRoot, normalizeEnvironment } from "./config.mjs";

// Requires an ApiFn adapter-cloudflare build for the selected environment.
// Bundling and execution are local: no upload, domain attachment or credentials.
const environment = normalizeEnvironment(process.argv[2] ?? "dev");
assert(environment, "Expected dev or live");
const origin = environment === "dev" ? "https://dev-docs.apifn.dev" : "https://docs.apifn.dev";
const docs = path.join(repoRoot, "apifn/docs");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL"]) delete env[key];
function run(command, args) {
  const result = spawnSync(command, args, { cwd: docs, env, stdio: "inherit", shell: process.platform === "win32" });
  assert.equal(result.status, 0, "Local Worker bundling failed");
}
run(process.execPath, [path.join(repoRoot, "scripts/cloudflare-docs/deploy.mjs"), environment, "--products=apifn", "--dry-run", "--skip-build"]);
const config = JSON.parse(fs.readFileSync(path.join(docs, ".cloudflare-docs-wrangler.jsonc"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(docs, ".cloudflare-docs-domain.json"), "utf8"));
assert.equal(config.account_id, "1befb9044360e6ea040ea5038f8ddb5a");
assert.equal(config.name, `superfunctions-apifn-docs-${environment}`);
assert.equal(config.assets.binding, "ASSETS");
assert.equal(config.routes, undefined);
assert.deepEqual(plan.body, {
  override_scope: false, override_existing_origin: false, override_existing_dns_record: false,
  origins: [{ hostname: new URL(origin).hostname, zone_id: "9e8b538ad4b7a44ce7bd85ff8db1cfdc" }],
});
const require = createRequire(path.join(repoRoot, "package.json"));
// Resolve Miniflare from the executing Wrangler's declared dependency owner.
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare");
const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "apifn-local-worker-"));
let mf;
try {
  run(path.join(repoRoot, "node_modules/.bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler"), ["deploy", "--config", path.join(docs, ".cloudflare-docs-wrangler.jsonc"), "--dry-run", "--outdir", bundle]);
  const entry = path.join(bundle, "_worker.js");
  // The real Wrangler bundle contains dynamic imports in unused library paths;
  // provide its actual module explicitly, rather than walking unbundled imports.
  mf = new Miniflare({
    name: config.name, modulesRoot: bundle,
    modules: [{ type: "ESModule", path: entry, contents: fs.readFileSync(entry, "utf8") }],
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    assets: { directory: path.join(docs, config.assets.directory), binding: config.assets.binding, routerConfig: { has_user_worker: true } },
  });
  for (const route of ["/", "/?utm_source=campaign", "/?q=%2F&q=%3F", "/?lang=ja&return=%2Fdocs", "/docs", "/docs/getting-started"]) {
    const response = await mf.dispatchFetch(origin + route);
    const html = await response.text();
    assert.equal(response.status, 200, route);
    assert.equal((html.match(/<title>/g) || []).length, 1, route);
    assert.match(html, /<title>[^<]+<\/title>/);
  }
  for (const route of ["/docs/search.json", "/docs/llms.txt", "/docs/llms-full.txt", "/docs/__data.json"]) {
    const response = await mf.dispatchFetch(origin + route);
    assert.equal(response.status, 200, route);
    if (route.endsWith(".json")) JSON.parse(await response.text());
    if (route.endsWith("search.json")) assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  }
  for (const route of ["/api", "/dashboard", "/future-app-path?new=1", "/docs/__missing_docs_contract__"]) {
    assert.equal((await mf.dispatchFetch(origin + route)).status, 404, route);
  }
  const head = await mf.dispatchFetch(origin + "/?head=1", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  for (const [headers, expected] of [[{}, 403], [{ origin }, 405]]) {
    assert.equal((await mf.dispatchFetch(origin + "/?body=1", { method: "POST", body: "not-forwarded", headers: { "content-type": "text/plain", ...headers } })).status, expected);
  }
  const html = await (await mf.dispatchFetch(origin + "/")).text();
  const refs = [...html.matchAll(/(?:src|href|import\()=?["']([^"']+\.(?:js|css))["']/g)].map((match) => match[1]).filter((ref) => ref.includes("/docs/_app/"));
  assert(refs.length > 0);
  for (const ref of refs) {
    const url = new URL(ref, origin); assert.equal(url.origin, origin, "Built asset origin must match selected environment");
    const response = await mf.dispatchFetch(url);
    assert.equal(response.status, 200, ref);
    assert.match(response.headers.get("content-type"), ref.endsWith(".js") ? /javascript/ : /css/);
    assert.match(response.headers.get("cache-control"), /immutable/);
  }
  console.log(JSON.stringify({ environment, origin, localWorkerd: true, rootQueries: true, nativeDataAndAssets: true, unknown404: true, post403And405: true, liveRoutingNotProved: true }));
} finally {
  if (mf) await mf.dispose();
  fs.rmSync(bundle, { recursive: true, force: true });
}
