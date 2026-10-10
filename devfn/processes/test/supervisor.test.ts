import { execFile, spawn } from "node:child_process";
import { closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { processExists, ProcessSupervisor } from "../src/index.js";
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
      expect(processExists(child.pid!)).toBe(true);
    } finally { child.kill("SIGKILL"); }
  });

  it.skipIf(process.platform !== "darwin")("never signals a reused PID whose start renders like a legacy record in the caller's time zone", async () => {
    // An unrelated process now holds the PID an earlier release recorded an
    // hour before this process started, in a caller one hour behind UTC.
    const unrelated = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    const saved = process.env.TZ;
    try {
      await new Promise<void>((resolve) => unrelated.once("spawn", () => resolve()));
      const pid = unrelated.pid!;
      const lstart = async (TZ: string) => (await promisify(execFile)("ps", ["-o", "lstart=", "-p", String(pid)], { env: { ...process.env, TZ, LC_ALL: "C" } })).stdout.trim();
      const born = Date.parse(`${await lstart("UTC0")} UTC`);
      // The earlier release's caller ran an hour behind UTC; this caller
      // renders the unrelated process's start exactly as that record did.
      process.env.TZ = "UTC+1";
      const reused = { name: "app", pid, birthSignature: `darwin:${await lstart("UTC+1")}`, command: ["app"], cwd: "/", logPath: "/dev/null",
        startedAt: new Date(born - 3_600_000 + 5_000).toISOString() };
      const supervisor = new ProcessSupervisor();
      expect(await supervisor.status(reused)).toBe("identity-mismatch");
      await expect(supervisor.stop(reused, 500)).rejects.toMatchObject({ code: "DEVFN_PROCESS_OWNERSHIP_MISMATCH" });
      expect(processExists(pid)).toBe(true);
      // The same record written after this process started is its owner, and stops it.
      const owned = { ...reused, startedAt: new Date(born + 5_000).toISOString() };
      expect(await supervisor.status(owned)).toBe("running");
      await supervisor.stop(owned, 2_000);
      expect(await supervisor.status(owned)).toBe("stopped");
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
      try { process.kill(-unrelated.pid!, "SIGKILL"); } catch { /* already stopped */ }
    }
  });
});
