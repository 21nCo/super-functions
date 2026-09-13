import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256, redactText, type ArtifactStore, type ExecutionAdapter, type PreflightResult, type ReviewPolicy, type TestReceipt } from "@superfunctions/reviewfn-core";

// This image is resolved to a digest before executing any repository command.
export const TEST_IMAGE = "node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5";
interface ProcessResult { exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean; canceled: boolean; runtimeMs: number; outputLimited: boolean }

/** Docker is mandatory. No fallback to same-user host execution is permitted. */
export class LocalIsolatedExecutionAdapter implements ExecutionAdapter {
  public readonly id = "local-isolated";
  public constructor(private readonly artifacts?: ArtifactStore) {}
  public async preflight(root: string): Promise<PreflightResult> {
    const diagnostics: PreflightResult["diagnostics"] = [];
    if (Number(process.versions.node.split(".")[0]) < 22) diagnostics.push({ code: "REVIEWFN_NODE_VERSION", level: "error", message: "Node 22 or newer is required." });
    for (const [command, args] of [["git", ["rev-parse", "--is-inside-work-tree"]], ["docker", ["info", "--format", "{{.ServerVersion}}"]], ["docker", ["image", "inspect", TEST_IMAGE, "--format", "{{.Id}}"]]] as const) {
      const result = await runProcess(command, [...args], root, 10_000, 64_000).catch(() => undefined);
      if (result?.exitCode !== 0) diagnostics.push({ code: "REVIEWFN_ISOLATION_UNAVAILABLE", level: "error", message: `Required ${command} capability unavailable: ${args.join(" ")}. Install Docker and pull ${TEST_IMAGE} before review.` });
    }
    return { ok: !diagnostics.some(item => item.level === "error"), diagnostics };
  }
  public async run(root: string, headCommit: string, commands: string[][], policy: ReviewPolicy, signal?: AbortSignal): Promise<TestReceipt[]> {
    if (!commands.length || signal?.aborted) return [];
    if (!/^[a-f0-9]{40,64}$/i.test(headCommit)) throw new Error("Execution requires an immutable commit hash.");
    const owned = await mkdtemp(path.join(tmpdir(), "reviewfn-execution-"));
    const archive = path.join(owned, "source.tar");
    const receipts: TestReceipt[] = [];
    try {
      const inventory = await runProcess("git", ["ls-tree", "-r", "-l", headCommit], root, 30_000, 5_000_000, signal);
      const totalSize = inventory.stdout.split("\n").reduce((sum, line) => sum + Number(line.match(/^\d+ blob [a-f0-9]+\s+(\d+)\t/)?.[1] ?? 0), 0);
      if (inventory.exitCode !== 0 || inventory.outputLimited || totalSize > 256 * 1024 * 1024) throw new Error("Repository archive exceeds the 256 MiB input budget.");
      const archived = await runProcess("git", ["archive", "--format=tar", `--output=${archive}`, headCommit], root, 60_000, 64_000, signal);
      if (archived.exitCode !== 0 || archived.canceled) throw new Error("Unable to archive reviewed commit.");
      const image = await runProcess("docker", ["image", "inspect", TEST_IMAGE, "--format", "{{.Id}}"], root, 10_000, 64_000, signal);
      if (image.exitCode !== 0 || !/^sha256:[a-f0-9]{64}$/.test(image.stdout.trim())) throw new Error("Required isolated test image is unavailable.");
      const deadline = Date.now() + policy.limits.testTimeoutMs;
      for (const [index, command] of commands.entries()) {
        if (signal?.aborted) break;
        if (!command.length || command.some(part => !part || part.includes("\0"))) throw new Error(`Invalid command ${index}.`);
        const name = `reviewfn-${randomUUID()}`;
        const startedAt = new Date();
        let result: ProcessResult;
        try {
          result = await runProcess("docker", ["run", "--name", name, "--rm", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--user=65534:65534", "--tmpfs=/workspace:rw,nosuid,nodev,size=268435456,mode=1777", "--tmpfs=/tmp:rw,nosuid,nodev,size=67108864,mode=1777", "--mount", `type=bind,source=${archive},target=/input/source.tar,readonly`, "--workdir=/workspace", image.stdout.trim(), "sh", "-c", 'tar --no-same-owner -xf /input/source.tar -C /workspace && exec "$@"', "reviewfn-test", ...command], root, Math.max(1, deadline - Date.now()), policy.limits.maxOutputBytes, signal);
        } finally {
          // Container teardown kills all descendants even after their parent exits or detaches.
          await runProcess("docker", ["rm", "--force", name], root, 10_000, 64_000).catch(() => undefined);
        }
        const stdoutArtifact = await this.artifacts?.put("test-stdout", redactText(result.stdout, []), policy.retention.testLogDays);
        const stderrArtifact = await this.artifacts?.put("test-stderr", redactText(result.stderr, []), policy.retention.testLogDays);
        receipts.push({ stdoutArtifact: stdoutArtifact?.id, stderrArtifact: stderrArtifact?.id, id: `test-${index}-${sha256(JSON.stringify(command)).slice(0, 12)}`, command, cwd: ".", commit: headCommit, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), runtimeMs: result.runtimeMs, exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, canceled: result.canceled, stdoutDigest: sha256(result.stdout), stderrDigest: sha256(result.stderr), limitations: [`Docker image ${image.stdout.trim()}; network disabled; 1 CPU, 512 MiB memory, 128 PIDs, 256 MiB workspace, 64 MiB temporary disk.`, ...(result.outputLimited ? ["Command exceeded output budget."] : []), ...(result.timedOut ? ["Test batch deadline exhausted."] : [])] });
        if (result.timedOut || result.canceled || result.outputLimited) break;
      }
      return receipts;
    } finally { await rm(owned, { recursive: true, force: true }); }
  }
}

async function runProcess(command: string, args: string[], cwd: string, timeoutMs: number, maxOutputBytes: number, signal?: AbortSignal): Promise<ProcessResult> {
  if (signal?.aborted) return { exitCode: null, signal: null, stdout: "", stderr: "", timedOut: false, canceled: true, runtimeMs: 0, outputLimited: false };
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const env = Object.fromEntries(["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "TMPDIR"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
    const child = spawn(command, args, { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0;
    let timedOut = false, canceled = false, outputLimited = false;
    const kill = () => { try { process.platform === "win32" ? child.kill("SIGKILL") : process.kill(-child.pid!, "SIGKILL"); } catch { /* process group already gone */ } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const abort = () => { canceled = true; kill(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { outputLimited = true; kill(); return; }
      if (target === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); kill(); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("exit", kill);
    child.once("close", (exitCode, exitSignal) => { cleanup(); resolve({ exitCode: outputLimited ? null : exitCode, signal: exitSignal, stdout, stderr, timedOut, canceled, outputLimited, runtimeMs: Date.now() - started }); });
  });
}
