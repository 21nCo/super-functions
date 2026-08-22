import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function processBirthSignature(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") {
      const stat = await import("node:fs/promises").then((fs) => fs.readFile(`/proc/${pid}/stat`, "utf8"));
      return `linux:${stat.trim().split(/\s+/)[21]}`;
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]);
      return `darwin:${stdout.trim()}`;
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('O')`]);
      return `win32:${stdout.trim()}`;
    }
  } catch { return undefined; }
  return undefined;
}

export function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function matchesProcessIdentity(pid: number, signature?: string): Promise<boolean> {
  if (!processExists(pid)) return false;
  if (!signature) return false;
  return await processBirthSignature(pid) === signature;
}
