import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";

import type { HealthCheck } from "@devfn/config";

import { ProcessError } from "./types.js";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type ReadinessInput = { health?: HealthCheck; ports: Record<string, number>; logPath: string; logOffset?: number; cwd: string; environment: NodeJS.ProcessEnv; isAlive: () => boolean | Promise<boolean>; readLog?: () => Promise<string> };
const LOG_CHUNK_BYTES = 256 * 1024;
const LOG_WINDOW_BYTES = 1024 * 1024;

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

async function readNewLog(logPath: string, offset: number): Promise<{ text: string; nextOffset: number }> {
  const handle = await open(logPath, "r").catch(() => undefined);
  if (!handle) return { text: "", nextOffset: offset };
  try {
    const size = (await handle.stat()).size;
    if (size <= offset) return { text: "", nextOffset: Math.min(size, offset) };
    const length = Math.min(size - offset, LOG_CHUNK_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return { text: buffer.subarray(0, bytesRead).toString("utf8"), nextOffset: offset + bytesRead };
  } finally { await handle.close(); }
}

async function httpReady(health: Extract<HealthCheck, { type: "http" }>, input: ReadinessInput, timeoutMs: number): Promise<boolean> {
  const port = health.port ? input.ports[health.port] : undefined;
  const url = health.url ?? `http://127.0.0.1:${port}${health.path ?? "/"}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return (await fetch(url, { signal: controller.signal })).status === (health.expectedStatus ?? 200); }
  finally { clearTimeout(timer); }
}

async function checkReadiness(health: Exclude<HealthCheck, { type: "log" }>, input: ReadinessInput, remainingMs: number): Promise<boolean> {
  switch (health.type) {
    case "tcp": return await tcpReady(input.ports[health.port], Math.max(1, Math.min(health.timeoutMs ?? 500, remainingMs)));
    case "http": return await httpReady(health, input, Math.max(1, Math.min(health.timeoutMs ?? 1000, remainingMs)));
    case "command": {
      const [file, ...args] = health.command;
      await execFileAsync(file, args, { cwd: input.cwd, env: input.environment, timeout: Math.max(1, Math.min(health.timeoutMs ?? 2000, remainingMs)) });
      return true;
    }
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
  let logOffset = input.logOffset ?? 0;
  let logWindow = "";
  if (input.health.type === "log") {
    try { logPattern = new RegExp(input.health.pattern, "i"); } catch (error) { throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Invalid readiness pattern ${input.health.pattern}.`, { cause: String(error) }); }
  }
  if ((input.health.type === "tcp" || input.health.type === "http") && input.health.port && input.ports[input.health.port] === undefined) {
    throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Readiness check references unallocated port ${input.health.port}.`);
  }
  while (Date.now() < deadline) {
    if (!await input.isAlive()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process exited while waiting for readiness.");
    try {
      if (input.health.type === "log") {
        if (input.readLog) logWindow = (await input.readLog()).slice(-LOG_WINDOW_BYTES);
        else {
          const chunk = await readNewLog(input.logPath, logOffset);
          logOffset = chunk.nextOffset;
          logWindow = `${logWindow}${chunk.text}`.slice(-LOG_WINDOW_BYTES);
        }
        if (logPattern?.test(logWindow)) return;
      } else if (await checkReadiness(input.health, input, Math.max(1, deadline - Date.now()))) return;
    } catch (error) { lastError = error; }
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Readiness check timed out after ${timeoutMs} ms.`, { cause: lastError instanceof Error ? lastError.message : String(lastError ?? "not ready") });
}
