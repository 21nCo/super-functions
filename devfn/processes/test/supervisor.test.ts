import { spawn } from "node:child_process";
import { closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ProcessSupervisor } from "../src/index.js";
import { prepareProcessLog } from "../src/supervisor.js";

describe("process supervision", () => {
  it("rejects colliding environments before opening a process log", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-prelog-"));
    const runtimeDir = path.join(root, "runtime");
    const logPath = path.join(runtimeDir, "logs", "app.log");
    try {
      await expect(new ProcessSupervisor().start({ name: "app", root, runtimeDir, ports: {}, environment: {},
        spec: { adapter: "command", command: [process.execPath, "-e", "0"], env: { MODE: "a" }, envAllowlist: ["mode"] } })).rejects.toThrow(/collides/);
      await expect(readFile(logPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
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

describe("process identity", () => {
  it("refuses to signal a live process whose identity cannot be verified", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    try {
      const managed = { name: "app", pid: child.pid!, command: [], cwd: tmpdir(), logPath: "", startedAt: new Date().toISOString() };
      await expect(new ProcessSupervisor().stop(managed)).rejects.toMatchObject({ code: "DEVFN_PROCESS_IDENTITY_UNVERIFIED" });
      expect(await new ProcessSupervisor().status(managed)).toBe("unverified");
      expect(child.exitCode).toBeNull();
    } finally { child.kill("SIGKILL"); }
  });
});
