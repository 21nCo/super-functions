import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { verifyCertificate } from "@devfn/proxy";

import { domainAliases, resolveInstanceIdentity } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("instance identity", () => {
  it("does not claim a canonical alias without a successful worktree inventory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-no-git-"));
    try {
      const identity = await resolveInstanceIdentity("fixture", root);
      expect(identity.isPrimaryWorktree).toBe(false);
      expect(domainAliases("app", "dev.example.test", identity)).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("gives the primary worktree a canonical alias and distinguishes paths with the old six-hex collision", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "devfn-aliases-"));
    const root = path.join(parent, "primary");
    const canonicalParent = await realpath(parent);
    const seen = new Map<string, string>();
    let pair: [string, string] | undefined;
    for (let index = 0; index < 30_000 && !pair; index += 1) {
      const candidate = path.join(canonicalParent, `collision-${index}`, "feature");
      const oldSuffix = createHash("sha256").update(candidate).digest("hex").slice(0, 6);
      const previous = seen.get(oldSuffix);
      if (previous) pair = [previous, candidate];
      else seen.set(oldSuffix, candidate);
    }
    if (!pair) throw new Error("Could not find a six-hex path collision.");
    const [first, second] = pair;
    try {
      await mkdir(root); await mkdir(path.dirname(first)); await mkdir(path.dirname(second));
      await execFileAsync("git", ["init", root]);
      await writeFile(path.join(root, "fixture.txt"), "fixture");
      await execFileAsync("git", ["-C", root, "add", "fixture.txt"]);
      await execFileAsync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "init"]);
      await execFileAsync("git", ["-C", root, "worktree", "add", "--detach", first]);
      await execFileAsync("git", ["-C", root, "worktree", "add", "--detach", second]);
      const identities = await Promise.all([root, first, second].map((location) => resolveInstanceIdentity("fixture", location)));
      const names = identities.map((identity) => domainAliases("app", "dev.example.test", identity));
      expect(names[0]).toContain("app.dev.example.test");
      expect(names[1]).toHaveLength(1);
      expect(names[2]).toHaveLength(1);
      expect(new Set(names.flat()).size).toBe(4);
      expect(names[1][0]).toMatch(/^app-feature-[a-f0-9]{20}\.dev\.example\.test$/);
      expect(names[1][0]).not.toBe(names[2][0]);
      expect(domainAliases("a".repeat(40), "dev.example.test", identities[1])[0].split(".")[0]).toHaveLength(63);
      expect(() => domainAliases("a".repeat(41), "dev.example.test", identities[1])).toThrow(/no room/);
      const certificateFile = path.join(parent, "aliases.pem");
      const keyFile = path.join(parent, "aliases-key.pem");
      await execFileAsync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=unrelated.test", "-addext", `subjectAltName=${names.flat().map((alias) => `DNS:${alias}`).join(",")}`]);
      await Promise.all(names.flat().map((alias) => expect(verifyCertificate(alias, certificateFile, keyFile)).resolves.toBeUndefined()));
      expect(domainAliases("app", "dev.example.test", identities[1])).toEqual(names[1]);
      const nested = path.join(root, "config", "devfn");
      await mkdir(nested, { recursive: true });
      const nestedIdentity = await resolveInstanceIdentity("fixture", nested);
      expect(nestedIdentity.worktreePath).toBe(await realpath(root));
      expect(nestedIdentity.repositoryRoot).toBe(nested);
      expect(nestedIdentity.repositoryIdentity).toBe(identities[0].repositoryIdentity);
      expect(nestedIdentity.isPrimaryWorktree).toBe(true);
      expect(nestedIdentity.readableWorktreeLabel).toBe(identities[0].readableWorktreeLabel);
      expect(domainAliases("app", "dev.example.test", nestedIdentity)).toContain("app.dev.example.test");
    } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });

  it("does not change when the origin remote changes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-identity-"));
    const otherRoot = await mkdtemp(path.join(tmpdir(), "devfn-identity-other-"));
    try {
      await execFileAsync("git", ["init", root]);
      await execFileAsync("git", ["init", otherRoot]);
      await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://example.test/one.git"]);
      const initial = await resolveInstanceIdentity("app", root);
      await execFileAsync("git", ["-C", root, "remote", "set-url", "origin", "git@example.test:two.git"]);
      const changed = await resolveInstanceIdentity("app", root);
      await execFileAsync("git", ["-C", root, "remote", "remove", "origin"]);
      const removed = await resolveInstanceIdentity("app", root);
      const other = await resolveInstanceIdentity("app", otherRoot);
      expect(changed).toMatchObject({ instanceId: initial.instanceId, repositoryIdentity: initial.repositoryIdentity });
      expect(removed).toMatchObject({ instanceId: initial.instanceId, repositoryIdentity: initial.repositoryIdentity });
      expect(other.repositoryIdentity).not.toBe(initial.repositoryIdentity);
      expect(other.instanceId).not.toBe(initial.instanceId);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(otherRoot, { recursive: true, force: true });
    }
  });
});
