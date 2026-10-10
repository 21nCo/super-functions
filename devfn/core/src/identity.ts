import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { RoutingIdentity } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string | undefined> {
  try { return (await execFileAsync("git", ["-C", root, ...args], { timeout: 5000 })).stdout.trim() || undefined; } catch { return undefined; }
}

/** Remove leading and trailing hyphens without a backtracking pattern. */
function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") start += 1;
  while (end > start && value[end - 1] === "-") end -= 1;
  return value.slice(start, end);
}

export async function resolveInstanceIdentity(projectId: string, root: string): Promise<RoutingIdentity> {
  const manifestPath = await realpath(root);
  const topLevel = await git(root, ["rev-parse", "--show-toplevel"]);
  const worktreePath = topLevel ? await realpath(topLevel) : manifestPath;
  const commonDirectory = await git(root, ["rev-parse", "--git-common-dir"]);
  const repositoryIdentity = commonDirectory ? await realpath(path.resolve(root, commonDirectory)) : manifestPath;
  // Instance IDs predate readable domain aliases and remain tied to the
  // manifest root. Routing names instead describe the Git worktree itself.
  const instanceId = createHash("sha256").update(`${repositoryIdentity}\0${manifestPath}\0${projectId}`).digest("hex").slice(0, 12);
  // NUL-delimited records (Git 2.36+) keep a path that contains a newline
  // intact. Older Git lists lines; a path cut at a newline then fails the
  // comparison below, so it only withholds the alias.
  // Outside a Git worktree there is no inventory to read.
  let firstField: string | undefined;
  if (topLevel) {
    const worktrees = await git(root, ["worktree", "list", "--porcelain", "-z"]);
    firstField = worktrees === undefined
      ? (await git(root, ["worktree", "list", "--porcelain"]))?.split("\n", 1)[0]
      : worktrees.split("\0", 1)[0];
  }
  const primaryPath = firstField?.startsWith("worktree ") ? firstField.slice("worktree ".length) : undefined;
  // A failed or incomplete Git inventory cannot authorize the canonical alias.
  const isPrimaryWorktree = primaryPath !== undefined && await realpath(primaryPath).then((resolved) => resolved === worktreePath).catch(() => false);
  const readable = trimHyphens(path.basename(worktreePath).toLowerCase().replace(/[^a-z0-9-]+/g, "-")) || "worktree";
  // Keep enough of the path digest to make same-named worktrees practically
  // collision resistant, including paths that share the old six-hex prefix.
  const suffix = createHash("sha256").update(worktreePath).digest("hex").slice(0, 20);
  const readableWorktreeLabel = `${readable.slice(0, 42)}-${suffix}`;
  return {
    projectId,
    repositoryRoot: root,
    repositoryIdentity,
    worktreePath,
    instanceId,
    isPrimaryWorktree,
    readableWorktreeLabel,
    ...(await git(root, ["rev-parse", "HEAD"]) ? { revision: await git(root, ["rev-parse", "HEAD"]) } : {}),
    ...(await git(root, ["branch", "--show-current"]) ? { branch: await git(root, ["branch", "--show-current"]) } : {}),
  };
}

export function domainAliases(label: string, domain: string, identity: RoutingIdentity): string[] {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) throw new Error("Registered route needs a DNS-safe host label.");
  const available = 63 - label.length - 1;
  if (available < 22) throw new Error("Registered route has no room for a readable worktree label.");
  const readable = trimHyphens(identity.readableWorktreeLabel.slice(0, -21).slice(0, available - 21)) + identity.readableWorktreeLabel.slice(-21);
  const aliases = [`${label}-${readable}.${domain}`];
  if (identity.isPrimaryWorktree) aliases.push(`${label}.${domain}`);
  if (aliases.some((hostname) => hostname.length > 253)) throw new Error("Registered route exceeds the DNS hostname length limit.");
  return aliases;
}
