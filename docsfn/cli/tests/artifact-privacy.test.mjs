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

test("CLI validate and build expose search size warnings in their diagnostic channels", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-search-warning-"));
  try {
    await mkdir(join(root, "content/docs"), { recursive: true });
    await writeFile(join(root, "content/docs/index.md"), "---\ntitle: Public page\n---\n\nPublic body");
    await writeFile(join(root, "docsfn.config.mjs"), `export default ${JSON.stringify({ schemaVersion: 1, site: { title: "Fixture" }, content: { root: "." }, search: { enabled: true, scopes: ["docs"], maxArtifactBytes: 1 } })};`);
    for (const command of ["validate", "build"]) {
      const args = [cli, command, root, ...(command === "build" ? ["--out-dir", "out"] : [])];
      const result = await run(process.execPath, args, { timeout: 30000 });
      assert.match(result.stdout + result.stderr, /exceeds configured maxArtifactBytes/);
      assert.doesNotMatch(result.stdout + result.stderr, /No diagnostics reported/);
    }
    const diagnostics = await readFile(join(root, "out/diagnostics.json"), "utf8");
    assert.match(diagnostics, /exceeds configured maxArtifactBytes/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed LLM regeneration removes only owned outputs in the selected static directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-llms-stale-"));
  try {
    await mkdir(join(root, "content/docs"), { recursive: true });
    await writeFile(join(root, "content/docs/index.md"), "---\ntitle: Formerly public\n---\n\nFormerly public body");
    const config = join(root, "docsfn.config.mjs");
    await writeFile(config, `export default ${JSON.stringify({ schemaVersion: 1, site: { title: "Fixture" }, content: { root: "." } })};`);
    const args = [cli, "llms", root, "--static-dir", "public-artifacts"];
    await run(process.execPath, args, { timeout: 30000 });
    const directory = join(root, "public-artifacts");
    assert.match(await readFile(join(directory, "llms-full.txt"), "utf8"), /Formerly public body/);
    await writeFile(join(directory, "keep.txt"), "Unrelated content");
    await writeFile(config, "export default {schemaVersion: 999};");
    await assert.rejects(execute(process.execPath, args, { timeout: 30000 }));
    for (const name of ["llms.txt", "llms-full.txt"]) {
      await assert.rejects(readFile(join(directory, name)), error => error.code === "ENOENT");
    }
    assert.equal(await readFile(join(directory, "keep.txt"), "utf8"), "Unrelated content");
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("failed LLM generation preserves hand-maintained and edited files", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-llms-manual-"));
  try {
    await mkdir(join(root, "static"));
    await writeFile(join(root, "static/llms.txt"), "Hand-maintained index");
    await writeFile(join(root, "static/llms-full.txt"), "Hand-maintained content");
    await writeFile(join(root, "docsfn.config.mjs"), "export default {schemaVersion: 999};");
    await assert.rejects(execute(process.execPath, [cli, "llms", root], { timeout: 30000 }));
    assert.equal(await readFile(join(root, "static/llms.txt"), "utf8"), "Hand-maintained index");
    // An outdated ownership hash must not authorize removal after a manual edit.
    await writeFile(join(root, "static/.docsfn-llms-outputs.json"), JSON.stringify({ "llms.txt": "old-hash" }));
    await assert.rejects(execute(process.execPath, [cli, "llms", root], { timeout: 30000 }));
    assert.equal(await readFile(join(root, "static/llms-full.txt"), "utf8"), "Hand-maintained content");
    assert.equal(await readFile(join(root, "static/llms.txt"), "utf8"), "Hand-maintained index");
  } finally { await rm(root, { recursive: true, force: true }); }
});
