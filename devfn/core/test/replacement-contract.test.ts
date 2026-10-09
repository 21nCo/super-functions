import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { validateDevFnConfig } from "@devfn/config";
import { FilePortRegistry } from "@devfn/ports";
import { ProcessSupervisor } from "@devfn/processes";
import { DevFnOrchestrator, readReceipt, writeReceipt } from "../src/index.js";

const server = (body: string) =>
  `import { createServer } from 'node:http'; createServer((_request, response) => response.end(${body})).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n`;

const fixture = (extra: Record<string, unknown> = {}) => validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
  processes: { app: { adapter: "command", command: [process.execPath, "app.mjs"], ports: ["app"],
    health: { type: "http", port: "app", timeoutMs: 10_000 }, ...extra } }, profiles: { default: { processes: ["app"] } } });

async function liveLeases(stateDir: string) {
  const state = await new FilePortRegistry(path.join(stateDir, "registry.json")).read();
  return {
    allocations: state.allocations.filter((item) => ["planned", "active", "externally-occupied"].includes(item.state)),
    invocations: state.invocations.filter((item) => ["planning", "starting", "ready", "stopping"].includes(item.state)),
  };
}

async function filesContaining(directory: string, needle: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesContaining(target, needle));
    else if (entry.isFile() && (await readFile(target, "utf8").catch(() => "")).includes(needle)) found.push(target);
  }
  return found;
}

it("reports a source-edited restart failure truthfully and leaves no live lease behind", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-source-edit-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = fixture();
  try {
    await writeFile(path.join(root, "app.mjs"), server("'old'"));
    const first = await orchestrator.up({ config, root, stateDir });
    // The restart reads the edited working tree; the prior source no longer exists.
    await writeFile(path.join(root, "app.mjs"), "process.exit(3);\n");
    const failure = await orchestrator.up({ config, root, stateDir, replace: true }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "DEVFN_START_FAILED", details: { priorInvocationId: first.invocationId, priorStopped: true } });
    expect((failure as Error).message).toContain("was stopped");
    const receipt = await readReceipt(config, root, first.instanceId);
    expect(receipt?.invocationId).not.toBe(first.invocationId);
    expect(receipt?.state).toBe("failed");
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "failed", urls: {} });
    expect(await liveLeases(stateDir)).toEqual({ allocations: [], invocations: [] });
    await expect(fetch(`http://127.0.0.1:${first.allocations[0].port}/`)).rejects.toThrow();
    await writeFile(path.join(root, "app.mjs"), server("'new'"));
    const fixed = await orchestrator.up({ config, root, stateDir });
    expect(fixed.allocations[0].port).toBe(first.allocations[0].port);
    expect(await fetch(`http://127.0.0.1:${fixed.allocations[0].port}/`).then((response) => response.text())).toBe("new");
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);

it("never writes secretEnv values to runtime or machine state across start and replacement", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-secret-at-rest-"));
  const stateDir = path.join(root, "state");
  const sentinel = `sentinel-${Date.now()}-value`;
  const before = process.env.FIXTURE_SECRET_TOKEN;
  const orchestrator = new DevFnOrchestrator();
  const config = fixture({ envAllowlist: ["FIXTURE_SECRET_TOKEN"], secretEnv: ["FIXTURE_SECRET_TOKEN"] });
  try {
    await writeFile(path.join(root, "app.mjs"), server("process.env.FIXTURE_SECRET_TOKEN === undefined ? 'missing' : 'present'"));
    process.env.FIXTURE_SECRET_TOKEN = sentinel;
    const first = await orchestrator.up({ config, root, stateDir });
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("present");
    expect(await filesContaining(root, sentinel)).toEqual([]);
    await orchestrator.up({ config, root, stateDir, replace: true });
    expect(await filesContaining(root, sentinel)).toEqual([]);
  } finally {
    if (before === undefined) delete process.env.FIXTURE_SECRET_TOKEN; else process.env.FIXTURE_SECRET_TOKEN = before;
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);

it("restarts and replaces a legacy v0.1 ready receipt without private recovery state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-legacy-replace-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = fixture();
  try {
    await writeFile(path.join(root, "app.mjs"), server("process.argv[2] ?? 'legacy'"));
    const first = await orchestrator.up({ config, root, stateDir });
    // A v0.1 receipt has no fingerprints and the runtime directory has no
    // private recovery artifacts.
    const legacy = { ...first } as Partial<typeof first>;
    delete legacy.startupFingerprints;
    delete legacy.portSpecFingerprints;
    await writeReceipt(legacy as typeof first);
    await rm(path.join(first.runtimeDir, "recovery.json"), { force: true });
    const restarted = await orchestrator.up({ config, root, stateDir, replace: true });
    expect(restarted.invocationId).not.toBe(first.invocationId);
    expect(await fetch(`http://127.0.0.1:${restarted.allocations[0].port}/`).then((response) => response.text())).toBe("legacy");
    const legacyAgain = { ...restarted } as Partial<typeof restarted>;
    delete legacyAgain.startupFingerprints;
    delete legacyAgain.portSpecFingerprints;
    await writeReceipt(legacyAgain as typeof restarted);
    await rm(path.join(restarted.runtimeDir, "recovery.json"), { force: true });
    const changed = validateDevFnConfig({ ...config, processes: { app: { ...config.processes!.app, command: [process.execPath, "app.mjs", "changed"] } } });
    // Without a startup digest, v0.1 readiness ignores the changed command.
    await expect(orchestrator.up({ config: changed, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
    const replaced = await orchestrator.up({ config: changed, root, stateDir, replace: true });
    expect(await fetch(`http://127.0.0.1:${replaced.allocations[0].port}/`).then((response) => response.text())).toBe("changed");
    expect((await liveLeases(stateDir)).invocations.map((item) => item.id)).toEqual([replaced.invocationId]);
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);

it("completes an interrupted down before a same-worktree restart or up", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-interrupted-down-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = fixture();
  const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
  try {
    await writeFile(path.join(root, "app.mjs"), server("'ready'"));
    // Down marked the invocation stopping, then was interrupted before it
    // stopped anything.
    const first = await orchestrator.up({ config, root, stateDir });
    await registry.updateInvocation(first.invocationId, { state: "stopping" });
    const restarted = await orchestrator.up({ config, root, stateDir, replace: true });
    expect(restarted.invocationId).not.toBe(first.invocationId);
    expect((await liveLeases(stateDir)).invocations.map((item) => item.id)).toEqual([restarted.invocationId]);
    // Interrupted after stopping the process: a plain up completes the stop.
    await registry.updateInvocation(restarted.invocationId, { state: "stopping" });
    await new ProcessSupervisor().stop(restarted.processes[0]);
    const again = await orchestrator.up({ config, root, stateDir });
    expect((await liveLeases(stateDir)).invocations.map((item) => item.id)).toEqual([again.invocationId]);
    expect(await fetch(`http://127.0.0.1:${again.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);

it("recovers a replacement interrupted after lease activation but before its ready receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-activation-window-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = fixture();
  const registryFile = path.join(stateDir, "registry.json");
  const markActive = FilePortRegistry.prototype.markActive;
  try {
    await writeFile(path.join(root, "app.mjs"), server("'ready'"));
    const first = await orchestrator.up({ config, root, stateDir });
    const receiptFiles = [path.join(root, ".devfn", "receipts", `${first.instanceId}.json`), path.join(first.runtimeDir, "receipt.json")];
    // Capture persisted state at the instant activation commits, as an
    // interrupted CLI would leave it; the replacement process later exits.
    let crashed: { registry: string; receipts: string[] } | undefined;
    FilePortRegistry.prototype.markActive = async function (invocationId, owners) {
      await markActive.call(this, invocationId, owners);
      crashed = { registry: await readFile(registryFile, "utf8"), receipts: await Promise.all(receiptFiles.map(async (file) => await readFile(file, "utf8"))) };
      throw Object.assign(new Error("interrupted"), { code: "FIXTURE_INTERRUPTED" });
    };
    await orchestrator.up({ config, root, stateDir, replace: true }).catch(() => undefined);
    FilePortRegistry.prototype.markActive = markActive;
    expect(crashed).toBeDefined();
    await writeFile(registryFile, crashed!.registry);
    await Promise.all(receiptFiles.map(async (file, index) => await writeFile(file, crashed!.receipts[index])));
    expect(JSON.parse(crashed!.receipts[0]).state).toBe("starting");
    const recovered = await orchestrator.up({ config, root, stateDir });
    expect(recovered.allocations[0].port).toBe(first.allocations[0].port);
    expect((await liveLeases(stateDir)).invocations.map((item) => item.id)).toEqual([recovered.invocationId]);
    expect((await liveLeases(stateDir)).allocations.map((item) => item.invocationId)).toEqual([recovered.invocationId]);
    expect((await orchestrator.down({ config, root, stateDir })).state).toBe("stopped");
    expect(await liveLeases(stateDir)).toEqual({ allocations: [], invocations: [] });
  } finally {
    FilePortRegistry.prototype.markActive = markActive;
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);
