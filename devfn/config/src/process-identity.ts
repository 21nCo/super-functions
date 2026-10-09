import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function processBirthSignature(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") {
      const stat = await import("node:fs/promises").then((fs) => fs.readFile(`/proc/${pid}/stat`, "utf8"));
      const afterCommand = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
      const startTime = afterCommand[19];
      return startTime ? `linux:${startTime}` : undefined;
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]);
      const startTime = stdout.trim();
      return startTime ? `darwin:${startTime}` : undefined;
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('O')`]);
      const startTime = stdout.trim();
      return startTime ? `win32:${startTime}` : undefined;
    }
  } catch { return undefined; }
  return undefined;
}

export function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export type ProcessIdentityStatus = "running" | "exited" | "identity-mismatch" | "unverified";

/**
 * Only an absent PID or a readable birth signature that differs proves a
 * recorded process is gone. A live PID whose recorded or current signature
 * is unknown may still be that process.
 */
export function classifyProcessIdentity(exists: boolean, recorded?: string, current?: string): ProcessIdentityStatus {
  if (!exists) return "exited";
  if (!recorded || !current) return "unverified";
  return current === recorded ? "running" : "identity-mismatch";
}

export async function processIdentityStatus(pid: number, signature?: string): Promise<ProcessIdentityStatus> {
  if (!processExists(pid)) return "exited";
  return classifyProcessIdentity(true, signature, signature ? await processBirthSignature(pid) : undefined);
}

/** Whether the PID is verifiably the recorded process, as required before signalling it. */
export async function matchesProcessIdentity(pid: number, signature?: string): Promise<boolean> {
  return await processIdentityStatus(pid, signature) === "running";
}
