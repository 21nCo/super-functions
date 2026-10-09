import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function darwinStartTime(pid: number, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)], { env });
  return stdout.trim() || undefined;
}

export async function processBirthSignature(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") {
      const stat = await import("node:fs/promises").then((fs) => fs.readFile(`/proc/${pid}/stat`, "utf8"));
      const afterCommand = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
      const startTime = afterCommand[19];
      return startTime ? `linux:${startTime}` : undefined;
    }
    if (process.platform === "darwin") {
      // ps renders the start time in the caller's time zone and locale; pin
      // both so every DevFn invocation reads the same process the same way.
      const startTime = await darwinStartTime(pid, { ...process.env, TZ: "UTC0", LC_ALL: "C" });
      return startTime ? `darwin-utc:${startTime}` : undefined;
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
  if (current === recorded) return "running";
  // Signatures read in different formats cannot be compared.
  return signatureFormat(current) === signatureFormat(recorded) ? "identity-mismatch" : "unverified";
}

function signatureFormat(signature: string): string {
  return signature.includes(":") ? signature.slice(0, signature.indexOf(":")) : "";
}

export async function processIdentityStatus(pid: number, signature?: string): Promise<ProcessIdentityStatus> {
  if (!processExists(pid)) return "exited";
  if (signature && process.platform === "darwin" && signatureFormat(signature) === "darwin") {
    // Earlier releases rendered the start time in the recording caller's time
    // zone and locale: an equal reading in this caller's identifies the
    // process, but a different one may be the same process read elsewhere.
    const legacy = await darwinStartTime(pid, process.env).catch(() => undefined);
    return legacy && `darwin:${legacy}` === signature ? "running" : "unverified";
  }
  return classifyProcessIdentity(true, signature, signature ? await processBirthSignature(pid) : undefined);
}

export type ProcessGroupStatus = "running" | "unverified" | "exited" | "identity-mismatch";

/**
 * Whether anything a recorded process group leader ran may still run. On
 * POSIX the leader's PID is its group ID, and a PID is not reused while a
 * group with that ID exists, so:
 * - a reused PID ("identity-mismatch") proves the original group gone;
 * - an exited leader whose group still has members is "unverified": those
 *   members are what it started, unless the group was emptied and a later
 *   process reusing the PID started another, which DevFn cannot tell apart;
 * - only "exited" (leader and group gone) and "identity-mismatch" are death
 *   evidence. Windows has no process groups; only the leader is judged.
 */
export async function processGroupStatus(pid: number, signature?: string): Promise<ProcessGroupStatus> {
  const leader = await processIdentityStatus(pid, signature);
  if (leader !== "exited" || process.platform === "win32") return leader;
  try { process.kill(-pid, 0); return "unverified"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? "exited" : "unverified"; }
}

/** Whether the PID is verifiably the recorded process, as required before signalling it. */
export async function matchesProcessIdentity(pid: number, signature?: string): Promise<boolean> {
  return await processIdentityStatus(pid, signature) === "running";
}
