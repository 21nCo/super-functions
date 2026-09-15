import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PACKAGE_LOCKFILES,
  disallowedPackageLockfiles,
  trackedPackageLockfiles,
} from "./verify-package-lockfiles.mjs";

const script = fileURLToPath(new URL("./verify-package-lockfiles.mjs", import.meta.url));

function run(cwd) {
  return execFileSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "package-lockfiles-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Lockfile Test",
    GIT_AUTHOR_EMAIL: "lockfile@example.invalid",
    GIT_COMMITTER_NAME: "Lockfile Test",
    GIT_COMMITTER_EMAIL: "lockfile@example.invalid",
  };
  const git = (...args) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet", "--initial-branch=dev");
  writeFileSync(path.join(root, "package-lock.json"), "{}\n");
  git("add", "package-lock.json");
  git("commit", "--quiet", "-m", "root lock");
  return { root, git };
}

test("allowlist is root lock plus documented leftovers from #180/#183", () => {
  assert.deepEqual(ALLOWED_PACKAGE_LOCKFILES, [
    "package-lock.json",
    "botfn/bot-discord/package-lock.json",
    "searchfn/client/package-lock.json",
  ]);
});

test("packages/db nested lock is never allowed", () => {
  assert.deepEqual(
    disallowedPackageLockfiles([
      "package-lock.json",
      "packages/db/package-lock.json",
      "botfn/bot-discord/package-lock.json",
      "searchfn/client/package-lock.json",
    ]),
    ["packages/db/package-lock.json"]
  );
});

test("script passes for root lock plus documented leftovers", () => {
  const { root, git } = gitRepo();
  try {
    mkdirSync(path.join(root, "botfn/bot-discord"), { recursive: true });
    mkdirSync(path.join(root, "searchfn/client"), { recursive: true });
    writeFileSync(path.join(root, "botfn/bot-discord/package-lock.json"), "{}\n");
    writeFileSync(path.join(root, "searchfn/client/package-lock.json"), "{}\n");
    git("add", "botfn/bot-discord/package-lock.json", "searchfn/client/package-lock.json");
    git("commit", "--quiet", "-m", "allowlisted leftovers");
    run(root);
    assert.deepEqual(trackedPackageLockfiles(root), [
      "botfn/bot-discord/package-lock.json",
      "package-lock.json",
      "searchfn/client/package-lock.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("script fails if a nested lock such as packages/db is re-added", () => {
  const { root, git } = gitRepo();
  try {
    mkdirSync(path.join(root, "packages/db"), { recursive: true });
    writeFileSync(path.join(root, "packages/db/package-lock.json"), "{}\n");
    git("add", "-f", "packages/db/package-lock.json");
    git("commit", "--quiet", "-m", "nested db lock");
    assert.throws(() => run(root), (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /packages\/db\/package-lock\.json/);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
