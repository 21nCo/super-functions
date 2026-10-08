import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const checker = fileURLToPath(new URL("./check-built-site.mjs", import.meta.url));

test("rejects every undeclared search argument before importing a generated server", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-built-admission-"));
  try {
    for (const input of ["", "/", "http://external.invalid/", "@external.invalid/search.json", "//external.invalid/", "/docs/search.json?url=external", "/docs/%73earch.json", "../search.json", "/docs/search.json#fragment", "/docs/search.json\n"]) {
      const result = spawnSync(process.execPath, [checker, input], { cwd: dir, encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Expected \/docs\/search.json or \/search.json/);
      assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    }
  } finally { rmSync(dir, { recursive: true }); }
});

test("declared search endpoints reach native artifact loading instead of argument rejection", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-built-admitted-"));
  try {
    for (const args of [[], ["/docs/search.json"], ["/search.json"]]) {
      const result = spawnSync(process.execPath, [checker, ...args], { cwd: dir, encoding: "utf8" });
      assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/);
      assert.doesNotMatch(result.stderr, /Expected \/docs\/search.json/);
    }
  } finally { rmSync(dir, { recursive: true }); }
});
