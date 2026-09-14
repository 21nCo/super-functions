import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { isolatedGitEnvironment } from "@superfunctions/reviewfn-core";
import { GitSourceControlAdapter } from "../src/index.js";

it("captures a diff larger than the old 50 MiB subprocess buffer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "reviewfn-large-diff-"));
  const git = (args: string[]) => promisify(execFile)("git", args, { cwd: root, env: isolatedGitEnvironment(), maxBuffer: 60 * 1024 * 1024, encoding: "buffer" });
  try {
    await git(["init", "--template=", "-b", "main"]);
    await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "base"]);
    const base = (await git(["rev-parse", "HEAD"])).stdout.toString().trim();
    await writeFile(path.join(root, "large.txt"), Buffer.alloc(51 * 1024 * 1024, 120));
    await git(["add", "large.txt"]);
    await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "large diff"]);
    const diff = (await git(["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", base, "HEAD"])).stdout;
    expect(diff.length).toBeGreaterThan(50 * 1024 * 1024);
    const result = await new GitSourceControlAdapter().capture(root, base, "HEAD");
    expect(result.diffDigest).toBe(createHash("sha256").update(diff).digest("hex"));
    expect(result.changedPaths).toEqual(["large.txt"]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
