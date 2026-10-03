import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function deploymentFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-domain-config-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts/cloudflare-docs"), { recursive: true });
  for (const file of ["config.mjs", "custom-domain.mjs", "deploy.mjs"]) {
    fs.copyFileSync(new URL(file, import.meta.url), path.join(root, "scripts/cloudflare-docs", file));
  }
  for (const product of ["apifn", "authfn", "filefn"]) {
    const docs = path.join(root, product, "docs");
    fs.mkdirSync(path.join(docs, ".svelte-kit/cloudflare"), { recursive: true });
    fs.writeFileSync(path.join(docs, "package.json"), '{"type":"module"}');
    // This fixture proves CLI/config wiring only. Real artifact/runtime proof is separate.
    fs.writeFileSync(path.join(docs, ".svelte-kit/cloudflare/_worker.js"), "export default {};\n");
  }
  fs.mkdirSync(path.join(root, "node_modules/.bin"), { recursive: true });
  const stub = path.join(root, "fake-wrangler.cjs");
  fs.writeFileSync(stub, `require('node:fs').writeFileSync(${JSON.stringify(path.join(root, "wrangler-call.json"))}, JSON.stringify(process.argv.slice(2)));\n`);
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(root, "node_modules/.bin/wrangler.cmd"), `@echo off\r\n"${process.execPath}" "${stub}" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(root, "node_modules/.bin/wrangler"), `#!${process.execPath}\nrequire(${JSON.stringify(stub)});\n`, { mode: 0o755 });
  }
  const run = (environment, product = "apifn", dryRun = true) => spawnSync(process.execPath, [
    path.join(root, "scripts/cloudflare-docs/deploy.mjs"), environment, `--products=${product}`, "--skip-build", ...(dryRun ? ["--dry-run"] : []),
  ], { encoding: "utf8", env: { PATH: process.env.PATH } });
  return { root, run };
}
for (const environment of ["dev", "live"]) {
  test(`${environment}: actual deploy dry-run emits only approved domain plan and Worker upload config`, (t) => {
    const { root, run } = deploymentFixture(t);
    const result = run(environment);
    assert.equal(result.status, 0, result.stderr);
    const docs = path.join(root, "apifn/docs");
    const config = JSON.parse(fs.readFileSync(path.join(docs, ".cloudflare-docs-wrangler.jsonc"), "utf8"));
    const plan = JSON.parse(fs.readFileSync(path.join(docs, ".cloudflare-docs-domain.json"), "utf8"));
    assert.equal(config.account_id, "1befb9044360e6ea040ea5038f8ddb5a");
    assert.equal(config.name, `superfunctions-apifn-docs-${environment}`);
    assert.equal(config.main, ".svelte-kit/cloudflare/_worker.js");
    assert.deepEqual(config.assets, { directory: ".svelte-kit/cloudflare", binding: "ASSETS" });
    assert.equal(config.route, undefined);
    assert.equal(config.routes, undefined, "Wrangler must not publish domains with implicit CI overrides");
    assert.equal(plan.path, `/accounts/1befb9044360e6ea040ea5038f8ddb5a/workers/scripts/superfunctions-apifn-docs-${environment}/domains/records`);
    assert.deepEqual(plan.body, {
      override_scope: false, override_existing_origin: false, override_existing_dns_record: false,
      origins: [{ hostname: environment === "dev" ? "dev-docs.apifn.dev" : "docs.apifn.dev", zone_id: "9e8b538ad4b7a44ce7bd85ff8db1cfdc" }],
    });
    const args = JSON.parse(fs.readFileSync(path.join(root, "wrangler-call.json"), "utf8"));
    assert(args.includes("--dry-run"));
    assert(!args.includes("--force"));
  });
}
test("actual non-dry deploy blocks missing credentials before invoking Wrangler", (t) => {
  const { root, run } = deploymentFixture(t);
  const result = run("dev", "apifn", false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approved CLOUDFLARE_ACCOUNT_ID/);
  assert(!fs.existsSync(path.join(root, "wrangler-call.json")));
});
for (const product of ["authfn", "filefn"]) {
  test(`${product}: existing upload configuration is unchanged by ApiFn custom-domain handling`, (t) => {
    const { root, run } = deploymentFixture(t);
    const result = run("dev", product);
    assert.equal(result.status, 0, result.stderr);
    const docs = path.join(root, product, "docs");
    const config = JSON.parse(fs.readFileSync(path.join(docs, ".cloudflare-docs-wrangler.jsonc"), "utf8"));
    assert.deepEqual(config, {
      name: `superfunctions-${product}-docs-dev`, compatibility_date: "2026-05-18", workers_dev: true,
      observability: { enabled: true }, assets: { directory: ".svelte-kit/cloudflare" },
      main: ".svelte-kit/cloudflare/_worker.js", compatibility_flags: ["nodejs_compat"],
    });
    assert(!fs.existsSync(path.join(docs, ".cloudflare-docs-domain.json")));
  });
}
