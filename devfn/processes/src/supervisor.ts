import { spawn } from "node:child_process";
import { closeSync, constants, fchmodSync, mkdirSync, openSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContainedPath } from "@devfn/config";

import { createProcessEnvironment, resolveAdapterCommand } from "./adapters.js";
import { matchesProcessIdentity, processBirthSignature, processExists } from "./identity.js";
import { waitForReadiness } from "./readiness.js";
import { ProcessError, type ManagedProcess, type StartProcessInput } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function terminateProcess(pid: number, force = false): Promise<void> {
  if (process.platform !== "win32") {
    process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("taskkill", ["/pid", String(pid), "/T", ...(force ? ["/F"] : [])], { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 || !processExists(pid) ? resolve() : reject(new Error(`taskkill exited with ${code}`)));
  });
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && processExists(pid)) await delay(50);
  return !processExists(pid);
}

export async function prepareProcessLog(logPath: string, resetSensitiveHistory: boolean): Promise<{ logFd: number; logOffset: number }> {
  const existing = await lstat(logPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Refusing symlinked process log ${logPath}.`);
  const logOffset = resetSensitiveHistory ? 0 : existing?.size ?? 0;
  const flags = constants.O_WRONLY | constants.O_CREAT | (resetSensitiveHistory ? constants.O_TRUNC : constants.O_APPEND) | (constants.O_NOFOLLOW ?? 0);
  let logFd: number | undefined;
  try {
    logFd = openSync(logPath, flags, 0o600);
    fchmodSync(logFd, 0o600);
    return { logFd, logOffset };
  } catch (error) {
    if (logFd !== undefined) closeSync(logFd);
    if (error instanceof ProcessError) throw error;
    throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Unable to open process log ${logPath} safely.`, { cause: error instanceof Error ? error.message : String(error) });
  }
}

export class ProcessSupervisor {
  public async start(input: StartProcessInput): Promise<ManagedProcess> {
    const command = resolveAdapterCommand(input.spec);
    if (command.length === 0) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Process ${input.name} has no command.`);
    const cwd = await resolveContainedPath(input.root, input.spec.cwd ?? ".", `processes.${input.name}.cwd`).catch((error) => {
      throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Process cwd escapes repository: ${input.spec.cwd ?? "."}`, { cause: error instanceof Error ? error.message : String(error) });
    });
    const logsDir = path.join(input.runtimeDir, "logs");
    await mkdir(logsDir, { recursive: true, mode: 0o700 });
    if (!/^[A-Za-z0-9_.-]+$/.test(input.name) || input.name !== input.name.trim()) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Invalid process name ${input.name}.`);
    const logPath = path.join(logsDir, `${input.name}.log`);
    mkdirSync(path.dirname(logPath), { recursive: true });
    const { logFd, logOffset } = await prepareProcessLog(logPath, Boolean(input.spec.secretEnv?.length));
    const environment = createProcessEnvironment(input.spec, input.environment);
    const wrapperPath = fileURLToPath(new URL("./wrapper.js", import.meta.url));
    const child = spawn(process.execPath, [wrapperPath], {
      cwd,
      env: { ...environment, DEVFN_WRAPPED_COMMAND: JSON.stringify(command), DEVFN_REDACT_KEYS: JSON.stringify(input.spec.secretEnv ?? []) },
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", logFd, logFd],
    });
    let exited = false;
    child.once("exit", () => { exited = true; });
    closeSync(logFd);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 50);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("spawn", () => { clearTimeout(timer); resolve(); });
    }).catch((error) => { throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Unable to start ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) }); });
    if (!child.pid) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Process ${input.name} did not receive a PID.`);
    child.unref();
    let birthSignature: string | undefined;
    for (let attempt = 0; attempt < 10 && !birthSignature; attempt += 1) {
      birthSignature = await processBirthSignature(child.pid);
      if (!birthSignature) await delay(20);
    }
    if (!birthSignature) {
      try { if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill(); } catch { /* process may already have exited */ }
      throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Could not establish a birth identity for ${input.name}; refusing unmanaged supervision.`);
    }
    const managed: ManagedProcess = {
      name: input.name,
      pid: child.pid,
      birthSignature,
      command,
      cwd,
      logPath,
      startedAt: new Date().toISOString(),
      ...(input.spec.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: input.spec.shutdownTimeoutMs }),
    };
    try {
      await input.onStarted?.(managed);
      await waitForReadiness({ health: input.spec.health, ports: input.ports ?? {}, logPath, logOffset, cwd, environment, isAlive: () => !exited && processExists(managed.pid) });
      managed.readyAt = new Date().toISOString();
      return managed;
    } catch (error) {
      await this.stop(managed, input.spec.shutdownTimeoutMs).catch(() => undefined);
      throw error;
    }
  }

  public async stop(managed: ManagedProcess, timeoutMs = managed.shutdownTimeoutMs ?? 10_000): Promise<void> {
    if (!processExists(managed.pid)) return;
    if (!await matchesProcessIdentity(managed.pid, managed.birthSignature)) {
      throw new ProcessError("DEVFN_PROCESS_OWNERSHIP_MISMATCH", `PID ${managed.pid} no longer matches the DevFn process identity.`, { name: managed.name, pid: managed.pid });
    }
    try {
      await terminateProcess(managed.pid);
      if (!await waitForProcessExit(managed.pid, timeoutMs)) {
        await terminateProcess(managed.pid, true);
        if (!await waitForProcessExit(managed.pid, 5_000)) throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Process ${managed.name} did not exit after forced termination.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Unable to stop ${managed.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  public async status(managed: ManagedProcess): Promise<"running" | "stopped" | "identity-mismatch"> {
    if (!processExists(managed.pid)) return "stopped";
    return await matchesProcessIdentity(managed.pid, managed.birthSignature) ? "running" : "identity-mismatch";
  }
}
