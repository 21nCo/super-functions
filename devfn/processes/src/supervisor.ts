import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProcessEnvironment, resolveAdapterCommand } from "./adapters.js";
import { matchesProcessIdentity, processBirthSignature, processExists } from "./identity.js";
import { waitForReadiness } from "./readiness.js";
import { ProcessError, type ManagedProcess, type StartProcessInput } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveCwd(root: string, relative = "."): string {
  const cwd = path.resolve(root, relative);
  const relation = path.relative(root, cwd);
  if (relation.startsWith("..") || path.isAbsolute(relation)) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Process cwd escapes repository: ${relative}`);
  return cwd;
}

export class ProcessSupervisor {
  public async start(input: StartProcessInput): Promise<ManagedProcess> {
    const command = resolveAdapterCommand(input.spec);
    if (command.length === 0) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Process ${input.name} has no command.`);
    const cwd = resolveCwd(input.root, input.spec.cwd);
    const logsDir = path.join(input.runtimeDir, "logs");
    await mkdir(logsDir, { recursive: true, mode: 0o700 });
    const logPath = path.join(logsDir, `${input.name}.log`);
    mkdirSync(path.dirname(logPath), { recursive: true });
    const logFd = openSync(logPath, "a", 0o600);
    const environment = createProcessEnvironment(input.spec, input.environment);
    const wrapperPath = fileURLToPath(new URL("./wrapper.js", import.meta.url));
    const child = spawn(process.execPath, [wrapperPath], {
      cwd,
      env: { ...environment, DEVFN_WRAPPED_COMMAND: JSON.stringify(command), DEVFN_REDACT_KEYS: JSON.stringify(input.spec.secretEnv ?? []) },
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", logFd, logFd],
    });
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
    };
    try {
      await waitForReadiness({ health: input.spec.health, ports: input.ports ?? {}, logPath, cwd, environment, isAlive: () => processExists(managed.pid) });
      managed.readyAt = new Date().toISOString();
      return managed;
    } catch (error) {
      await this.stop(managed, input.spec.shutdownTimeoutMs).catch(() => undefined);
      throw error;
    }
  }

  public async stop(managed: ManagedProcess, timeoutMs = 10_000): Promise<void> {
    if (!processExists(managed.pid)) return;
    if (!await matchesProcessIdentity(managed.pid, managed.birthSignature)) {
      throw new ProcessError("DEVFN_PROCESS_OWNERSHIP_MISMATCH", `PID ${managed.pid} no longer matches the DevFn process identity.`, { name: managed.name, pid: managed.pid });
    }
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(managed.pid), "/T"], { stdio: "ignore", windowsHide: true });
      } else {
        process.kill(-managed.pid, "SIGTERM");
      }
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && processExists(managed.pid)) await delay(50);
      if (processExists(managed.pid)) {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(managed.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        else process.kill(-managed.pid, "SIGKILL");
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
