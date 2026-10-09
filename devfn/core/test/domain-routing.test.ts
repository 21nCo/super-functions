import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

import { processBirthSignature } from "@devfn/processes";
import { CaddyProxyController, proxyListenerPorts, registerDomain } from "@devfn/proxy";
import { validateDevFnConfig } from "@devfn/config";
import { FilePortRegistry } from "@devfn/ports";
import { DevFnOrchestrator, domainAliases, readReceipt, resolveAllocationUrls, resolveInstanceIdentity } from "../src/index.js";

const execFileAsync = promisify(execFile);

it("protects Caddy listener ports for selected proxy routes while preserving no-proxy v0.1 ports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-listener-reservation-"));
  const { httpPort, httpsPort } = proxyListenerPorts();
  try {
    for (const [name, preferred, exact, protocol, proxy] of ([
      ["exact", httpsPort, true, "tcp", true],
      ["preferred", httpPort, false, "tcp", true],
      ["no-proxy-exact", httpsPort, true, "udp", false],
      ["no-proxy-preferred", httpPort, false, "tcp", false],
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
    await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

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
