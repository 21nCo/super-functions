import { spawn } from "node:child_process";
import path from "node:path";

import { processExists, processGroupStatus, processIdentityStatus } from "./identity.js";
import { ProcessError, type ProcessOwnerIdentity } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Only an exited leader with an empty group, or a reused leader PID, proves nothing of a group remains. */
export async function processGroupGone(owner: ProcessOwnerIdentity): Promise<boolean> {
  const status = await processGroupStatus(owner.pid, owner.birthSignature, owner.startedAt);
  return status === "exited" || status === "identity-mismatch";
}

/** Signal a group leader and its group (its process tree on Windows). */
export async function signalProcessGroup(pid: number, force: boolean): Promise<void> {
  if (process.platform !== "win32") {
    try { process.kill(-pid, force ? "SIGKILL" : "SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    return;
  }
  // The system copy, never one found through PATH.
  const systemRoot = process.env.SystemRoot;
  const taskkill = path.win32.join(systemRoot && path.win32.isAbsolute(systemRoot) ? systemRoot : "C:\\Windows", "System32", "taskkill.exe");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(taskkill, ["/pid", String(pid), "/T", ...(force ? ["/F"] : [])], { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 || !processExists(pid) ? resolve() : reject(new Error(`taskkill exited with ${code}`)));
  });
}

export async function waitForProcessGroupExit(owner: ProcessOwnerIdentity, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await processGroupGone(owner)) return true;
    await delay(50);
  }
  return await processGroupGone(owner);
}

/**
 * Stop a recorded group leader and everything in its group, resolving only
 * once nothing of it remains. Only a verified leader is signalled. Once it
 * was, its group ID cannot be reused while a member remains, so members that
 * outlive it are forced too; elsewhere only the verified leader is. A caller
 * that spawned the leader during its own run (ownGroup) knows its unreaped
 * child is that leader, and that the members of a leaderless group are what
 * it started.
 */
export async function stopProcessGroup(owner: ProcessOwnerIdentity, label: string, timeoutMs: number, options: { ownGroup?: { leaderUnreaped: () => boolean } } = {}): Promise<void> {
  const status = await processGroupStatus(owner.pid, owner.birthSignature, owner.startedAt);
  if (status === "exited" || status === "identity-mismatch") return;
  const leaderExited = await processIdentityStatus(owner.pid, owner.birthSignature, owner.startedAt) === "exited";
  if (status === "unverified" && !(options.ownGroup && (leaderExited || options.ownGroup.leaderUnreaped()))) {
    throw new ProcessError("DEVFN_PROCESS_IDENTITY_UNVERIFIED", leaderExited
      ? `${label} (PID ${owner.pid}) exited, but processes remain in its process group ${owner.pid}; DevFn cannot verify they are its own and will not signal them.`
      : `PID ${owner.pid} may still be ${label}, but its identity cannot be verified; DevFn will not signal it.`, { pid: owner.pid });
  }
  try {
    // A graceful request can be refused (Windows console processes accept
    // only a forced taskkill); the wait and forced stop below decide.
    try { await signalProcessGroup(owner.pid, false); }
    catch (error) { if (process.platform !== "win32") throw error; }
    if (await waitForProcessGroupExit(owner, timeoutMs)) return;
    // Judge the group again right before forcing it. POSIX cannot signal a
    // group atomically with that check; a group ID is not reused while any
    // member remains, so only a group that empties in between is exposed.
    const remaining = await processGroupStatus(owner.pid, owner.birthSignature, owner.startedAt);
    if (remaining === "exited" || remaining === "identity-mismatch") return;
    if (process.platform !== "win32" || await processIdentityStatus(owner.pid, owner.birthSignature, owner.startedAt) === "running" || options.ownGroup?.leaderUnreaped()) await signalProcessGroup(owner.pid, true);
  } catch (error) {
    throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Unable to stop ${label} (PID ${owner.pid}).`, { pid: owner.pid, cause: error instanceof Error ? error.message : String(error) });
  }
  if (!await waitForProcessGroupExit(owner, 5_000)) {
    throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `${label} (PID ${owner.pid}) or a process in its group did not exit after forced termination.`, { pid: owner.pid });
  }
}
