import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
test("migration rejects parent routes before creating output or overwriting outside files", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-safety-"));
  try {
    const source = join(root, "source");
    const target = join(root, "target");
    const outside = join(root, "outside");
    await mkdir(join(source, "docs"), { recursive: true });
    await mkdir(join(source, "pages"));
    await mkdir(outside);
    await writeFile(join(source, "docs/index.md"), "# Docs");
    await writeFile(join(source, "pages/page.md"), "# Replacement");
    await writeFile(join(outside, "page.md"), "Keep this file");
    for (const route of ["/../../../outside", "/%2e%2e/%2e%2e/%2e%2e/outside", "/docs/./pages"]) {
      await assert.rejects(execute(process.execPath, [cli, "migrate", "docusaurus", source,
        "--out-dir", target, "--pages-dir", "pages", "--pages-base-path", route], { timeout: 30000 }),
        error => /without dot segments/.test(error.stdout + error.stderr));
      assert.equal(await readFile(join(outside, "page.md"), "utf8"), "Keep this file");
      await assert.rejects(access(target));
    }
    await execute(process.execPath, [cli, "migrate", "docusaurus", source,
      "--out-dir", target, "--pages-dir", "pages", "--pages-base-path", "/product"], { timeout: 30000 });
    assert.match(await readFile(join(target, "content/pages/product/page.md"), "utf8"), /Replacement/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
