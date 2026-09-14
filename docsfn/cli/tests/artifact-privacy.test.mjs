import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const run = async (...args) => {
  try { return await execute(...args); }
  catch (error) { throw new Error(`${error.message}\n${error.stdout}\n${error.stderr}`); }
};
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
for (const mode of ["mixed", "public"]) {
  test(`CLI public artifacts fail closed for ${mode} auth`, async () => {
    const root = await mkdtemp(join(tmpdir(), "docsfn-artifact-privacy-"));
    try {
      await mkdir(join(root, "content/docs/internal"), { recursive: true });
      await writeFile(join(root, "content/docs/internal/hidden.md"), "---\ntitle: Opaque classified title\n---\n\nOpaque classified body");
      await writeFile(join(root, "content/docs/public.md"), "---\ntitle: Ordinary public title\n---\n\nOrdinary public body");
      await writeFile(join(root, "docsfn.config.mjs"), `export default ${JSON.stringify({ schemaVersion: 1, site: { title: "Fixture" }, content: { root: "." }, auth: { enabled: mode === "mixed", mode }, search: { enabled: true, scopes: ["docs"], bodyIndexing: "full" } })};`);
      const built = await run(process.execPath, [cli, "build", root, "--out-dir", "out"], { timeout: 30000 });
      await run(process.execPath, [cli, "llms", root, "--static-dir", "static"], { timeout: 30000 });
      const search = JSON.parse(await readFile(join(root, "out/search.json"), "utf8"));
      const llms = await readFile(join(root, "static/llms.txt"), "utf8");
      const full = await readFile(join(root, "static/llms-full.txt"), "utf8");
      if (mode === "mixed") {
        assert.equal(search.documents.length, 0);
        for (const artifact of [JSON.stringify(search), llms, full]) {
          assert.ok(!artifact.includes("Opaque classified"));
          assert.ok(!artifact.includes("Ordinary public"));
        }
        assert.match(built.stdout + built.stderr, /omit all routes/);
      } else {
        assert.ok(search.documents.length > 0);
        for (const artifact of [JSON.stringify(search), llms, full]) {
          assert.match(artifact, /Opaque classified/);
          assert.match(artifact, /Ordinary public/);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
