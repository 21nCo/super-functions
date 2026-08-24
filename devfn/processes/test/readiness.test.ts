import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkReadinessNow, waitForReadiness } from "../src/index.js";

describe("process readiness", () => {
  it("applies a configured path to URL-based HTTP probes", async () => {
    const server = (await import("node:http")).createServer((request, response) => {
      response.writeHead(request.url === "/base/health?ready=1" ? 200 : 404);
      response.end();
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP test server did not receive a port.");
    try {
      await expect(waitForReadiness({ health: { type: "http", url: `http://127.0.0.1:${address.port}/base?base=1#old`, path: "/health?ready=1#current", timeoutMs: 1000 }, ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => true })).resolves.toBeUndefined();
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("reports current HTTP readiness without entering the retry loop", async () => {
    const server = (await import("node:net")).createServer();
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TCP test server did not receive a port.");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(checkReadinessNow({ health: { type: "http", url: `http://127.0.0.1:${address.port}`, timeoutMs: 50 }, ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => true })).resolves.toBe(false);
  });

  it("rejects an absolute health path that changes the configured origin", async () => {
    const server = (await import("node:http")).createServer((_request, response) => { response.writeHead(200); response.end(); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP test server did not receive a port.");
    try {
      await expect(checkReadinessNow({
        health: { type: "http", url: "http://127.0.0.1:1/base", path: `http://127.0.0.1:${address.port}/wrong-origin`, timeoutMs: 100 },
        ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => true,
      })).resolves.toBe(false);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("honors configured current-probe timeouts longer than two seconds", async () => {
    const started = Date.now();
    await expect(checkReadinessNow({
      health: { type: "command", command: [process.execPath, "-e", "setTimeout(() => {}, 2100)"], timeoutMs: 2600 },
      ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => true,
    })).resolves.toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
  }, 5000);

  it("rechecks liveness after a successful current probe", async () => {
    let checks = 0;
    await expect(checkReadinessNow({
      health: { type: "command", command: [process.execPath, "-e", "process.exit(0)"], timeoutMs: 1000 },
      ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => ++checks === 1,
    })).resolves.toBe(false);
    expect(checks).toBe(2);
  });

  it("treats a previously observed log marker as a startup event", async () => {
    await expect(checkReadinessNow({
      health: { type: "log", pattern: "ready", timeoutMs: 100 }, previouslyReady: true,
      ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env, isAlive: () => true,
      readLog: async () => "new output without the historical marker",
    })).resolves.toBe(true);
  });

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
      isAlive: async () => { await new Promise((resolve) => { const timer = setTimeout(resolve, 5000); timer.unref(); }); return true; },
    })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(750);
  });

  it("bounds slow log callbacks by the readiness deadline", async () => {
    const started = Date.now();
    await expect(waitForReadiness({
      health: { type: "log", pattern: "ready", timeoutMs: 100 }, ports: {}, logPath: "unused.log", cwd: process.cwd(), environment: process.env,
      isAlive: () => true,
      readLog: async () => { await new Promise((resolve) => { const timer = setTimeout(resolve, 1000); timer.unref(); }); return "ready"; },
    })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(750);
  });
});
