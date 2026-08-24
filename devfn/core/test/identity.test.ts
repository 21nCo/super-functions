import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { resolveInstanceIdentity } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("instance identity", () => {
  it("does not change when the origin remote changes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-identity-"));
    try {
      await execFileAsync("git", ["init", root]);
      await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://example.test/one.git"]);
      const initial = await resolveInstanceIdentity("app", root);
      await execFileAsync("git", ["-C", root, "remote", "set-url", "origin", "git@example.test:two.git"]);
      const changed = await resolveInstanceIdentity("app", root);
      await execFileAsync("git", ["-C", root, "remote", "remove", "origin"]);
      const removed = await resolveInstanceIdentity("app", root);
      expect(changed).toMatchObject({ instanceId: initial.instanceId, repositoryIdentity: initial.repositoryIdentity });
      expect(removed).toMatchObject({ instanceId: initial.instanceId, repositoryIdentity: initial.repositoryIdentity });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
