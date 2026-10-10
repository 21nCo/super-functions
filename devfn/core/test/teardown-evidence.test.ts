import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";

vi.mock("@devfn/proxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devfn/proxy")>();
  return {
    ...actual,
    CaddyProxyController: class extends actual.CaddyProxyController {
      // The command stub stands in for a Caddy that holds its listeners.
      constructor(stateDir: string) { super(stateDir, undefined, undefined, async () => true, async () => true); }
      // Physical owner and listener preflight is covered by the proxy suites.
      override async assertActivationReady(): Promise<void> {}
    },
  };
});

import { validateDevFnConfig } from "@devfn/config";
import { FilePortRegistry } from "@devfn/ports";
import { gatedLauncherStatus, processBirthSignature, processExists, ProcessError, ProcessSupervisor } from "@devfn/processes";
import { DevFnOrchestrator, readReceipt, recoverOrphanedProxyRoutes, resolveInstanceIdentity } from "../src/index.js";
import { writeReceipt } from "../src/runtime.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await delay(50);
  }
  return await predicate();
}

async function routedInstances(stateDir: string): Promise<string[]> {
  const committed = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8").catch(() => '{"routes":[]}')) as { routes: Array<{ instanceId: string }> };
  return [...new Set(committed.routes.map((route) => route.instanceId))];
}

const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
  processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "http", port: "app", timeoutMs: 20_000 } } },
  profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });

/** A routed process lifecycle with a stub Caddy owned by this test process. */
async function withLifecycle(prefix: string, action: (fixture: { root: string; stateDir: string; toolsDir: string; registry: FilePortRegistry; instanceId: string }) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  try {
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(root, "server.mjs"),
      "import { writeFileSync } from 'node:fs'; import { createServer } from 'node:http'; writeFileSync('app.pid', String(process.pid)); createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    const { instanceId } = await resolveInstanceIdentity(config.project.id, root);
    await action({ root, stateDir, toolsDir, registry: new FilePortRegistry(path.join(stateDir, "registry.json")), instanceId });
  } finally {
    // Restore real tools first so teardown can verify and stop what remains.
    for (const tool of ["ps", "docker"]) await rm(path.join(toolsDir, tool), { force: true });
    await new DevFnOrchestrator().down({ config, root, stateDir }).catch(() => undefined);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** Start a gated launch from a CLI process that dies once the launch runs, as an interrupted devfn up would. */
async function launchFromDyingCli(root: string): Promise<{ pid: number; birthSignature?: string }> {
  const launcherFile = path.join(root, "launcher.json");
  // The launched command keeps a child standing in for the Compose plugin.
  const command = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); setTimeout(() => {}, 60000);";
  await writeFile(path.join(root, "launch-cli.mjs"), `import { runGatedCommand } from ${JSON.stringify(new URL("../../processes/dist/index.js", import.meta.url).href)};
import { writeFileSync } from "node:fs";
await runGatedCommand(process.execPath, ["-e", ${JSON.stringify(command)}], { onLaunched: async (launcher) => {
  writeFileSync(${JSON.stringify(launcherFile)}, JSON.stringify(launcher));
  setTimeout(() => process.exit(9), 300);
} });
`);
  const exit = await new Promise<number | null>((resolve) => spawn(process.execPath, [path.join(root, "launch-cli.mjs")], { stdio: "ignore" }).once("exit", resolve));
  if (exit !== 9) throw new Error(`The launching CLI exited with ${exit}.`);
  return JSON.parse(await readFile(launcherFile, "utf8")) as { pid: number; birthSignature?: string };
}

it("runs a process command only after its identity is recorded, so an interrupted launch never starts it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-launch-gate-"));
  let wrapperPid: number | undefined;
  try {
    const marker = path.join(root, "command-ran");
    // The CLI dies while it records the identity of a node it just spawned.
    const cli = `import { ProcessSupervisor } from ${JSON.stringify(new URL("../../processes/dist/index.js", import.meta.url).href)};
import { writeFileSync } from "node:fs";
await new ProcessSupervisor().start({ name: "app", root: ${JSON.stringify(root)}, runtimeDir: ${JSON.stringify(path.join(root, "runtime"))}, ports: {},
  spec: { adapter: "command", command: [process.execPath, "-e", ${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran"); setInterval(() => undefined, 1000)`)}] },
  onStarted: async (managed) => { writeFileSync(${JSON.stringify(path.join(root, "pid"))}, String(managed.pid)); await new Promise((resolve) => setTimeout(resolve, 500)); process.exit(9); } });
`;
    await writeFile(path.join(root, "cli.mjs"), cli);
    const exit = await new Promise<number | null>((resolve) => spawn(process.execPath, [path.join(root, "cli.mjs")], { stdio: "ignore" }).once("exit", resolve));
    expect(exit).toBe(9);
    wrapperPid = Number(await readFile(path.join(root, "pid"), "utf8"));
    expect(await waitFor(() => !processExists(wrapperPid!))).toBe(true);
    await delay(300);
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    if (wrapperPid && processExists(wrapperPid)) { try { process.kill(-wrapperPid, "SIGKILL"); } catch { /* already gone */ } }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 60_000);

it.skipIf(process.platform !== "darwin")("keeps an owner whose identity cannot be read, with its receipt, leases, journal and routes, through down, up, replace and gc", async () => {
  await withLifecycle("devfn-teardown-unverified-", async ({ root, stateDir, toolsDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const pid = ready.processes[0].pid;
    // macOS reads birth signatures through ps; this one cannot read the owner's.
    await writeFile(path.join(toolsDir, "ps"), `#!/bin/sh\ncase " $* " in *" ${pid} "*) exit 1;; esac\nexec /bin/ps "$@"\n`, { mode: 0o700 });

    const down = await orchestrator.down({ config, root, stateDir });
    expect(down.state).toBe("degraded");
    expect(down.cleanup?.errors.join("\n")).toMatch(/identity cannot be verified/);
    expect(down.cleanup).toMatchObject({ removedProxy: false, releasedPorts: false });
    expect(processExists(pid)).toBe(true);
    expect(await routedInstances(stateDir)).toEqual([instanceId]);

    for (const replace of [false, true]) {
      await expect(orchestrator.up({ config, root, stateDir, replace })).rejects.toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorStopped: false } });
    }
    expect(await readReceipt(config, root, instanceId)).toMatchObject({ invocationId: ready.invocationId, state: "degraded" });
    // Long after down stopped refreshing, a sibling's `devfn ports` and
    // `ports gc` keep the evidence and the routes.
    const aged = await registry.read();
    for (const item of [...aged.invocations, ...aged.allocations]) item.updatedAt = "2020-01-01T00:00:00.000Z";
    await writeFile(registry.filePath, JSON.stringify(aged));
    await registry.reconcile();
    await registry.gc();
    const state = await registry.read();
    expect(state.invocations.filter((item) => item.instanceId === instanceId).map((item) => [item.id, item.state])).toEqual([[ready.invocationId, "stopping"]]);
    expect(state.allocations.filter((item) => item.invocationId === ready.invocationId).map((item) => item.state)).toEqual(["active"]);
    expect(await registry.instanceMayRun(instanceId)).toBe(true);
    expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
    expect(await routedInstances(stateDir)).toEqual([instanceId]);

    // Once the identity is readable again, down stops it by that identity.
    await rm(path.join(toolsDir, "ps"));
    const stopped = await orchestrator.down({ config, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [], stoppedProcesses: ["app"] } });
    expect(await waitFor(() => !processExists(pid))).toBe(true);
    expect(await routedInstances(stateDir)).toEqual([]);
  });
}, 120_000);

it.skipIf(process.platform === "win32")("keeps a native owner whose wrapper died while its application still runs in the process group, through down, replace, gc and orphan recovery", async () => {
  await withLifecycle("devfn-teardown-surviving-child-", async ({ root, stateDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const wrapper = ready.processes[0];
    const application = Number(await readFile(path.join(root, "app.pid"), "utf8"));
    expect(application).not.toBe(wrapper.pid);
    try {
      // Only the recorded wrapper dies; the server it ran keeps serving.
      process.kill(wrapper.pid, "SIGKILL");
      expect(await waitFor(async () => await new ProcessSupervisor().status(wrapper) !== "running")).toBe(true);
      expect(processExists(application)).toBe(true);
      expect(await new ProcessSupervisor().status(wrapper)).toBe("unverified");

      const down = await orchestrator.down({ config, root, stateDir });
      expect(down.state).toBe("degraded");
      expect(down.cleanup).toMatchObject({ removedProxy: false, releasedPorts: false, stoppedProcesses: [] });
      expect(down.cleanup?.errors.join("\n")).toMatch(/process group/);
      for (const replace of [false, true]) {
        await expect(orchestrator.up({ config, root, stateDir, replace })).rejects.toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorStopped: false } });
      }
      const aged = await registry.read();
      for (const item of [...aged.invocations, ...aged.allocations]) item.updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(aged));
      await registry.reconcile();
      await registry.gc();
      const state = await registry.read();
      expect(state.invocations.find((item) => item.id === ready.invocationId)).toMatchObject({ state: "stopping" });
      expect(state.allocations.filter((item) => item.invocationId === ready.invocationId).map((item) => item.state)).toEqual(["active"]);
      expect(await registry.instanceMayRun(instanceId)).toBe(true);
      expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
      expect(await routedInstances(stateDir)).toEqual([instanceId]);
      expect(processExists(application)).toBe(true);
    } finally {
      try { process.kill(-wrapper.pid, "SIGKILL"); } catch { /* already gone */ }
    }

    // Once nothing in the group remains, teardown completes.
    expect(await waitFor(() => !processExists(application))).toBe(true);
    const stopped = await orchestrator.down({ config, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [] } });
    expect(await routedInstances(stateDir)).toEqual([]);
  });
}, 120_000);

it.skipIf(process.platform === "win32")("stops a native owner only once every process in its group is gone, forcing those that ignore termination", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-stop-group-"));
  const supervisor = new ProcessSupervisor();
  let managed: Awaited<ReturnType<ProcessSupervisor["start"]>> | undefined;
  try {
    const pidFile = path.join(root, "child.pid");
    managed = await supervisor.start({ name: "app", root, runtimeDir: path.join(root, "runtime"), ports: {},
      spec: { adapter: "command", command: [process.execPath, "-e", `process.on("SIGTERM", () => undefined); require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => undefined, 1000);`] } });
    expect(await waitFor(async () => Boolean(await readFile(pidFile, "utf8").catch(() => "")))).toBe(true);
    const application = Number(await readFile(pidFile, "utf8"));
    await supervisor.stop(managed, 500);
    expect(processExists(application)).toBe(false);
    expect(await supervisor.status(managed)).toBe("stopped");
  } finally {
    if (managed) { try { process.kill(-managed.pid, "SIGKILL"); } catch { /* already gone */ } }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 60_000);

it.skipIf(process.platform !== "darwin")("keeps and then stops an owner recorded under another time zone and locale", async () => {
  await withLifecycle("devfn-teardown-time-zone-", async ({ root, stateDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const saved = { TZ: process.env.TZ, LC_ALL: process.env.LC_ALL };
    Object.assign(process.env, { TZ: "Pacific/Kiritimati", LC_ALL: "fr_FR.UTF-8" });
    let ready: Awaited<ReturnType<DevFnOrchestrator["up"]>>;
    try { ready = await orchestrator.up({ config, root, stateDir }); }
    finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const pid = ready.processes[0].pid;
    // A sibling running with another time zone and locale.
    Object.assign(process.env, { TZ: "UTC", LC_ALL: "C" });
    try {
      const aged = await registry.read();
      for (const item of [...aged.invocations, ...aged.allocations]) item.updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(aged));
      await registry.reconcile();
      await registry.gc();
      expect(await registry.instanceMayRun(instanceId)).toBe(true);
      expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
      expect(await routedInstances(stateDir)).toEqual([instanceId]);
      const stopped = await orchestrator.down({ config, root, stateDir });
      expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [], stoppedProcesses: ["app"] } });
      expect(await waitFor(() => !processExists(pid))).toBe(true);
    } finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
}, 120_000);

it("stops a journaled process owner its receipt does not list before reporting stopped", async () => {
  await withLifecycle("devfn-teardown-journal-process-", async ({ root, stateDir, registry }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const extra = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { detached: true, stdio: "ignore" });
    extra.unref();
    try {
      let birthSignature: string | undefined;
      for (let attempt = 0; attempt < 50 && !birthSignature; attempt += 1) {
        birthSignature = await processBirthSignature(extra.pid!);
        if (!birthSignature) await delay(20);
      }
      expect(birthSignature).toBeTruthy();
      await registry.recordOwners(ready.invocationId, "worker", [{ process: { pid: extra.pid!, birthSignature: birthSignature! } }]);
      const stopped = await orchestrator.down({ config, root, stateDir });
      expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [] } });
      expect(stopped.cleanup?.stoppedProcesses).toEqual(expect.arrayContaining(["app", "worker"]));
      expect(await waitFor(() => !processExists(extra.pid!))).toBe(true);
    } finally {
      try { process.kill(-extra.pid!, "SIGKILL"); } catch { /* already gone */ }
    }
  });
}, 120_000);

it.skipIf(process.platform !== "darwin")("judges a journaled legacy owner its receipt does not list by the owner's own record time", async () => {
  await withLifecycle("devfn-teardown-journal-legacy-", async ({ root, stateDir, registry }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    // Started after the receipt, so the receipt's start time cannot judge it.
    const extra = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { detached: true, stdio: "ignore" });
    extra.unref();
    try {
      await new Promise<void>((resolve) => extra.once("spawn", () => resolve()));
      const lstart = (await promisify(execFile)("ps", ["-o", "lstart=", "-p", String(extra.pid)], { env: { ...process.env, TZ: "UTC+1", LC_ALL: "C" } })).stdout.trim();
      const recordedAt = new Date().toISOString();
      await registry.recordOwners(ready.invocationId, "worker", [{ process: { pid: extra.pid!, birthSignature: `darwin:${lstart}` } }]);
      // Without a record time the legacy owner is unverified: never signalled, never assumed gone.
      const blocked = await orchestrator.down({ config, root, stateDir });
      expect(blocked.state).toBe("degraded");
      expect(blocked.cleanup?.errors.join("\n")).toContain(`PID ${extra.pid}`);
      expect(processExists(extra.pid!)).toBe(true);
      const state = await registry.read();
      for (const owner of state.invocations.find((item) => item.id === ready.invocationId)!.owners!) if (owner.process?.pid === extra.pid) owner.process.recordedAt = recordedAt;
      await writeFile(registry.filePath, JSON.stringify(state));
      const stopped = await orchestrator.down({ config, root, stateDir });
      expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [] } });
      expect(stopped.cleanup?.stoppedProcesses).toContain("worker");
      expect(await waitFor(() => !processExists(extra.pid!))).toBe(true);
    } finally {
      try { process.kill(-extra.pid!, "SIGKILL"); } catch { /* already gone */ }
    }
  });
}, 120_000);

it("keeps a lifecycle whose journaled container or interrupted Compose launch may still run until teardown resolves it", async () => {
  await withLifecycle("devfn-teardown-journal-compose-", async ({ root, stateDir, toolsDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const dockerState = path.join(toolsDir, "docker-state");
    const dockerLog = path.join(toolsDir, "docker-log");
    await writeFile(dockerState, "running");
    await writeFile(path.join(toolsDir, "docker"), `#!/bin/sh
state="$(cat "${dockerState}")"
case "$1" in
  inspect) case "$state" in running) echo true; exit 0;; gone|resolved) echo "Error: No such object: $4" >&2; exit 1;; esac;;
  ps) case "$state" in resolved) echo launched-a; echo launched-b; exit 0;; esac;;
  stop|rm) echo "$*" >> "${dockerLog}"; exit 0;;
esac
echo "Cannot connect to the Docker daemon" >&2
exit 1
`, { mode: 0o700 });
    await registry.recordOwners(ready.invocationId, "cache", [{ container: { id: "journal-only" } }]);
    // A Compose start of this invocation was interrupted inside `compose up`.
    await registry.beginLaunch(ready.invocationId, "db", { projectName: "devfn-fixture", composeService: "db", preExisting: false, existingContainerIds: [], runningContainerIds: [] });

    const blocked = await orchestrator.down({ config, root, stateDir });
    expect(blocked.state).toBe("degraded");
    expect(blocked.cleanup?.errors.join("\n")).toMatch(/journal-only of cache .* may still run/);
    expect(blocked.cleanup?.errors.join("\n")).toMatch(/interrupted launch of Compose service db/);
    await registry.gc();
    expect((await registry.read()).invocations.find((item) => item.id === ready.invocationId)).toMatchObject({ state: "stopping", launching: ["db"] });
    expect(await registry.instanceMayRun(instanceId)).toBe(true);
    expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
    expect(await routedInstances(stateDir)).toEqual([instanceId]);

    // The container is gone and Docker can list what the launch created.
    await writeFile(dockerState, "resolved");
    const stopped = await orchestrator.down({ config, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [] } });
    expect(stopped.cleanup?.stoppedServices).toEqual(["db"]);
    expect((await readFile(dockerLog, "utf8")).trim().split("\n")).toEqual(["stop launched-a launched-b", "rm -f launched-a launched-b"]);
    expect(await routedInstances(stateDir)).toEqual([]);
  });
}, 120_000);

it("keeps an owner that is still running after its stop was refused on identity grounds, through down, replace and gc", async () => {
  await withLifecycle("devfn-teardown-refused-stop-", async ({ root, stateDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const pid = ready.processes[0].pid;
    // The identity read inside stop fails transiently; the status reads around
    // it verify the same owner still running.
    const refused = vi.spyOn(ProcessSupervisor.prototype, "stop").mockRejectedValue(
      new ProcessError("DEVFN_PROCESS_OWNERSHIP_MISMATCH", `PID ${pid} no longer matches the DevFn process identity.`));
    try {
      const down = await orchestrator.down({ config, root, stateDir });
      expect(refused).toHaveBeenCalled();
      expect(down.state).toBe("degraded");
      expect(down.cleanup).toMatchObject({ removedProxy: false, releasedPorts: false, stoppedProcesses: [] });
      expect(down.cleanup?.errors.join("\n")).toMatch(/identity cannot be verified/);
      await expect(orchestrator.up({ config, root, stateDir, replace: true })).rejects.toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorStopped: false } });
      expect(processExists(pid)).toBe(true);
      await registry.gc();
      expect((await registry.read()).invocations.find((item) => item.id === ready.invocationId)).toMatchObject({ state: "stopping" });
      expect(await registry.instanceMayRun(instanceId)).toBe(true);
      expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
      expect(await routedInstances(stateDir)).toEqual([instanceId]);
    } finally { refused.mockRestore(); }

    const stopped = await orchestrator.down({ config, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [], stoppedProcesses: ["app"] } });
    expect(await waitFor(() => !processExists(pid))).toBe(true);
  });
}, 120_000);

it.skipIf(process.platform === "win32")("keeps an interrupted Compose launch whose launcher left a process running, despite an empty container scan, until it is gone", async () => {
  await withLifecycle("devfn-teardown-pending-launch-", async ({ root, stateDir, toolsDir, registry, instanceId }) => {
    const orchestrator = new DevFnOrchestrator();
    const ready = await orchestrator.up({ config, root, stateDir });
    const dockerLog = path.join(toolsDir, "docker-log");
    // Docker lists nothing yet: the pending launch has not created its container.
    await writeFile(path.join(toolsDir, "docker"), `#!/bin/sh
echo "$*" >> "${dockerLog}"
exit 0
`, { mode: 0o700 });
    // The CLI died inside a recorded docker compose up launch; its launcher
    // was then killed, but the plugin it started still runs.
    const launch = { projectName: "devfn-fixture", composeService: "db", preExisting: false, existingContainerIds: [], runningContainerIds: [] };
    await registry.beginLaunch(ready.invocationId, "db", launch);
    const launcher = await launchFromDyingCli(root);
    await registry.beginLaunch(ready.invocationId, "db", { ...launch, launcher });
    try {
      process.kill(launcher.pid, "SIGKILL");
      expect(await waitFor(async () => await gatedLauncherStatus(launcher) !== "running")).toBe(true);
      expect(await gatedLauncherStatus(launcher)).toBe("unverified");

      const blocked = await orchestrator.down({ config, root, stateDir });
      expect(blocked.state).toBe("degraded");
      expect(blocked.cleanup?.errors.join("\n")).toMatch(/interrupted launch of Compose service db .*may still create or start containers/);
      expect(blocked.cleanup).toMatchObject({ removedProxy: false, releasedPorts: false });
      await expect(readFile(dockerLog, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(orchestrator.up({ config, root, stateDir, replace: true })).rejects.toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorStopped: false } });
      await registry.gc();
      expect((await registry.read()).invocations.find((item) => item.id === ready.invocationId)).toMatchObject({ launching: ["db"], composeLaunches: { db: { launcher } } });
      expect(await registry.instanceMayRun(instanceId)).toBe(true);
      expect(await recoverOrphanedProxyRoutes(stateDir)).toEqual([]);
      expect(await routedInstances(stateDir)).toEqual([instanceId]);
    } finally {
      try { process.kill(-launcher.pid, "SIGKILL"); } catch { /* already gone */ }
    }

    // Once nothing the launch ran remains, the scan is conclusive.
    expect(await waitFor(async () => await gatedLauncherStatus(launcher) === "gone")).toBe(true);
    const stopped = await orchestrator.down({ config, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [] } });
    expect(stopped.cleanup?.stoppedServices).toEqual(["db"]);
    expect((await readFile(dockerLog, "utf8")).trim().split("\n")[0]).toMatch(/^ps -a -q --no-trunc --filter label=com.docker.compose.project=devfn-fixture/);
    expect(await routedInstances(stateDir)).toEqual([]);
  });
}, 120_000);

it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("finds and stops the containers of a real Compose launch interrupted before its receipt listed them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-teardown-real-compose-"));
  const stateDir = path.join(root, "state");
  const composeConfig = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    services: { api: { adapter: "compose", service: "api", ports: { app: 80 } } }, profiles: { default: { services: ["api"] } } });
  const recordOwners = FilePortRegistry.prototype.recordOwners;
  const orchestrator = new DevFnOrchestrator();
  let projectName: string | undefined;
  try {
    await mkdir(stateDir);
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: [httpd, -f, -p, '80']\n");
    const { instanceId } = await resolveInstanceIdentity(composeConfig.project.id, root);
    // The CLI stops once Compose created the container and before the
    // receipt or journal lists it.
    let interrupted!: () => void;
    const reached = new Promise<void>((resolve) => { interrupted = resolve; });
    FilePortRegistry.prototype.recordOwners = async function () { interrupted(); await new Promise(() => undefined); };
    void orchestrator.up({ config: composeConfig, root, stateDir }).catch(() => undefined);
    await reached;
    FilePortRegistry.prototype.recordOwners = recordOwners;
    const receipt = (await readReceipt(composeConfig, root, instanceId))!;
    projectName = receipt.services[0].projectName;
    const containers = receipt.services[0].containerIds;
    expect(containers.length).toBeGreaterThan(0);
    await writeReceipt({ ...receipt, services: [], startedNodes: [] });
    await rm(path.join(stateDir, `lifecycle-${instanceId}.lock`), { recursive: true, force: true });

    const stopped = await new DevFnOrchestrator().down({ config: composeConfig, root, stateDir });
    expect(stopped).toMatchObject({ state: "stopped", cleanup: { errors: [], stoppedServices: ["api"] } });
    const remaining = await promisify(execFile)("docker", ["ps", "-a", "-q", "--no-trunc", "--filter", `label=com.docker.compose.project=${projectName}`]);
    expect(remaining.stdout.trim()).toBe("");
  } finally {
    FilePortRegistry.prototype.recordOwners = recordOwners;
    if (projectName) {
      const leftover = await promisify(execFile)("docker", ["ps", "-a", "-q", "--filter", `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: "" }));
      for (const id of leftover.stdout.split(/\s+/).filter(Boolean)) await promisify(execFile)("docker", ["rm", "-f", id]).catch(() => undefined);
      await promisify(execFile)("docker", ["network", "rm", `${projectName}_default`]).catch(() => undefined);
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 180_000);
