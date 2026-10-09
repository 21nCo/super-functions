import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { stopProcessGroup } from "./group.js";
import { processBirthSignature, processGroupStatus } from "./identity.js";
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
 * Whether anything a gated launcher ran may still run, by the process group
 * rule: the launcher leads its own group on POSIX, so a member left after it
 * died is something it started, while a reused launcher PID proves its group
 * gone. "gone" is the only conclusive answer.
 */
export async function gatedLauncherStatus(launcher: ProcessOwnerIdentity): Promise<"running" | "unverified" | "gone"> {
  const status = await processGroupStatus(launcher.pid, launcher.birthSignature);
  return status === "exited" || status === "identity-mismatch" ? "gone" : status;
}

/**
 * Stop a gated launcher and everything in its process group, signalling only
 * a verified launcher identity. Resolves only once nothing it ran remains.
 */
export async function stopGatedLauncher(launcher: ProcessOwnerIdentity, timeoutMs = 10_000): Promise<void> {
  await stopProcessGroup(launcher, "The launcher", timeoutMs);
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
  // Output is kept only up to the limit; passing it stops the launcher.
  let overflowed!: () => void;
  const overflow = new Promise<"overflow">((resolve) => { overflowed = () => resolve("overflow"); });
  let exceeded = false;
  const capture = (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      if (size + chunk.length > maxBuffer) {
        chunks.push(chunk.subarray(0, maxBuffer - size));
        size = maxBuffer;
        exceeded = true;
        overflowed();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    return () => Buffer.concat(chunks).toString("utf8");
  };
  const stdout = capture(child.stdout!);
  const stderr = capture(child.stderr!);
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
  const stopOwnLauncher = async () => await stopProcessGroup(launcher, `The launcher for ${file}`, 10_000, { ownGroup: { leaderUnreaped: () => child.exitCode === null && child.signalCode === null } });
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
  const outcome = await Promise.race([closed, overflow, ...(timedOut ? [timedOut] : [])]);
  clearTimeout(timer);
  // An exited launcher may have left a member that could still act for it.
  await stopOwnLauncher();
  if (outcome === "timeout") {
    throw Object.assign(new Error(`Command ${file} ${args.join(" ")} timed out after ${options.timeout}ms.`), { stdout: stdout(), stderr: stderr(), killed: true });
  }
  if (exceeded || outcome === "overflow") throw Object.assign(new Error(`Command ${file} output exceeded ${maxBuffer} bytes.`), { stdout: stdout(), stderr: stderr(), killed: true });
  if (outcome.code !== 0) {
    throw Object.assign(new Error(`Command failed: ${file} ${args.join(" ")}${stderr() ? `\n${stderr()}` : ""}`), { stdout: stdout(), stderr: stderr(), code: outcome.code, signal: outcome.signal });
  }
  return { stdout: stdout(), stderr: stderr() };
};
