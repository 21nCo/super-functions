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

export async function resolveInstanceIdentity(projectId: string, root: string): Promise<RoutingIdentity> {
  const manifestPath = await realpath(root);
  const topLevel = await git(root, ["rev-parse", "--show-toplevel"]);
  const worktreePath = topLevel ? await realpath(topLevel) : manifestPath;
  const commonDirectory = await git(root, ["rev-parse", "--git-common-dir"]);
  const repositoryIdentity = commonDirectory ? await realpath(path.resolve(root, commonDirectory)) : manifestPath;
  // Instance IDs predate readable domain aliases and remain tied to the
  // manifest root. Routing names instead describe the Git worktree itself.
  const instanceId = createHash("sha256").update(`${repositoryIdentity}\0${manifestPath}\0${projectId}`).digest("hex").slice(0, 12);
  const worktrees = await git(root, ["worktree", "list", "--porcelain"]);
  const primaryPath = worktrees?.match(/^worktree (.+)$/m)?.[1];
  // A failed or incomplete Git inventory cannot authorize the canonical alias.
  const isPrimaryWorktree = primaryPath !== undefined && await realpath(primaryPath).then((resolved) => resolved === worktreePath).catch(() => false);
  const readable = path.basename(worktreePath).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "worktree";
  const suffix = createHash("sha256").update(worktreePath).digest("hex").slice(0, 6);
  const readableWorktreeLabel = `${readable.slice(0, 56)}-${suffix}`;
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
  if (available < 8) throw new Error("Registered route has no room for a readable worktree label.");
  const readable = identity.readableWorktreeLabel.slice(0, -7).slice(0, available - 7).replace(/-+$/, "") + identity.readableWorktreeLabel.slice(-7);
  const aliases = [`${label}-${readable}.${domain}`];
  if (identity.isPrimaryWorktree) aliases.push(`${label}.${domain}`);
  if (aliases.some((hostname) => hostname.length > 253)) throw new Error("Registered route exceeds the DNS hostname length limit.");
  return aliases;
}
