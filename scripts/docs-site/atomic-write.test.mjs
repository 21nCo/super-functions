import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeLlmsArtifacts } from "./llms.mjs";

const oldArtifacts = { llmsTxt: "old outline\n", llmsFullTxt: "old full content\n" };
const newArtifacts = { llmsTxt: "new outline\n", llmsFullTxt: "new full content\n" };
const names = ["llms.txt", "llms-full.txt"];
function fixture() {
  const directory = fs.mkdtempSync(join(tmpdir(), "docsfn-atomic-"));
  for (const name of names) fs.writeFileSync(join(directory, name), oldArtifacts[name === "llms.txt" ? "llmsTxt" : "llmsFullTxt"], { mode: 0o600 });
  return directory;
}
function unchanged(directory) {
  for (const name of names) {
    assert.equal(fs.readFileSync(join(directory, name), "utf8"), oldArtifacts[name === "llms.txt" ? "llmsTxt" : "llmsFullTxt"]);
    if (process.platform !== "win32") assert.equal(fs.statSync(join(directory, name)).mode & 0o777, 0o600);
  }
}
function noTemporary(directory) { assert.deepEqual(fs.readdirSync(directory).sort(), names.slice().sort()); }

// Each test owns its directory. Hooks restore builtin bindings before assertions/cleanup.
for (const operation of ["openSync", "writeFileSync", "fchmodSync", "renameSync"]) {
  test(`controlled ${operation} failure preserves public bytes/mode and cleans only owned temp`, { concurrency: false }, () => {
    const directory = fixture();
    const foreign = join(directory, "llms.txt.other-process.tmp");
    fs.writeFileSync(foreign, "not ours");
    const original = fs[operation];
    const expected = new Error(`controlled ${operation} fault`);
    let intercepted = 0;
    fs[operation] = (...args) => {
      const ownedCall = operation === "writeFileSync" || operation === "fchmodSync" ? typeof args[0] === "number" : String(args[0]).startsWith(join(directory, "llms.txt."));
      if (ownedCall) { intercepted++; throw expected; }
      return original(...args);
    };
    syncBuiltinESMExports();
    try { assert.throws(() => writeLlmsArtifacts(directory, newArtifacts, false), (error) => error === expected); }
    finally { fs[operation] = original; syncBuiltinESMExports(); }
    assert.equal(intercepted, 1);
    unchanged(directory);
    assert.equal(fs.readFileSync(foreign, "utf8"), "not ours");
    assert.deepEqual(fs.readdirSync(directory).sort(), [...names, "llms.txt.other-process.tmp"].sort());
    fs.rmSync(directory, { recursive: true });
  });
}

test("same bodies are non-writing in --check and stale checks preserve bytes/mode", () => {
  const directory = fixture();
  const stats = names.map((name) => fs.statSync(join(directory, name)));
  writeLlmsArtifacts(directory, oldArtifacts, true);
  assert.throws(() => writeLlmsArtifacts(directory, newArtifacts, true), /llms.txt is stale/);
  unchanged(directory); noTemporary(directory);
  names.forEach((name, index) => {
    const after = fs.statSync(join(directory, name));
    assert.equal(after.ino, stats[index].ino);
    assert.equal(after.mtimeMs, stats[index].mtimeMs);
  });
  fs.rmSync(directory, { recursive: true });
});

test("complete replacements preserve both existing POSIX regular-file modes", { skip: process.platform === "win32" ? "Windows does not expose POSIX chmod semantics" : false }, () => {
  const directory = fixture();
  fs.chmodSync(join(directory, "llms-full.txt"), 0o640);
  writeLlmsArtifacts(directory, newArtifacts, false);
  assert.equal(fs.readFileSync(join(directory, "llms.txt"), "utf8"), newArtifacts.llmsTxt);
  assert.equal(fs.readFileSync(join(directory, "llms-full.txt"), "utf8"), newArtifacts.llmsFullTxt);
  assert.equal(fs.statSync(join(directory, "llms.txt")).mode & 0o777, 0o600);
  assert.equal(fs.statSync(join(directory, "llms-full.txt")).mode & 0o777, 0o640);
  noTemporary(directory); fs.rmSync(directory, { recursive: true });
});

test("missing output directory stays absent on check; normal writing creates artifacts", () => {
  const parent = fs.mkdtempSync(join(tmpdir(), "docsfn-atomic-parent-"));
  const directory = join(parent, "public");
  assert.throws(() => writeLlmsArtifacts(directory, newArtifacts, true), /llms.txt is stale/);
  assert.equal(fs.existsSync(directory), false);
  writeLlmsArtifacts(directory, newArtifacts, false);
  writeLlmsArtifacts(directory, newArtifacts, true);
  noTemporary(directory); fs.rmSync(parent, { recursive: true });
});
