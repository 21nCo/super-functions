import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PACKAGE_LOCKFILES,
  disallowedPackageLockfiles,
  gitBinary,
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
    execFileSync(gitBinary(), ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
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

test("gitBinary is an absolute existing path", () => {
  const binary = gitBinary();
  assert.equal(path.isAbsolute(binary), true);
  assert.equal(existsSync(binary), true);
});

test("allowlist is root, ApiFn workflow lock, and documented leftovers", () => {
  assert.deepEqual(ALLOWED_PACKAGE_LOCKFILES, [
    "package-lock.json",
    ".github/apifn-cli-install/package-lock.json",
    "botfn/bot-discord/package-lock.json",
    "searchfn/client/package-lock.json",
  ]);
});

test("packages/db nested lock is never allowed", () => {
  assert.deepEqual(
    disallowedPackageLockfiles([
      "package-lock.json",
      ".github/apifn-cli-install/package-lock.json",
      "packages/db/package-lock.json",
      "botfn/bot-discord/package-lock.json",
      "searchfn/client/package-lock.json",
    ]),
    ["packages/db/package-lock.json"]
  );
});

test("script passes for root, ApiFn workflow, and documented leftovers", () => {
  const { root, git } = gitRepo();
  try {
    mkdirSync(path.join(root, ".github/apifn-cli-install"), { recursive: true });
    mkdirSync(path.join(root, "botfn/bot-discord"), { recursive: true });
    mkdirSync(path.join(root, "searchfn/client"), { recursive: true });
    writeFileSync(path.join(root, ".github/apifn-cli-install/package-lock.json"), "{}\n");
    writeFileSync(path.join(root, "botfn/bot-discord/package-lock.json"), "{}\n");
    writeFileSync(path.join(root, "searchfn/client/package-lock.json"), "{}\n");
    git("add", ".github/apifn-cli-install/package-lock.json", "botfn/bot-discord/package-lock.json", "searchfn/client/package-lock.json");
    git("commit", "--quiet", "-m", "allowlisted locks");
    run(root);
    assert.deepEqual(trackedPackageLockfiles(root), [
      ".github/apifn-cli-install/package-lock.json",
      "botfn/bot-discord/package-lock.json",
      "package-lock.json",
      "searchfn/client/package-lock.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("script fails if the root package-lock.json is not tracked", () => {
  const { root, git } = gitRepo();
  try {
    git("rm", "--quiet", "package-lock.json");
    git("commit", "--quiet", "-m", "drop root lock");
    assert.throws(() => run(root), (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /root package-lock\.json must stay tracked/);
      return true;
    });
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
