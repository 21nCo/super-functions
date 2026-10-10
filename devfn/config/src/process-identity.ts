import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function darwinStartTime(pid: number, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)], { env });
  return stdout.trim() || undefined;
}

// ps renders the start time in the caller's time zone and locale; pin both
// so every DevFn invocation reads the same process the same way.
const PINNED_PS_ENVIRONMENT = { TZ: "UTC0", LC_ALL: "C" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The start second, in epoch milliseconds, of a ps lstart reading taken in the pinned environment. */
function parsePinnedStartTime(text: string): number | undefined {
  const match = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(text);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (!match || month < 0) return undefined;
  const [, , day, hours, minutes, seconds, year] = match.map(Number);
  return Date.UTC(year, month, day, hours, minutes, seconds);
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
      const startTime = await darwinStartTime(pid, { ...process.env, ...PINNED_PS_ENVIRONMENT });
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

/** Allowance for wall-clock adjustment between a process start and its record. */
const RECORD_CLOCK_TOLERANCE_MS = 2_000;

/**
 * Judge a live PID against a legacy darwin: signature. Earlier releases
 * rendered its start time in the recording caller's time zone and locale,
 * so neither an equal nor a different reading proves anything here. The
 * record's own UTC time decides instead: DevFn writes it only after reading
 * the signature of a live owner, so a process that started after it is a
 * different process reusing the PID, and one that started no later was
 * alive under that PID when the record was written and so is its owner.
 * Without a record time, or within the clock tolerance, nothing is proven.
 */
export function classifyLegacyDarwinIdentity(pinnedStartTime: string | undefined, recordedAt: string | undefined): ProcessIdentityStatus {
  const start = pinnedStartTime === undefined ? undefined : parsePinnedStartTime(pinnedStartTime);
  const recorded = typeof recordedAt === "string" ? Date.parse(recordedAt) : Number.NaN;
  if (start === undefined || !Number.isFinite(recorded)) return "unverified";
  if (start > recorded + RECORD_CLOCK_TOLERANCE_MS) return "identity-mismatch";
  return start <= recorded ? "running" : "unverified";
}

/**
 * recordedAt is the UTC time the identity was recorded, after it was read
 * from the live process; it decides only legacy darwin: signatures.
 */
export async function processIdentityStatus(pid: number, signature?: string, recordedAt?: string): Promise<ProcessIdentityStatus> {
  if (!processExists(pid)) return "exited";
  if (signature && process.platform === "darwin" && signatureFormat(signature) === "darwin") {
    const start = await darwinStartTime(pid, { ...process.env, ...PINNED_PS_ENVIRONMENT }).catch(() => undefined);
    return processExists(pid) ? classifyLegacyDarwinIdentity(start, recordedAt) : "exited";
  }
  const current = signature ? await processBirthSignature(pid) : undefined;
  // A signature that cannot be read from a process that exited meanwhile is
  // not an unverified owner.
  if (signature && current === undefined && !processExists(pid)) return "exited";
  return classifyProcessIdentity(true, signature, current);
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
export async function processGroupStatus(pid: number, signature?: string, recordedAt?: string): Promise<ProcessGroupStatus> {
  const leader = await processIdentityStatus(pid, signature, recordedAt);
  if (leader !== "exited" || process.platform === "win32") return leader;
  try { process.kill(-pid, 0); return "unverified"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? "exited" : "unverified"; }
}

/** Whether the PID is verifiably the recorded process, as required before signalling it. */
export async function matchesProcessIdentity(pid: number, signature?: string, recordedAt?: string): Promise<boolean> {
  return await processIdentityStatus(pid, signature, recordedAt) === "running";
}
