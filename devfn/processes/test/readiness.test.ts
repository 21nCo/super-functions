import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { waitForReadiness } from "../src/index.js";

describe("process readiness", () => {
  it("keeps command probes inside the overall readiness deadline", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-readiness-"));
    const marker = path.join(root, "attempted");
    const probe = path.join(root, "probe.mjs");
    try {
      await writeFile(probe, 'import { access, writeFile } from "node:fs/promises";\nconst marker = process.env.DEVFN_TEST_MARKER;\ntry { await access(marker); await new Promise((resolve) => setTimeout(resolve, 1000)); } catch { await writeFile(marker, "1"); process.exit(1); }\n');
      const started = Date.now();
      await expect(waitForReadiness({ health: { type: "command", command: [process.execPath, probe], timeoutMs: 220 }, ports: {}, logPath: path.join(root, "unused.log"), cwd: root, environment: { ...process.env, DEVFN_TEST_MARKER: marker }, isAlive: () => true })).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(750);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("preserves UTF-8 readiness markers split across log chunks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-readiness-"));
    const logPath = path.join(root, "process.log");
    try {
      await writeFile(logPath, Buffer.concat([Buffer.alloc(256 * 1024 - 1, 0x61), Buffer.from("✅READY")]));
      await expect(waitForReadiness({ health: { type: "log", pattern: "✅READY", timeoutMs: 1000 }, ports: {}, logPath, cwd: root, environment: process.env, isAlive: () => true })).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("bounds slow liveness callbacks by the readiness deadline", async () => {
    const started = Date.now();
    await expect(waitForReadiness({
      health: { type: "log", pattern: "ready", timeoutMs: 100 }, ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env,
      isAlive: async () => { await new Promise((resolve) => setTimeout(resolve, 5000)); return true; },
    })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(750);
  });

  it("bounds slow log callbacks by the readiness deadline", async () => {
    const started = Date.now();
    await expect(waitForReadiness({
      health: { type: "log", pattern: "ready", timeoutMs: 100 }, ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env,
      isAlive: () => true,
      readLog: async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); return "ready"; },
    })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(750);
  });
});
