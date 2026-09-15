#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Root lock is the workspace install source of truth (.gitignore:
// `**/package-lock.json` + `!/package-lock.json`). Nested leftovers still
// on `dev` until #180 (botfn) and #183 (searchfn client) land.
export const ALLOWED_PACKAGE_LOCKFILES = [
  "package-lock.json",
  "botfn/bot-discord/package-lock.json",
  "searchfn/client/package-lock.json",
];

const GIT_BINARIES = ["/usr/bin/git", "/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

export function gitBinary() {
  const binary = GIT_BINARIES.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error("git not found in fixed directories");
  }
  return binary;
}

export function trackedPackageLockfiles(cwd = process.cwd()) {
  return execFileSync(gitBinary(), ["ls-files", "-z", "--", "package-lock.json", "**/package-lock.json"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter(Boolean)
    .sort();
}

export function disallowedPackageLockfiles(tracked, allowed = ALLOWED_PACKAGE_LOCKFILES) {
  const allow = new Set(allowed);
  return tracked.filter((file) => !allow.has(file));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tracked = trackedPackageLockfiles();
  if (!tracked.includes("package-lock.json")) {
    fail("error: root package-lock.json must stay tracked");
  }
  const extra = disallowedPackageLockfiles(tracked);
  if (extra.length > 0) {
    fail(
      `error: nested package-lock.json must not be tracked (root lock is source of truth):\n${extra
        .map((file) => `  ${file}`)
        .join("\n")}`
    );
  }
}
