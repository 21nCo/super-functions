import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";

import type { HealthCheck } from "@devfn/config";

import { ProcessError } from "./types.js";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type ReadinessInput = { health?: HealthCheck; ports: Record<string, number>; logPath: string; logOffset?: number; cwd: string; environment: NodeJS.ProcessEnv; isAlive: () => boolean | Promise<boolean>; readLog?: () => Promise<string> };

async function tcpReady(port: number, timeoutMs = 500): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(timeoutMs);
    const done = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function readNewLog(logPath: string, offset: number): Promise<string> {
  const handle = await open(logPath, "r").catch(() => undefined);
  if (!handle) return "";
  try {
    const size = (await handle.stat()).size;
    if (size <= offset) return "";
    const length = size - offset;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally { await handle.close(); }
}

async function httpReady(health: Extract<HealthCheck, { type: "http" }>, input: ReadinessInput): Promise<boolean> {
  const port = health.port ? input.ports[health.port] : undefined;
  const url = health.url ?? `http://127.0.0.1:${port}${health.path ?? "/"}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), health.timeoutMs ?? 1000);
  try { return (await fetch(url, { signal: controller.signal })).status === (health.expectedStatus ?? 200); }
  finally { clearTimeout(timer); }
}

async function checkReadiness(health: HealthCheck, input: ReadinessInput, logPattern?: RegExp): Promise<boolean> {
  switch (health.type) {
    case "tcp": return await tcpReady(input.ports[health.port], health.timeoutMs ?? 500);
    case "http": return await httpReady(health, input);
    case "command": {
      const [file, ...args] = health.command;
      await execFileAsync(file, args, { cwd: input.cwd, env: input.environment, timeout: health.timeoutMs ?? 2000 });
      return true;
    }
    case "log": return Boolean(logPattern?.test(input.readLog ? await input.readLog() : await readNewLog(input.logPath, input.logOffset ?? 0)));
  }
}

export async function waitForReadiness(input: ReadinessInput): Promise<void> {
  if (!input.health) {
    await delay(500);
    if (!await input.isAlive()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process exited before startup completed.");
    return;
  }
  const timeoutMs = input.health.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  let logPattern: RegExp | undefined;
  if (input.health.type === "log") {
    try { logPattern = new RegExp(input.health.pattern, "i"); } catch (error) { throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Invalid readiness pattern ${input.health.pattern}.`, { cause: String(error) }); }
  }
  if ((input.health.type === "tcp" || input.health.type === "http") && input.health.port && input.ports[input.health.port] === undefined) {
    throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Readiness check references unallocated port ${input.health.port}.`);
  }
  while (Date.now() < deadline) {
    if (!await input.isAlive()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process exited while waiting for readiness.");
    try {
      if (await checkReadiness(input.health, input, logPattern)) return;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Readiness check timed out after ${timeoutMs} ms.`, { cause: lastError instanceof Error ? lastError.message : String(lastError ?? "not ready") });
}
