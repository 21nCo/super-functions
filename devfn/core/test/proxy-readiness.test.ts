import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => ({ accepting: true }));
vi.mock("@devfn/proxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devfn/proxy")>();
  return {
    ...actual,
    CaddyProxyController: class extends actual.CaddyProxyController {
      // The command stub stands in for a Caddy that holds its listeners and
      // serves the committed configuration until the test says otherwise.
      constructor(stateDir: string) { super(stateDir, undefined, undefined, async () => listeners.accepting, async () => listeners.accepting); }
      // Physical owner and listener preflight is covered by the proxy suites.
      override async assertActivationReady(): Promise<void> {}
    },
  };
});

import { validateDevFnConfig } from "@devfn/config";
import { allocateEphemeralPort, FilePortRegistry, withFileLock } from "@devfn/ports";
import { processBirthSignature } from "@devfn/processes";
import { CaddyProxyController } from "@devfn/proxy";
import { DevFnOrchestrator, recoverOrphanedProxyRoutes } from "../src/index.js";

it("reports degraded for a dead Caddy owner, a lost listener or an interrupted route switch, and up repairs the switch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-readiness-"));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 20_000 } } },
    profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });
  try {
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    const ownerFile = path.join(stateDir, "proxy-owner.json");
    await writeFile(ownerFile, JSON.stringify({ pid: process.pid, birthSignature }));

    const first = await orchestrator.up({ config, root, stateDir });
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    listeners.accepting = false;
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    listeners.accepting = true;

    // A replacement preactivates its routes before the prior receipt is
    // superseded; an interruption there leaves Caddy on an abandoned port.
    const abandonedPort = await allocateEphemeralPort();
    const { updatedAt: _updatedAt, ...switched } = first.routes[0];
    await new CaddyProxyController(stateDir).upsert([{ ...switched, targetPort: abandonedPort }], first.instanceId);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
    const repaired = await orchestrator.up({ config, root, stateDir });
    expect(repaired.invocationId).not.toBe(first.invocationId);
    const committed = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")) as { routes: Array<{ instanceId: string; targetPort: number }> };
    expect(committed.routes.filter((route) => route.instanceId === first.instanceId).map((route) => route.targetPort)).toEqual([repaired.allocations[0].port]);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready", urls: repaired.urls });

    const exited = execFile(process.execPath, ["-e", "setTimeout(() => undefined, 200)"]);
    const exitedSignature = await processBirthSignature(exited.pid!);
    await new Promise((resolve) => exited.once("exit", resolve));
    await writeFile(ownerFile, JSON.stringify({ pid: exited.pid, birthSignature: exitedSignature ?? "gone" }));
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    await writeFile(ownerFile, JSON.stringify({ pid: process.pid, birthSignature }));
    expect((await orchestrator.down({ config, root, stateDir })).state).toBe("stopped");
  } finally {
    listeners.accepting = true;
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("removes routes preactivated by an interrupted replacement when the profile no longer selects a proxy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-reverted-"));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 20_000 } } },
    profiles: { default: { processes: ["app"], proxy: false } } });
  try {
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));

    const first = await orchestrator.up({ config, root, stateDir });
    expect(first.routes).toEqual([]);
    // A replacement that selected a proxy committed its route, then stopped
    // before its receipt; the manifest was then reverted to no proxy.
    await new CaddyProxyController(stateDir).upsert([{ id: `${first.instanceId}:app`, instanceId: first.instanceId,
      hostname: "app.localhost", targetHost: "127.0.0.1", targetPort: await allocateEphemeralPort(), tls: "off" }], first.instanceId);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
    const repaired = await orchestrator.up({ config, root, stateDir });
    expect(repaired.routes).toEqual([]);
    const committed = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")) as { routes: Array<{ instanceId: string }> };
    expect(committed.routes.filter((route) => route.instanceId === first.instanceId)).toEqual([]);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("keeps the original error when a replacement's route activation fails without changing route state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-unchanged-rollback-"));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 20_000 } } },
    profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });
  const caddy = path.join(toolsDir, "caddy");
  try {
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(caddy, "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    const first = await orchestrator.up({ config, root, stateDir });
    const committed = await readFile(path.join(stateDir, "proxy-routes.json"), "utf8");
    // Caddy now rejects every candidate before a route journal is written.
    await writeFile(caddy, "#!/bin/sh\ncase \"$1\" in version|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    await expect(orchestrator.up({ config, root, stateDir, replace: true })).rejects.toMatchObject({ code: "DEVFN_PROXY_CONFIG_INVALID" });
    expect(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")).toBe(committed);
    // The ready lifecycle still claims the listeners; the failed one adds no claim to retire later.
    const invocations = (await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).invocations;
    expect(invocations.filter((item) => item.proxyClaimRetained)).toEqual([]);
    expect(invocations.find((item) => item.id === first.invocationId)?.state).toBe("ready");
    await writeFile(caddy, "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready", urls: first.urls });
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("removes routes only for instances with conclusive no-lifecycle evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-orphans-"));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  try {
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\ncase \"$1\" in version|validate|reload) exit 0;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    const exited = execFile(process.execPath, ["-e", "setTimeout(() => undefined, 200)"]);
    const exitedSignature = await processBirthSignature(exited.pid!);
    await new Promise((resolve) => exited.once("exit", resolve));
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const ports: Record<string, number> = {};
    for (const instanceId of ["dead", "live", "orphan", "running"]) ports[instanceId] = await allocateEphemeralPort();
    for (const [instanceId, owner] of [["dead", { pid: exited.pid!, birthSignature: exitedSignature ?? "gone" }], ["live", { pid: process.pid, birthSignature }]] as const) {
      await registry.reserve({ projectId: "app", instanceId, invocationId: instanceId, profile: "default", requests: [{ name: "api", spec: { preferred: ports[instanceId], exact: true } }] });
      await registry.markActive(instanceId, { api: { process: owner } });
    }
    await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify({ version: 1, routes: Object.entries(ports).map(([instanceId, targetPort]) => ({
      id: `${instanceId}:app`, instanceId, hostname: `${instanceId}.localhost`, targetHost: "127.0.0.1", targetPort, tls: "off", updatedAt: new Date().toISOString() })) }));
    const sibling = () => new FilePortRegistry(path.join(stateDir, "registry.json")).reserve({ projectId: "app", instanceId: "sibling", invocationId: `sibling-${Date.now()}`,
      profile: "default", requests: [{ name: "api", spec: { preferred: ports.orphan, exact: true } }] });
    await expect(sibling()).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "orphan", action: expect.stringContaining("devfn ports gc") } });
    // A lifecycle command of "running" holds its instance lock throughout.
    const recovered = await withFileLock(path.join(stateDir, "lifecycle-running.lock"), async () => await recoverOrphanedProxyRoutes(stateDir));
    expect(recovered).toEqual(["dead", "orphan"]);
    const committed = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")) as { routes: Array<{ instanceId: string }> };
    expect(committed.routes.map((route) => route.instanceId).sort()).toEqual(["live", "running"]);
    expect((await sibling())[0].port).toBe(ports.orphan);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
