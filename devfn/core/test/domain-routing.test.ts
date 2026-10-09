import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";

import { ProcessSupervisor, processBirthSignature } from "@devfn/processes";
import { CaddyProxyController, proxyListenerPorts, registerDomain } from "@devfn/proxy";
import { validateDevFnConfig } from "@devfn/config";
import { allocateEphemeralPort, FilePortRegistry, withRoutingLock } from "@devfn/ports";
import { DevFnOrchestrator, domainAliases, readReceipt, resolveAllocationUrls, resolveInstanceIdentity, resolveLocalHostname } from "../src/index.js";

const execFileAsync = promisify(execFile);

it("protects Caddy listener ports for selected proxy routes while preserving no-proxy v0.1 ports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-listener-reservation-"));
  const { httpPort, httpsPort } = proxyListenerPorts();
  const freePreferred = await allocateEphemeralPort();
  try {
    for (const [name, preferred, exact, protocol, proxy] of ([
      ["exact", httpsPort, true, "tcp", true],
      ["preferred", httpPort, false, "tcp", true],
      ["no-proxy-exact", httpsPort, true, "udp", false],
      ["no-proxy-preferred", freePreferred, false, "tcp", false],
    ] as const).filter((item) => item[4] || process.platform === "darwin")) {
      const stateDir = path.join(root, name);
      const started = path.join(root, `${name}.started`);
      const config = validateDevFnConfig({ version: 1, project: { id: name },
        ports: { app: { preferred, exact, protocol } },
        processes: { app: { adapter: "command", command: [process.execPath, "-e", "require('node:fs').writeFileSync(process.argv[1], 'started'); process.exit(7)", started], ports: ["app"] } },
        profiles: { default: { processes: ["app"], proxy } },
        ...(proxy ? { hostnames: { app: { target: "app" } } } : {}) });
      await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toMatchObject({
        code: proxy && exact ? "DEVFN_PORT_CONFLICT" : "DEVFN_START_FAILED",
        ...(proxy && exact ? { message: expect.stringContaining("change the service's exact port") } : {}),
      });
      if (proxy && exact) {
        await expect(access(started)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(access(path.join(stateDir, "registry.json"))).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        const registry = JSON.parse(await readFile(path.join(stateDir, "registry.json"), "utf8")) as {
          allocations: Array<{ port: number; protocol: string }>; invocations: Array<{ state: string; proxyListenerPorts?: number[] }> };
        expect(registry.allocations).toHaveLength(1);
        expect(registry.allocations[0].port === preferred).toBe(!proxy);
        expect(registry.allocations[0].protocol).toBe(protocol);
        if (proxy) {
          expect(registry.invocations[0]).toMatchObject({ state: "failed", proxyListenerPorts: [httpPort, httpsPort] });
          const released = await new FilePortRegistry(path.join(stateDir, "registry.json"), undefined, async () => true).reserve({ projectId: name, instanceId: "later-sibling", invocationId: "later-sibling", profile: "default",
            requests: [{ name: "listener", spec: { preferred: httpPort, exact: true } }] });
          expect(released[0].port).toBe(httpPort);
        }
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("retires a proven abandoned proxy claim before first-start exact-port preflight", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-preflight-abandoned-"));
  const stateDir = path.join(root, "state");
  const port = await allocateEphemeralPort();
  const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
  const started = path.join(root, "started");
  try {
    await registry.reserve({ projectId: "old", instanceId: "abandoned", invocationId: "old", profile: "default", requests: [], proxyListenerPorts: [port] });
    const state = await registry.read();
    state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
    await writeFile(registry.filePath, JSON.stringify(state));
    const birthSignature = await processBirthSignature(process.pid);
    expect(birthSignature).toBeTruthy();
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: { preferred: port, exact: true } },
      processes: { app: { adapter: "command", command: [process.execPath, "-e", "require('node:fs').writeFileSync(process.argv[1], 'started'); process.exit(7)", started], ports: ["app"] } },
      profiles: { default: { processes: ["app"], proxy: false } } });
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    await expect(access(started)).resolves.toBeUndefined();
    expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("keeps a ready process and its lease when a changed exact port is externally bound", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-preflight-bound-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "http", port: "app", timeoutMs: 5000 } } },
    profiles: { default: { processes: ["app"], proxy: false } } });
  const external = net.createServer();
  try {
    await writeFile(path.join(root, "server.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    await new Promise<void>((resolve, reject) => external.once("error", reject).listen(0, "127.0.0.1", resolve));
    const port = (external.address() as net.AddressInfo).port;
    const replacement = validateDevFnConfig({ ...original, ports: { app: { preferred: port, exact: true } } });
    const registryBefore = (await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).allocations;
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    expect((await readReceipt(original, root, first.instanceId))?.state).toBe("ready");
    expect((await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).allocations).toEqual(registryBefore);
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    await new Promise<void>((resolve) => external.close(() => resolve()));
    const assertAvailable = FilePortRegistry.prototype.assertReplacementAvailable;
    FilePortRegistry.prototype.assertReplacementAvailable = async function (ports, exceptInstanceId, requests, checkRoutes) {
      await assertAvailable.call(this, ports, exceptInstanceId, requests, checkRoutes);
      await new Promise<void>((resolve, reject) => external.once("error", reject).listen(port, "127.0.0.1", resolve));
    };
    try {
      // An unrelated process wins the port after the read-only preflight.
      // Reservation still happens before the old ready process is stopped.
      await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
      expect((await readReceipt(original, root, first.instanceId))?.state).toBe("ready");
      expect((await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).allocations).toEqual(registryBefore);
      expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    } finally { FilePortRegistry.prototype.assertReplacementAvailable = assertAvailable; }
  } finally {
    if (external.listening) await new Promise<void>((resolve) => external.close(() => resolve()));
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it("serializes sibling lease and route ownership checks with a replacement decision", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-routing-coordination-"));
  const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
  const proxy = new CaddyProxyController(stateDir);
  const port = await allocateEphemeralPort();
  let release!: () => void;
  let entered!: () => void;
  const enteredLock = new Promise<void>((resolve) => { entered = resolve; });
  const releaseLock = new Promise<void>((resolve) => { release = resolve; });
  const held = withRoutingLock(stateDir, async () => { entered(); await releaseLock; });
  try {
    await enteredLock;
    let reserved = false;
    let published = false;
    const lease = registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling", profile: "default",
      requests: [{ name: "api", spec: { preferred: port, exact: true } }] }).then(() => { reserved = true; });
    const route = proxy.assertRouteOwnershipAvailable([{ id: "sibling", instanceId: "sibling", hostname: "sibling.localhost",
      targetHost: "127.0.0.1", targetPort: port, tls: "off" }], "sibling").then(() => { published = true; });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(reserved).toBe(false);
    expect(published).toBe(false);
    release();
    await Promise.all([held, lease, route]);
    expect(reserved).toBe(true);
    expect(published).toBe(true);
  } finally { release(); await held; await rm(stateDir, { recursive: true, force: true }); }
});

it("keeps a ready v0.1 process and sibling routes when proxy replacement selects its exact listener port", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-preteardown-listener-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } },
    profiles: { default: { processes: ["app"], proxy: false } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((request, response) => { response.end('ready'); }).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const routeFile = path.join(stateDir, "proxy-routes.json");
    const siblingRoutes = JSON.stringify({ version: 1, routes: [{ id: "sibling", instanceId: "sibling", hostname: "sibling.localhost",
      targetHost: "127.0.0.1", targetPort: first.allocations[0].port, tls: "off", updatedAt: new Date().toISOString() }] });
    await writeFile(routeFile, siblingRoutes);
    const registryBefore = await readFile(path.join(stateDir, "registry.json"), "utf8");
    const replacement = validateDevFnConfig({ version: 1, project: { id: "fixture" },
      ports: { app: { preferred: proxyListenerPorts().httpsPort, exact: true } },
      processes: original.processes, profiles: { default: { processes: ["app"], proxy: true } },
      hostnames: { app: { target: "app", hostname: "fixture.localhost" } } });
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({
      code: "DEVFN_PORT_CONFLICT", message: expect.stringContaining("change the service's exact port"),
    });
    expect((await readReceipt(original, root, first.instanceId))?.invocationId).toBe(first.invocationId);
    expect(await readFile(path.join(stateDir, "registry.json"), "utf8")).toBe(registryBefore);
    expect(await readFile(routeFile, "utf8")).toBe(siblingRoutes);
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/health`).then((response) => response.text())).toBe("ready");
  } finally {
    await rm(path.join(stateDir, "proxy-routes.pending.json"), { force: true });
    await rm(path.join(stateDir, "proxy-routes.json"), { force: true });
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps a ready service when replacement selects a sibling proxy listener or hostname", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-preteardown-sibling-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } },
    profiles: { default: { processes: ["app"], proxy: false } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((request, response) => { response.end('ready'); }).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const siblingPort = proxyListenerPorts().httpPort;
    await registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling", profile: "default",
      requests: [], proxyListenerPorts: [siblingPort] });
    const routeFile = path.join(stateDir, "proxy-routes.json");
    const claimedHostname = resolveLocalHostname("claimed.localhost", "app", "fixture", first.instanceId);
    const siblingRoutes = JSON.stringify({ version: 1, routes: [{ id: "sibling", instanceId: "sibling", hostname: claimedHostname,
      targetHost: "127.0.0.1", targetPort: first.allocations[0].port, tls: "off", updatedAt: new Date().toISOString() }] });
    await writeFile(routeFile, siblingRoutes);
    const exact = validateDevFnConfig({ ...original, ports: { app: { preferred: siblingPort, exact: true } } });
    await expect(orchestrator.up({ config: exact, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    const leasedPort = await allocateEphemeralPort();
    await registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling-lease", profile: "default",
      requests: [{ name: "api", spec: { preferred: leasedPort, exact: true } }] });
    const withSiblingLease = await registry.read();
    const leasedExact = validateDevFnConfig({ ...original, ports: { app: { preferred: leasedPort, exact: true } } });
    await expect(orchestrator.up({ config: leasedExact, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    const route = validateDevFnConfig({ ...original, profiles: { default: { processes: ["app"], proxy: true } },
      hostnames: { app: { target: "app", hostname: "claimed.localhost" } } });
    await expect(orchestrator.up({ config: route, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_OWNERSHIP_CONFLICT" });
    await rm(routeFile);
    const pendingFile = path.join(stateDir, "proxy-routes.pending.json");
    await writeFile(pendingFile, siblingRoutes);
    await expect(orchestrator.up({ config: route, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_OWNERSHIP_CONFLICT" });
    expect((await readReceipt(original, root, first.instanceId))?.invocationId).toBe(first.invocationId);
    expect((await readReceipt(original, root, first.instanceId))?.state).toBe("ready");
    expect((await registry.read()).allocations).toEqual(withSiblingLease.allocations);
    expect((await registry.read()).invocations).toEqual(withSiblingLease.invocations);
    expect(await readFile(pendingFile, "utf8")).toBe(siblingRoutes);
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/health`).then((response) => response.text())).toBe("ready");
  } finally {
    await rm(path.join(stateDir, "proxy-routes.pending.json"), { force: true });
    await rm(path.join(stateDir, "proxy-routes.json"), { force: true });
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects an occupied Caddy listener before stopping a ready replacement", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-physical-preflight-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const listener = net.createServer((socket) => socket.destroy());
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"], proxy: false } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    await new Promise<void>((resolve, reject) => listener.once("error", reject).listen(proxyListenerPorts().httpPort, "127.0.0.1", resolve));
    const replacement = validateDevFnConfig({ ...original, profiles: { default: { processes: ["app"], proxy: true } },
      hostnames: { app: { target: "app" } } });
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_OWNERSHIP_CONFLICT" });
    expect((await readReceipt(original, root, first.instanceId))?.state).toBe("ready");
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await new Promise<void>((resolve, reject) => listener.once("error", reject).listen(2019, "127.0.0.1", resolve));
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_OWNERSHIP_CONFLICT" });
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const unavailable = vi.spyOn(CaddyProxyController.prototype, "available").mockResolvedValue(false);
    try {
      await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_UNAVAILABLE" });
      expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    } finally { unavailable.mockRestore(); }
    const toolsDir = path.join(root, "tools");
    await mkdir(toolsDir);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nif [ \"$1\" = validate ]; then exit 1; fi\nexit 0\n", { mode: 0o700 });
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_CONFIG_INVALID" });
      expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    } finally { process.env.PATH = originalPath; }
  } finally {
    if (listener.listening) await new Promise<void>((resolve) => listener.close(() => resolve()));
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("preserves a ready replacement target when Caddy starts failing after validation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-late-caddy-failure-"));
  const stateDir = path.join(root, "state");
  const toolsDir = path.join(root, "tools");
  const originalPath = process.env.PATH;
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"], proxy: false } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const before = await new FilePortRegistry(path.join(stateDir, "registry.json")).read();
    const siblingRoutes = { version: 1, routes: [{ id: "sibling", instanceId: "sibling", hostname: "sibling.localhost",
      targetHost: "127.0.0.1", targetPort: first.allocations[0].port, tls: "off", updatedAt: new Date().toISOString() }] };
    await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify(siblingRoutes));
    await mkdir(toolsDir);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\ncase \"$1\" in version|validate) exit 0;; run|reload) exit 1;; esac\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const replacement = validateDevFnConfig({ ...original, profiles: { default: { processes: ["app"], proxy: true } },
      hostnames: { app: { target: "app" } } });
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PROXY_RELOAD_FAILED" });
    expect((await readReceipt(original, root, first.instanceId))?.invocationId).toBe(first.invocationId);
    expect((await readReceipt(original, root, first.instanceId))?.state).toBe("ready");
    const after = await new FilePortRegistry(path.join(stateDir, "registry.json")).read();
    expect(after.allocations.filter((allocation) => allocation.invocationId === first.invocationId)).toEqual(before.allocations);
    expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual(siblingRoutes);
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    await expect(orchestrator.up({ config: original, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
  } finally {
    process.env.PATH = originalPath;
    await rm(path.join(stateDir, "proxy-routes.json"), { force: true });
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("restores the prior ready process when a replacement fails after teardown", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-replacement-rollback-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 3000 } } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('old')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(root, "failed.mjs"), "process.exit(1);\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const replacement = validateDevFnConfig({ ...original,
      processes: { app: { ...original.processes!.app, command: [process.execPath, "failed.mjs"] } } });
      await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
      const restored = await readReceipt(original, root, first.instanceId);
      expect(restored).toMatchObject({ invocationId: first.invocationId, state: "ready" });
      expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
      const registry = await new FilePortRegistry(path.join(stateDir, "registry.json")).read();
      expect(registry.allocations.some((lease) => lease.invocationId === first.invocationId && lease.state === "active")).toBe(true);
      expect(registry.allocations.some((lease) => lease.invocationId !== first.invocationId && lease.state === "active")).toBe(false);
      await expect(orchestrator.up({ config: original, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
  } finally {
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("restores an old listener when the failed replacement selected a different exact port", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-port-rollback-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 3000 } } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('old')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(root, "failed.mjs"), "process.exit(1);\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const nextPort = await allocateEphemeralPort();
    const replacement = validateDevFnConfig({ ...original, ports: { app: { preferred: nextPort, exact: true } },
      processes: { app: { ...original.processes!.app, command: [process.execPath, "failed.mjs"] } } });
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
    const restored = await readReceipt(original, root, first.instanceId);
    expect(restored).toMatchObject({ invocationId: first.invocationId, state: "ready" });
    expect(restored?.allocations[0].port).toBe(first.allocations[0].port);
    expect((await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).allocations.filter((lease) => lease.state === "active")
      .map((lease) => lease.port)).toEqual([first.allocations[0].port]);
  } finally {
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("restores a ready lifecycle when its teardown reports failure after stopping", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-stop-rollback-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 3000 } } }, profiles: { default: { processes: ["app"] } } });
  const stop = ProcessSupervisor.prototype.stop;
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('old')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config, root, stateDir });
    let injected = false;
    ProcessSupervisor.prototype.stop = async function (managed, timeoutMs) {
      await stop.call(this, managed, timeoutMs);
      if (!injected && managed.pid === first.processes[0].pid) { injected = true; throw new Error("injected stop failure"); }
    };
    await expect(orchestrator.up({ config, root, stateDir, replace: true })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    expect((await readReceipt(config, root, first.instanceId))?.state).toBe("ready");
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
    expect((await new FilePortRegistry(path.join(stateDir, "registry.json")).read()).allocations.filter((lease) => lease.state === "active"))
      .toHaveLength(1);
  } finally {
    ProcessSupervisor.prototype.stop = stop;
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("recovers an interrupted replacement before evaluating a new up", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-interrupted-replacement-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 3000 } } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('old')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config, root, stateDir });
    const snapshot = JSON.parse(await readFile(path.join(first.runtimeDir, "recovery.json"), "utf8"));
    const journalPath = path.join(root, ".devfn", "receipts", `${first.instanceId}.rollback.json`);
    await writeFile(journalPath, JSON.stringify({ version: 1, previous: first, snapshot }), { mode: 0o600 });
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    await registry.reserve({ projectId: "fixture", instanceId: first.instanceId, invocationId: "pending-replacement", profile: "default",
      replacingInvocationId: first.invocationId, requests: [{ name: "app", spec: { preferred: first.allocations[0].port, exact: true } }] });
    await new ProcessSupervisor().stop(first.processes[0]);
    await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
    const restored = await readReceipt(config, root, first.instanceId);
    expect(restored).toMatchObject({ invocationId: first.invocationId, state: "ready" });
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
    expect((await registry.read()).allocations.find((lease) => lease.invocationId === "pending-replacement")?.state).toBe("released");
    await expect(access(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("retains the old lease through sibling reconciliation while replacement waits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-reconcile-replacement-"));
  const stateDir = path.join(root, "state");
  const marker = path.join(root, "replacement-started");
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('old')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(root, "failed.mjs"), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); setTimeout(() => process.exit(1), 1800);\n`);
    const first = await orchestrator.up({ config: original, root, stateDir });
    const replacement = validateDevFnConfig({ ...original,
      processes: { app: { ...original.processes!.app, command: [process.execPath, "failed.mjs"] } } });
    const pending = orchestrator.up({ config: replacement, root, stateDir });
    const expectedFailure = expect(pending).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    for (let attempt = 0; attempt < 100 && !await access(marker).then(() => true).catch(() => false); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await access(marker).then(() => true).catch(() => false)).toBe(true);
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const during = await registry.reconcile();
    expect(during.allocations.find((lease) => lease.invocationId === first.invocationId)?.state).toBe("active");
    await expectedFailure;
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
  } finally {
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("restores the prior inherited environment after a failed replacement", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-env-rollback-"));
  const stateDir = path.join(root, "state");
  const before = process.env.FIXTURE_MODE;
  const orchestrator = new DevFnOrchestrator();
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "ready.mjs"], ports: ["app"],
      envAllowlist: ["FIXTURE_MODE"], health: { type: "http", port: "app", timeoutMs: 3000 } } },
    profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "ready.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end(process.env.FIXTURE_MODE)).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    await writeFile(path.join(root, "failed.mjs"), "process.exit(1);\n");
    process.env.FIXTURE_MODE = "one";
    const first = await orchestrator.up({ config: original, root, stateDir });
    process.env.FIXTURE_MODE = "two";
    const replacement = validateDevFnConfig({ ...original,
      processes: { app: { ...original.processes!.app, command: [process.execPath, "failed.mjs"] } } });
    await expect(orchestrator.up({ config: replacement, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("one");
  } finally {
    if (before === undefined) delete process.env.FIXTURE_MODE; else process.env.FIXTURE_MODE = before;
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("allows a renamed service to reuse its own ready exact TCP lease", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-renamed-exact-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const port = await allocateEphemeralPort();
  const processSpec = { adapter: "command" as const, command: [process.execPath, "server.mjs"], health: { type: "http" as const, port: "app", timeoutMs: 5000 } };
  const original = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: { preferred: port, exact: true } },
    processes: { app: { ...processSpec, ports: ["app"] } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP ?? process.env.DEVFN_PORT_RENAMED), '127.0.0.1');\n");
    const first = await orchestrator.up({ config: original, root, stateDir });
    const renamed = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { renamed: { preferred: port, exact: true } },
      processes: { renamed: { ...processSpec, ports: ["renamed"], health: { type: "http", port: "renamed", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["renamed"] } } });
    const second = await orchestrator.up({ config: renamed, root, stateDir });
    expect(second.invocationId).not.toBe(first.invocationId);
    expect(second.allocations[0]).toMatchObject({ service: "renamed", port });
    expect(await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text())).toBe("ready");
  } finally {
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("waits for sibling routing coordination before down stops a ready process", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-down-routing-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"] } } });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  try {
    await writeFile(path.join(root, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config, root, stateDir });
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const routing = withRoutingLock(stateDir, async () => { entered(); await held; });
    await enteredPromise;
    const down = orchestrator.down({ config, root, stateDir });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await readReceipt(config, root, first.instanceId))?.state).toBe("ready");
    expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("ready");
    release();
    await routing;
    expect((await down).state).toBe("stopped");
  } finally {
    release();
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("allows sibling reservations during a slow ready process stop", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-slow-stop-lock-"));
  const stateDir = path.join(root, "state");
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"] } } });
  const stop = ProcessSupervisor.prototype.stop;
  try {
    await writeFile(path.join(root, "server.mjs"), "import { createServer } from 'node:http'; createServer((_request, response) => response.end('ok')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n");
    const first = await orchestrator.up({ config, root, stateDir });
    let entered!: () => void;
    const startedStop = new Promise<void>((resolve) => { entered = resolve; });
    ProcessSupervisor.prototype.stop = async function (managed, timeoutMs) {
      await stop.call(this, managed, timeoutMs);
      if (managed.pid === first.processes[0].pid) { entered(); await new Promise((resolve) => setTimeout(resolve, 1500)); }
    };
    const pending = orchestrator.down({ config, root, stateDir });
    await startedStop;
    const siblingPort = await allocateEphemeralPort();
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    expect((await registry.reconcile()).allocations.find((lease) => lease.invocationId === first.invocationId)?.state).toBe("active");
    const sibling = registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling", profile: "default",
      requests: [{ name: "api", spec: { preferred: siblingPort, exact: true } }] });
    expect(await Promise.race([sibling.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 500))])).toBe(true);
    await pending;
  } finally {
    ProcessSupervisor.prototype.stop = stop;
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("lets a sibling reserve a port while another worktree waits for readiness", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-slow-readiness-"));
  const stateDir = path.join(root, "state");
  const marker = path.join(root, "starting");
  const siblingRoot = path.join(root, "sibling");
  const config = validateDevFnConfig({ version: 1, project: { id: "slow" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "slow.mjs", marker], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 8000 } } }, profiles: { default: { processes: ["app"] } } });
  const orchestrator = new DevFnOrchestrator();
  const siblingConfig = validateDevFnConfig({ version: 1, project: { id: "sibling" }, ports: { web: {} },
    processes: { web: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["web"],
      health: { type: "http", port: "web", timeoutMs: 5000 } } }, profiles: { default: { processes: ["web"] } } });
  let started: Awaited<ReturnType<typeof orchestrator.up>> | undefined;
  try {
    await mkdir(siblingRoot);
    await writeFile(path.join(siblingRoot, "server.mjs"),
      "import { createServer } from 'node:http'; createServer((_request, response) => response.end('sibling')).listen(Number(process.env.DEVFN_PORT_WEB), '127.0.0.1');\n");
    const siblingReady = await orchestrator.up({ config: siblingConfig, root: siblingRoot, stateDir });
    await writeFile(path.join(root, "slow.mjs"),
      "import { writeFileSync } from 'node:fs'; import { createServer } from 'node:http'; writeFileSync(process.argv[2], 'starting'); setTimeout(() => createServer((_request, response) => response.end('ready')).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1'), 1800);\n");
    const pending = orchestrator.up({ config, root, stateDir });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await access(marker).then(() => true).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(await access(marker).then(() => true).catch(() => false)).toBe(true);
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const siblingPort = await allocateEphemeralPort();
    const sibling = registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling", profile: "default",
      requests: [{ name: "api", spec: { preferred: siblingPort, exact: true } }] });
    const down = orchestrator.down({ config: siblingConfig, root: siblingRoot, stateDir });
    const early = await Promise.race([Promise.all([sibling, down]).then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 800))]);
    started = await pending;
    expect(early).toBe(true);
    await sibling;
    expect((await down).state).toBe("stopped");
    expect((await readReceipt(siblingConfig, siblingRoot, siblingReady.instanceId))?.state).toBe("stopped");
  } finally {
    if (started) await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await orchestrator.down({ config: siblingConfig, root: siblingRoot, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("does not hold the shared routing lock during a prior health probe", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-prior-health-lock-"));
  const stateDir = path.join(root, "state");
  const marker = path.join(root, "probe-started");
  const slow = path.join(root, "slow-health");
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 5000 } } }, profiles: { default: { processes: ["app"] } } });
  try {
    await writeFile(path.join(root, "server.mjs"),
      `import { existsSync, writeFileSync } from 'node:fs'; import { createServer } from 'node:http'; createServer((_request, response) => { if (existsSync(${JSON.stringify(slow)})) { writeFileSync(${JSON.stringify(marker)}, 'started'); setTimeout(() => response.end('ok'), 2500); } else response.end('ok'); }).listen(Number(process.env.DEVFN_PORT_APP), '127.0.0.1');\n`);
    const first = await orchestrator.up({ config, root, stateDir });
    await writeFile(slow, "1");
    const pending = orchestrator.up({ config, root, stateDir });
    for (let attempt = 0; attempt < 100 && !await access(marker).then(() => true).catch(() => false); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await access(marker).then(() => true).catch(() => false)).toBe(true);
    const siblingPort = await allocateEphemeralPort();
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const sibling = registry.reserve({ projectId: "sibling", instanceId: "sibling", invocationId: "sibling", profile: "default",
      requests: [{ name: "api", spec: { preferred: siblingPort, exact: true } }] });
    const early = await Promise.race([sibling.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 500))]);
    expect(early).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
    expect((await readReceipt(config, root, first.instanceId))?.state).toBe("ready");
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("rejects proxy activation behind a sibling listener lease before changing either lifecycle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-proxy-sibling-"));
  const stateDir = path.join(root, "machine-state");
  const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
  const port = proxyListenerPorts().httpPort;
  const started = path.join(root, "started");
  const config = validateDevFnConfig({ version: 1, project: { id: "proxy-fixture" },
    ports: { app: {} }, processes: { app: { adapter: "command", command: [process.execPath, "-e", "require('node:fs').writeFileSync(process.argv[1], 'started')", started], ports: ["app"] } },
    profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });
  try {
    await registry.reserve({ projectId: "sibling", instanceId: "sibling-id", invocationId: "sibling-run", profile: "default",
      requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] });
    const before = await registry.read();
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toMatchObject({
      code: "DEVFN_PORT_CONFLICT", message: expect.stringContaining("Stop the profile using port"),
      details: { port, instanceId: "sibling-id", service: "api", action: expect.stringContaining("change its exact/preferred service port") },
    });
    await expect(access(started)).rejects.toMatchObject({ code: "ENOENT" });
    const after = await registry.read();
    expect(after.allocations).toEqual(before.allocations);
    expect(after.invocations).toEqual(before.invocations);
    await expect(access(path.join(stateDir, "proxy-routes.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses an unregistered or differently owned domain before lifecycle state exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-domain-preflight-"));
  const stateDir = path.join(root, "machine-state");
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "-e", "void 0"], ports: ["app"] } },
    profiles: { default: { processes: ["app"], proxy: true } },
    hostnames: { app: { target: "app", domain: "dev.example.test" } } });
  try {
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/not registered/);
    await expect(access(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    await registerDomain(stateDir, { domain: "dev.example.test", projectId: "other", repositoryIdentity: root, tls: "internal" },
      (async () => [{ address: "127.0.0.1", family: 4 }]) as never);
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/not registered/);
    await expect(access(path.join(stateDir, "registry.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("starts local-only preflight despite an invalid machine domain registry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-local-preflight-"));
  const stateDir = path.join(root, "machine-state");
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "-e", "process.exit(7)"], ports: ["app"] } },
    profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });
  try {
    await mkdir(stateDir);
    await writeFile(path.join(stateDir, "domains.json"), "{invalid-json");
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    await expect(access(path.join(stateDir, "registry.json"))).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("keeps registered-domain aliases and routes isolated across two Git worktrees", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "devfn-domain-worktrees-"));
  const primary = path.join(parent, "primary");
  const feature = path.join(parent, "feature");
  const stateDir = path.join(parent, "machine-state");
  const toolsDir = path.join(parent, "tools");
  const originalPath = process.env.PATH;
  try {
    await mkdir(primary); await mkdir(toolsDir);
    await execFileAsync("git", ["init", primary]);
    await writeFile(path.join(primary, "fixture.txt"), "fixture");
    await execFileAsync("git", ["-C", primary, "add", "fixture.txt"]);
    await execFileAsync("git", ["-C", primary, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "init"]);
    await execFileAsync("git", ["-C", primary, "worktree", "add", "--detach", feature]);
    const [main, child] = await Promise.all([primary, feature].map((root) => resolveInstanceIdentity("fixture", root)));
    expect(main.repositoryIdentity).toBe(child.repositoryIdentity);
    const mainAliases = domainAliases("app", "dev.example.test", main);
    const childAliases = domainAliases("app", "dev.example.test", child);
    expect(mainAliases).toContain("app.dev.example.test");
    expect(childAliases).toHaveLength(1);
    expect(childAliases[0]).toMatch(/^app-feature-[a-f0-9]{20}\.dev\.example\.test$/);
    const dns = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: main.repositoryIdentity, tls: "internal" }, dns);
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const proxy = new CaddyProxyController(stateDir, dns);
    const routes = (identity: typeof main, aliases: string[], port: number) => aliases.map((hostname, index) => ({
      id: `${identity.instanceId}:${index}`, instanceId: identity.instanceId, hostname, targetHost: "127.0.0.1", targetPort: port,
      tls: "internal" as const, registeredDomain: "dev.example.test", projectId: "fixture", repositoryIdentity: identity.repositoryIdentity,
    }));
    const first = routes(main, mainAliases, 4101);
    const second = routes(child, childAliases, 4102);
    await proxy.upsert(first);
    await proxy.upsert(second);
    expect((await proxy.routes()).map((route) => route.hostname).sort()).toEqual([...mainAliases, ...childAliases].sort());
    const allocation = (instanceId: string, port: number) => ({ id: instanceId, projectId: "fixture", instanceId, service: "app", protocol: "tcp" as const,
      host: "127.0.0.1", port, invocationId: "fixture", state: "active" as const, source: "exact" as const, createdAt: "now", updatedAt: "now" });
    const tlsPort = proxyListenerPorts().httpsPort === 443 ? "" : `:${proxyListenerPorts().httpsPort}`;
    expect(resolveAllocationUrls([allocation(main.instanceId, 4101)], await proxy.routes(), new Set(["app"])).app)
      .toBe(`https://${mainAliases[0]}${tlsPort}`);
    expect(resolveAllocationUrls([allocation(child.instanceId, 4102)], await proxy.routes(), new Set(["app"])).app)
      .toBe(`https://${childAliases[0]}${tlsPort}`);
    await expect(proxy.upsert([{ ...second[0], hostname: mainAliases[0] }])).rejects.toThrow(/already owned/);
    expect((await proxy.routes()).map((route) => route.hostname).sort()).toEqual([...mainAliases, ...childAliases].sort());
    await proxy.removeInstance(main.instanceId);
    expect((await proxy.routes()).map((route) => route.hostname)).toEqual(childAliases);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(parent, { recursive: true, force: true });
  }
});
