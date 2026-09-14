import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { publishOwnedArtifacts } from "../dist/owned-artifacts.js";
const marker = ".ownership.json";
async function withDirectory(run) {
  const root = await fs.mkdtemp(join(tmpdir(), "docsfn-owned-contract-"));
  try { await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("publication failure removes old/new owned outputs and cleans temporary files", () => withDirectory(async root => {
  await publishOwnedArtifacts(root, marker, { "a.txt": "old-a", "b.txt": "old-b" });
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (basename(to) === "b.txt") throw new Error("Injected second-publication failure");
    return rename(from, to);
  };
  try { await assert.rejects(publishOwnedArtifacts(root, marker, { "a.txt": "new-a", "b.txt": "new-b" }), /Injected/); }
  finally { fs.rename = rename; }
  for (const name of ["a.txt", "b.txt"]) await assert.rejects(fs.readFile(join(root, name)), { code: "ENOENT" });
  assert.deepEqual((await fs.readdir(root)).filter(name => name.endsWith(".tmp")), []);
  await publishOwnedArtifacts(root, marker, { "a.txt": "recovered" });
  assert.equal(await fs.readFile(join(root, "a.txt"), "utf8"), "recovered");
}));

test("a failed attempt never claims an identical manual file it did not replace", () => withDirectory(async root => {
  await fs.writeFile(join(root, "a.txt"), "same bytes");
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (basename(to) === "a.txt") throw new Error("Injected rename failure");
    return rename(from, to);
  };
  try { await assert.rejects(publishOwnedArtifacts(root, marker, { "a.txt": "same bytes" })); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(join(root, "a.txt"), "utf8"), "same bytes");
  assert.deepEqual(await publishOwnedArtifacts(root, marker, { "a.txt": undefined }), ["a.txt"]);
}));

test("malformed ownership never authorizes deletion", () => withDirectory(async root => {
  await fs.writeFile(join(root, "a.txt"), "manual");
  await fs.writeFile(join(root, marker), "{broken");
  await assert.rejects(publishOwnedArtifacts(root, marker, { "a.txt": undefined }), /invalid/);
  assert.equal(await fs.readFile(join(root, "a.txt"), "utf8"), "manual");
}));

test("artifact and ownership symlinks cannot overwrite external files", t => withDirectory(async root => {
  const outside = join(root, "outside.txt");
  await fs.writeFile(outside, "sentinel");
  for (const leaf of ["a.txt", marker]) {
    const directory = join(root, leaf === marker ? "marker-case" : "file-case");
    await fs.mkdir(directory);
    try { await fs.symlink(outside, join(directory, leaf), "file"); }
    catch (error) { if (process.platform === "win32" && error.code === "EPERM") { t.skip("Symlink creation requires Windows privileges"); return; } throw error; }
    await assert.rejects(publishOwnedArtifacts(directory, marker, { "a.txt": "replacement" }));
    assert.equal(await fs.readFile(outside, "utf8"), "sentinel");
  }
}));

test("the next invocation recovers a crashed partial publication and recorded staged files", () => withDirectory(async root => {
  await publishOwnedArtifacts(root, marker, { "a.txt": "old-a", "b.txt": "old-b" });
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const moduleUrl = new URL("../dist/owned-artifacts.js", import.meta.url).href;
  const code = `import fs from 'node:fs/promises'; import {basename} from 'node:path';
    import {publishOwnedArtifacts} from ${JSON.stringify(moduleUrl)};
    const rename=fs.rename; fs.rename=async(from,to)=>{ await rename(from,to); if(basename(to)==='a.txt') process.exit(73); };
    await publishOwnedArtifacts(${JSON.stringify(root)}, ${JSON.stringify(marker)}, {'a.txt':'new-a','b.txt':'new-b'});`;
  await assert.rejects(promisify(execFile)(process.execPath, ["--input-type=module", "-e", code]), error => error.code === 73);
  assert.equal(await fs.readFile(join(root, "a.txt"), "utf8"), "new-a");
  assert.equal(await fs.readFile(join(root, "b.txt"), "utf8"), "old-b");
  await publishOwnedArtifacts(root, marker, { "a.txt": undefined, "b.txt": undefined });
  assert.deepEqual((await fs.readdir(root)).sort(), [marker]);
}));
