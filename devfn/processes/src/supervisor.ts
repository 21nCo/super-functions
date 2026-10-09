import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, constants, fchmodSync, mkdirSync, openSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContainedPath } from "@devfn/config";

import { createProcessEnvironment, resolveAdapterCommand } from "./adapters.js";
import { stopProcessGroup } from "./group.js";
import { processBirthSignature, processExists, processGroupStatus } from "./identity.js";
import { waitForReadiness } from "./readiness.js";
import { ProcessError, type ManagedProcess, type StartProcessInput } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Let the wrapper run its command and wait until it detached from the channel. */
async function openLaunchGate(child: ChildProcess): Promise<void> {
  if (!child.connected) throw new ProcessError("DEVFN_PROCESS_START_FAILED", "Process wrapper exited before its launch gate opened.");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProcessError("DEVFN_PROCESS_START_FAILED", "Process wrapper did not acknowledge its launch gate.")), 10_000);
    child.once("disconnect", () => { clearTimeout(timer); resolve(); });
    child.send("start", (error) => {
      if (!error) return;
      clearTimeout(timer);
      reject(new ProcessError("DEVFN_PROCESS_START_FAILED", "Unable to open the process launch gate.", { cause: error.message }));
    });
  });
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
    const environment = createProcessEnvironment(input.spec, input.environment);
    const { logFd, logOffset } = await prepareProcessLog(logPath, Boolean(input.spec.secretEnv?.length));
    const wrapperPath = fileURLToPath(new URL("./wrapper.js", import.meta.url));
    const child = spawn(process.execPath, [wrapperPath], {
      cwd,
      env: { ...environment, DEVFN_WRAPPED_COMMAND: JSON.stringify(command), DEVFN_REDACT_KEYS: JSON.stringify(input.spec.secretEnv ?? []) },
      detached: process.platform !== "win32",
      windowsHide: true,
      // The IPC channel gates the command until its identity is recorded.
      stdio: ["ignore", logFd, logFd, "ipc"],
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
      if (child.connected) child.disconnect();
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
      try {
        await input.onStarted?.(managed);
        await openLaunchGate(child);
      } finally {
        if (child.connected) child.disconnect();
      }
      await waitForReadiness({ health: input.spec.health, ports: input.ports ?? {}, logPath, logOffset, cwd, environment, isAlive: () => !exited && processExists(managed.pid) });
      managed.readyAt = new Date().toISOString();
      return managed;
    } catch (error) {
      await stopProcessGroup(managed, managed.name, input.spec.shutdownTimeoutMs ?? 10_000, { ownGroup: { leaderUnreaped: () => !exited } }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Stop a process and everything its wrapper's group still runs. A reused
   * PID is reported as a mismatch; an unreadable identity, or a wrapper that
   * exited while its group lives on, is never signalled and never reported
   * gone.
   */
  public async stop(managed: ManagedProcess, timeoutMs = managed.shutdownTimeoutMs ?? 10_000): Promise<void> {
    if (await processGroupStatus(managed.pid, managed.birthSignature) === "identity-mismatch") {
      throw new ProcessError("DEVFN_PROCESS_OWNERSHIP_MISMATCH", `PID ${managed.pid} no longer matches the DevFn process identity.`, { name: managed.name, pid: managed.pid });
    }
    await stopProcessGroup(managed, managed.name, timeoutMs);
  }

  /**
   * "stopped" and "identity-mismatch" prove nothing the process ran remains;
   * "unverified" is a live PID whose identity cannot be read, or a wrapper
   * that exited while processes remain in its group, either of which may
   * still be it and must never be treated as stopped.
   */
  public async status(managed: ManagedProcess): Promise<"running" | "stopped" | "identity-mismatch" | "unverified"> {
    const status = await processGroupStatus(managed.pid, managed.birthSignature);
    return status === "exited" ? "stopped" : status;
  }
}
