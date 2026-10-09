import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { processBirthSignature, processIdentityStatus } from "./identity.js";
import { ProcessError, type ProcessOwnerIdentity } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GatedCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
  /** Record the launcher identity; the command runs only after this resolves. */
  onLaunched: (launcher: ProcessOwnerIdentity) => Promise<void>;
}

export type GatedCommandRunner = (file: string, args: string[], options: GatedCommandOptions) => Promise<{ stdout: string; stderr: string }>;

/**
 * Whether anything a gated launcher ran may still run. The launcher leads its
 * own process group on POSIX, and a group ID is not reused while any member
 * lives, so a remaining member is something it started even after the
 * launcher itself died. "gone" is the only conclusive answer.
 */
export async function gatedLauncherStatus(launcher: ProcessOwnerIdentity): Promise<"running" | "unverified" | "gone"> {
  const status = await processIdentityStatus(launcher.pid, launcher.birthSignature);
  if (status === "running" || status === "unverified") return status;
  if (process.platform === "win32") return "gone";
  try { process.kill(-launcher.pid, 0); return "unverified"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? "gone" : "unverified"; }
}

async function signalGroup(pid: number, force: boolean): Promise<void> {
  try {
    if (process.platform !== "win32") process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
    else process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

async function waitUntilGone(launcher: ProcessOwnerIdentity, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await gatedLauncherStatus(launcher) === "gone") return true;
    await delay(50);
  }
  return await gatedLauncherStatus(launcher) === "gone";
}

/**
 * Stop a gated launcher and everything in its process group, signalling only
 * a verified launcher identity. Resolves only once nothing it ran remains.
 */
export async function stopGatedLauncher(launcher: ProcessOwnerIdentity, timeoutMs = 10_000): Promise<void> {
  const status = await gatedLauncherStatus(launcher);
  if (status === "gone") return;
  if (status !== "running") {
    throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Launcher PID ${launcher.pid} or a process it started may still run, but DevFn cannot verify it; it was not signalled.`, { pid: launcher.pid });
  }
  await signalGroup(launcher.pid, false);
  if (await waitUntilGone(launcher, timeoutMs)) return;
  // A POSIX group outlives its verified leader only through members it
  // started; elsewhere only the verified launcher itself is signalled.
  if (process.platform !== "win32" || await processIdentityStatus(launcher.pid, launcher.birthSignature) === "running") await signalGroup(launcher.pid, true);
  if (!await waitUntilGone(launcher, 5_000)) throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Launcher PID ${launcher.pid} did not exit after forced termination.`, { pid: launcher.pid });
}

/**
 * Run a command that may create resources outside DevFn through a launcher
 * whose identity is recorded before the command can start. If the recording
 * fails or DevFn dies first, the launcher's gate closes and the command never
 * runs, so an unrecorded launcher proves the command never ran.
 */
export const runGatedCommand: GatedCommandRunner = async (file, args, options) => {
  const wrapperPath = fileURLToPath(new URL("./wrapper.js", import.meta.url));
  const child = spawn(process.execPath, [wrapperPath], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: { ...(options.env ?? process.env), DEVFN_WRAPPED_COMMAND: JSON.stringify([file, ...args]), DEVFN_REDACT_KEYS: "[]" },
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  let stdout = "";
  let stderr = "";
  let overflow = false;
  child.stdout!.setEncoding("utf8").on("data", (chunk: string) => { if ((stdout += chunk).length > maxBuffer) overflow = true; });
  child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { if ((stderr += chunk).length > maxBuffer) overflow = true; });
  // "close" never follows a disconnected IPC channel, so wait for the exit
  // and the end of the output instead.
  const ended = (stream: NodeJS.ReadableStream) => new Promise<void>((resolve) => { stream.once("close", resolve); stream.once("error", () => resolve()); });
  const output = Promise.all([ended(child.stdout!), ended(child.stderr!)]);
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })))
    .then(async (result) => { await output; return result; });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  }).catch((error) => { throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Unable to launch ${file}.`, { cause: error instanceof Error ? error.message : String(error) }); });
  const pid = child.pid!;
  let birthSignature: string | undefined;
  for (let attempt = 0; attempt < 10 && !birthSignature; attempt += 1) {
    birthSignature = await processBirthSignature(pid);
    if (!birthSignature) await delay(20);
  }
  const launcher = { pid, ...(birthSignature ? { birthSignature } : {}) };
  // This launcher is this process's child: its PID is not reused before it is
  // reaped, and afterwards its group ID is not reused while a member remains,
  // so what is left in that group is its own and may be stopped.
  const stopOwnLauncher = async () => {
    for (const force of [false, true]) {
      if (await gatedLauncherStatus(launcher) === "gone") return;
      if (process.platform !== "win32") await signalGroup(pid, force);
      else if (child.exitCode === null && child.signalCode === null) child.kill(force ? "SIGKILL" : "SIGTERM");
      if (await waitUntilGone(launcher, force ? 5_000 : 10_000)) return;
    }
    throw new ProcessError("DEVFN_PROCESS_STOP_FAILED", `Launcher PID ${pid} for ${file} or a process it started did not exit after forced termination.`, { pid });
  };
  try {
    if (!birthSignature) throw new ProcessError("DEVFN_PROCESS_START_FAILED", `Could not establish a launcher identity for ${file}; refusing to run it unrecorded.`);
    await options.onLaunched(launcher);
  } catch (error) {
    // Closing the channel before the gate opens makes the launcher exit
    // without running the command.
    if (child.connected) child.disconnect();
    await closed;
    throw error;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProcessError("DEVFN_PROCESS_START_FAILED", `Launcher for ${file} did not acknowledge its launch gate.`)), 10_000);
    child.once("disconnect", () => { clearTimeout(timer); resolve(); });
    child.send("start", (error) => {
      if (!error) return;
      clearTimeout(timer);
      reject(new ProcessError("DEVFN_PROCESS_START_FAILED", `Unable to open the launch gate for ${file}.`, { cause: error.message }));
    });
  }).catch(async (error) => {
    await stopOwnLauncher().catch(() => undefined);
    throw error;
  });
  let timer: NodeJS.Timeout | undefined;
  const timedOut = options.timeout ? new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), options.timeout); }) : undefined;
  const outcome = await (timedOut ? Promise.race([closed, timedOut]) : closed);
  clearTimeout(timer);
  if (outcome === "timeout") {
    await stopOwnLauncher();
    throw Object.assign(new Error(`Command ${file} ${args.join(" ")} timed out after ${options.timeout}ms.`), { stdout, stderr, killed: true });
  }
  // The launcher exited; a member it left behind could still act for it.
  await stopOwnLauncher();
  if (overflow) throw Object.assign(new Error(`Command ${file} output exceeded ${maxBuffer} bytes.`), { stdout, stderr });
  if (outcome.code !== 0) {
    throw Object.assign(new Error(`Command failed: ${file} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`), { stdout, stderr, code: outcome.code, signal: outcome.signal });
  }
  return { stdout, stderr };
};
