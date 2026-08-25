import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { InstanceIdentity } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string | undefined> {
  try { return (await execFileAsync("git", ["-C", root, ...args], { timeout: 5000 })).stdout.trim() || undefined; } catch { return undefined; }
}

export async function resolveInstanceIdentity(projectId: string, root: string): Promise<InstanceIdentity> {
  const worktreePath = await realpath(root);
  const commonDirectory = await git(root, ["rev-parse", "--git-common-dir"]);
  const repositoryIdentity = commonDirectory ? await realpath(path.resolve(root, commonDirectory)) : worktreePath;
  const instanceId = createHash("sha256").update(`${repositoryIdentity}\0${worktreePath}\0${projectId}`).digest("hex").slice(0, 12);
  return {
    projectId,
    repositoryRoot: root,
    repositoryIdentity,
    worktreePath,
    instanceId,
    ...(await git(root, ["rev-parse", "HEAD"]) ? { revision: await git(root, ["rev-parse", "HEAD"]) } : {}),
    ...(await git(root, ["branch", "--show-current"]) ? { branch: await git(root, ["branch", "--show-current"]) } : {}),
  };
}
