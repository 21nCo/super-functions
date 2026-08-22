import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";

import type { HealthCheck } from "@devfn/config";

import { ProcessError } from "./types.js";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tcpReady(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    const done = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export async function waitForReadiness(input: { health?: HealthCheck; ports: Record<string, number>; logPath: string; cwd: string; environment: NodeJS.ProcessEnv; isAlive: () => boolean }): Promise<void> {
  if (!input.health) {
    await delay(100);
    if (!input.isAlive()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process exited before startup completed.");
    return;
  }
  const timeoutMs = input.health.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  let logPattern: RegExp | undefined;
  if (input.health.type === "log") {
    try { logPattern = new RegExp(input.health.pattern, "i"); } catch (error) { throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Invalid readiness pattern ${input.health.pattern}.`, { cause: String(error) }); }
  }
  while (Date.now() < deadline) {
    if (!input.isAlive()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process exited while waiting for readiness.");
    try {
      if (input.health.type === "tcp" && await tcpReady(input.ports[input.health.port])) return;
      if (input.health.type === "http") {
        const port = input.health.port ? input.ports[input.health.port] : undefined;
        const url = input.health.url ?? `http://127.0.0.1:${port}${input.health.path ?? "/"}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (response.status === (input.health.expectedStatus ?? 200)) return;
        lastError = new Error(`HTTP ${response.status}`);
      }
      if (input.health.type === "command") {
        const [file, ...args] = input.health.command;
        const result = await execFileAsync(file, args, { cwd: input.cwd, env: input.environment, timeout: 2000 });
        if (result !== undefined) return;
      }
      if (input.health.type === "log" && logPattern?.test(await readFile(input.logPath, "utf8").catch(() => ""))) return;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new ProcessError("DEVFN_PROCESS_NOT_READY", `Readiness check timed out after ${timeoutMs} ms.`, { cause: lastError instanceof Error ? lastError.message : String(lastError ?? "not ready") });
}
