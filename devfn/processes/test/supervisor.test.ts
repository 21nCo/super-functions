import { closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prepareProcessLog } from "../src/supervisor.js";

describe("process supervision", () => {
  it("clears historical output before starting a secret-bearing process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-sensitive-log-"));
    try {
      const runtimeDir = path.join(root, ".devfn", "instances", "test");
      const logPath = path.join(runtimeDir, "logs", "app.log");
      await mkdir(path.dirname(logPath), { recursive: true });
      await writeFile(logPath, "historical-secret\n", "utf8");
      const { logFd, logOffset } = await prepareProcessLog(logPath, true);
      closeSync(logFd);
      expect(logOffset).toBe(0);
      expect(await readFile(logPath, "utf8")).not.toContain("historical-secret");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects symlinked logs without truncating their targets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-symlinked-log-"));
    try {
      const target = path.join(root, "target.log");
      const logPath = path.join(root, "app.log");
      await writeFile(target, "preserve-me\n", "utf8");
      await symlink(target, logPath);
      await expect(prepareProcessLog(logPath, true)).rejects.toThrow(/symlinked process log/);
      expect(await readFile(target, "utf8")).toBe("preserve-me\n");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
