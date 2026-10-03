import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

for (const argument of ["https://example.com/", "//example.com/", "@example.com/", "/api", "/docs/search.json?key=secret", "/search.json#fragment", ""]) {
  test(`native checker rejects unsupported request path ${JSON.stringify(argument)} before server initialization`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./check-built-site.mjs", import.meta.url)), argument], { cwd: tmpdir(), encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported search artifact path/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|\.svelte-kit\/output/);
  });
}
