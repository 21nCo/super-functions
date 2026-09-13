import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compareCodePoints, sha256, type ChangeSnapshot, type CodeAnchor, type SourceControlAdapter } from "@superfunctions/reviewfn-core";

const execFileAsync = promisify(execFile);
export type GitRunner = (args: string[], cwd: string) => Promise<string>;
const defaultRunner: GitRunner = async (args, cwd) => {
  const [command, ...parameters] = args;
  const options = { cwd, maxBuffer: 50 * 1024 * 1024 };
  // Keep each permitted subcommand literal at the process boundary. Repository input cannot select git transport commands.
  switch (command) {
    case "rev-parse": return (await execFileAsync("git", ["rev-parse", ...parameters], options)).stdout;
    case "config": return (await execFileAsync("git", ["config", ...parameters], options)).stdout;
    case "status": return (await execFileAsync("git", ["status", ...parameters], options)).stdout;
    case "merge-base": return (await execFileAsync("git", ["merge-base", ...parameters], options)).stdout;
    case "diff": return (await execFileAsync("git", ["diff", ...parameters], options)).stdout;
    case "show": return (await execFileAsync("git", ["show", ...parameters], options)).stdout;
    default: throw new Error("Unsupported read-only Git operation.");
  }
};

export interface GitSourceOptions {
  runner?: GitRunner;
  currentPullRequestHead?: (pullRequest: number) => Promise<string>;
  host?: string;
  targetBranch?: string;
}

export class GitSourceControlAdapter implements SourceControlAdapter {
  public readonly id = "git";
  private readonly runner: GitRunner;
  public constructor(private readonly options: GitSourceOptions = {}) { this.runner = options.runner ?? defaultRunner; }

  public async capture(root: string, base: string, head: string, pullRequest?: number): Promise<ChangeSnapshot> {
    const [baseCommit, headCommit, rawRepositoryId, checkoutHead] = await Promise.all([
      this.runner(["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`], root),
      this.runner(["rev-parse", "--verify", "--end-of-options", `${head}^{commit}`], root),
      this.runner(["config", "--get", "remote.origin.url"], root).catch(error => { if (error?.code === 1) return "local"; throw error; }),
      this.runner(["rev-parse", "HEAD"], root),
    ]).then(values => values.map(value => value.trim()));
    const repositoryId = redactRepositoryRemote(rawRepositoryId);
    if ((await this.runner(["status", "--porcelain", "--untracked-files=all"], root)).trim()) throw new Error("Review requires a clean immutable checkout, including untracked files.");
    if (checkoutHead !== headCommit) throw new Error(`Review workspace is at ${checkoutHead}, but requested head is ${headCommit}. Check out the exact head in an isolated workspace.`);
    const mergeBaseCommit = (await this.runner(["merge-base", baseCommit, headCommit], root)).trim();
    const [diff, names, targetBranch] = await Promise.all([
      this.runner(["diff", "--binary", "--full-index", mergeBaseCommit, headCommit], root),
      this.runner(["diff", "--name-only", "-z", mergeBaseCommit, headCommit], root),
      this.runner(["rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", base], root),
    ]);
    return {
      repositoryId,
      host: this.options.host ?? hostFromRemote(repositoryId),
      pullRequest,
      targetBranch: this.options.targetBranch ?? (targetBranch.trim().startsWith("refs/") ? targetBranch.trim().replace(/^refs\/(heads|remotes)\//, "") : "unknown"),
      baseCommit,
      headCommit,
      mergeBaseCommit,
      diffDigest: sha256(diff),
      changedPaths: names.split("\0").filter(Boolean).sort(compareCodePoints),
      capturedAt: new Date().toISOString(),
    };
  }

  public async currentHead(root: string, pullRequest?: number): Promise<string> {
    if (pullRequest !== undefined && this.options.currentPullRequestHead) return this.options.currentPullRequestHead(pullRequest);
    return (await this.runner(["rev-parse", "HEAD"], root)).trim();
  }

  public async verifyAnchor(root: string, anchor: CodeAnchor): Promise<boolean> {
    if (!/^[a-f0-9]{40,64}$/.test(anchor.commit)) return false;
    if (!anchor.startLine && !anchor.symbol) return false;
    if (!anchor.path || anchor.path.startsWith("/") || anchor.path.split(/[\\/]/).includes("..")) return false;
    const content = await this.runner(["show", `${anchor.commit}:${anchor.path}`], root).catch(() => undefined);
    if (content === undefined) return false;
    if (anchor.symbol && !content.includes(anchor.symbol)) return false;
    const lines = content.split(/\r?\n/);
    if (anchor.startLine !== undefined && (anchor.startLine < 1 || anchor.startLine > lines.length)) return false;
    if (anchor.endLine !== undefined && (anchor.endLine < (anchor.startLine ?? 1) || anchor.endLine > lines.length)) return false;
    return true;
  }
}

function hostFromRemote(remote: string): string {
  if (/^[A-Za-z]:/.test(remote)) return "local";
  try { const url = new URL(remote); if (["http:", "https:", "ssh:"].includes(url.protocol)) return url.hostname; } catch { /* SCP and local paths are not URLs. */ }
  return !remote.includes("://") ? remote.match(/^(?:[^@/]+@)?([^/@:]+):/)?.[1] ?? "local" : "local";
}

export function redactRepositoryRemote(remote: string): string {
  if (/^[A-Za-z]:/.test(remote)) return remote;
  try { const url = new URL(remote); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.toString(); } catch { return remote.replace(/^[^@/]+@(?=[^/:]+:)/, ""); }
}

/** Normalize a recorded Git remote for comparison with a trusted GitHub repository. */
export function githubRepositoryIdentity(remote: string): string | undefined {
  const scp = /^(?:[^@/]+@)?github\.com:([^?#]+)$/i.exec(remote);
  let repository = scp?.[1];
  if (!repository) {
    try { const url = new URL(remote); if (url.hostname.toLowerCase() !== "github.com" || !["https:", "ssh:"].includes(url.protocol) || url.port && !(url.protocol === "ssh:" && url.port === "22") || url.search || url.hash) return undefined; repository = url.pathname.slice(1); } catch { return undefined; }
  }
  repository = repository.replace(/\/$/, "").replace(/\.git$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ? repository.toLowerCase() : undefined;
}
