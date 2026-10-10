import { execFile, spawn } from "node:child_process";
import dgram from "node:dgram";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { processBirthSignature } from "@devfn/processes";
import { allocateEphemeralPort, FilePortRegistry, isPortAvailable, renderPolicyInventory, resolvePolicy, withFileLock } from "../src/index.js";
import { inspectContainerRunning } from "../src/registry.js";

// Fixtures that need the fixed Caddy admin port 127.0.0.1:2019 free share one
// machine-wide lock with other DevFn packages' fixtures that bind it.
const withCaddyAdminPort = async <T>(action: () => Promise<T>): Promise<T> =>
  await withFileLock(path.join(tmpdir(), "devfn-test-caddy-admin.lock"), action, { timeoutMs: 120_000 });

describe("FilePortRegistry", () => {
  for (const protocol of ["tcp", "udp"] as const) {
    it(`preflights renamed and swapped exact ${protocol} leases by ready invocation and host`, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "devfn-replacement-owner-"));
      let occupied = false;
      const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => !occupied);
      const first = await allocateEphemeralPort();
      let second = await allocateEphemeralPort();
      while (second === first) second = await allocateEphemeralPort();
      try {
        await registry.reserve({ projectId: "app", instanceId: "same", invocationId: "old", profile: "default",
          requests: [{ name: "a", spec: { preferred: first, exact: true, protocol } }, { name: "b", spec: { preferred: second, exact: true, protocol } }] });
        await registry.markActive("old");
        occupied = true;
        const requests = [{ name: "renamed-a", spec: { preferred: second, exact: true, protocol } },
          { name: "renamed-b", spec: { preferred: first, exact: true, protocol } }];
        await registry.assertReplacementAvailable([], "same", requests, async () => undefined, "old");
        const swapped = await registry.reserve({ projectId: "app", instanceId: "same", invocationId: "new", replacingInvocationId: "old", profile: "default", requests });
        expect(swapped.map((item) => item.port)).toEqual([second, first]);
        await expect(registry.assertReplacementAvailable([], "same", [{ name: "public", spec: { preferred: first, exact: true, protocol, exposure: "public" } }],
          async () => undefined, "old")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
      } finally { await rm(dir, { recursive: true, force: true }); }
    });
  }
  it("retains an expired cross-protocol proxy claim when an IPv6 listener is hidden from OS inspection", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-ipv6-claim-"));
    const port = await allocateEphemeralPort();
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    let listener = net.createServer();
    const previousPath = process.env.PATH;
    try {
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "old", profile: "default", requests: [], proxyListenerPorts: [port] });
      await registry.updateInvocation("old", { state: "starting" });
      const state = await registry.read();
      state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
      const birthSignature = await processBirthSignature(process.pid);
      expect(birthSignature).toBeTruthy();
      await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      const toolsDir = path.join(dir, "tools");
      await mkdir(toolsDir);
      await symlink("/bin/ps", path.join(toolsDir, "ps"));
      process.env.PATH = toolsDir;
      for (const host of ["::1", "::"]) {
        listener = net.createServer();
        await new Promise<void>((resolve, reject) => listener.once("error", reject).listen({ port, host, ipv6Only: true }, resolve));
        await expect(registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: `sibling-${host}`, profile: "default",
          requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
        expect((await registry.read()).invocations[0].state).toBe("starting");
        await new Promise<void>((resolve) => listener.close(() => resolve()));
      }
      // A live owner whose configuration cannot be read may still listen.
      await expect(registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "sibling-owner", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
      await rm(path.join(dir, "proxy-owner.json"));
      expect((await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "sibling-free", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] }))[0].port).toBe(port);
    } finally {
      process.env.PATH = previousPath;
      if (listener.listening) await new Promise<void>((resolve) => listener.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  }), 150_000);

  for (const invocationState of ["planning", "starting", "ready", "stopping"] as const) {
    it(`reclaims an abandoned ${invocationState} claim with a reused owner PID`, async () => await withCaddyAdminPort(async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "devfn-reused-proxy-owner-"));
      const port = 18453;
      const registry = new FilePortRegistry(path.join(dir, "registry.json"), async () => port + 1, async () => true);
      const reserve = (invocationId: string, protocol: "tcp" | "udp", exact: boolean) => registry.reserve({
        projectId: "app", instanceId: "legacy", invocationId, profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact, protocol, range: [port, port + 1] } }],
      });
      try {
        await registry.reserve({ projectId: "app", instanceId: "abandoned", invocationId: "old", profile: "default",
          requests: [], proxyListenerPorts: [port] });
        await registry.updateInvocation("old", { state: invocationState });
        await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature: `${(await processBirthSignature(process.pid))!.split(":")[0]}:reused-pid` }));
        const state = await registry.read();
        state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
        await writeFile(registry.filePath, JSON.stringify(state));
        // Normal sibling startup must recover the expired claim by itself.
        expect((await reserve("tcp-exact", "tcp", true))[0]).toMatchObject({ port, source: "exact" });
        expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
        await registry.gc();
        await registry.release({ invocationId: "tcp-exact" });
        expect((await reserve("udp-exact", "udp", true))[0]).toMatchObject({ port, source: "exact" });
        await registry.release({ invocationId: "udp-exact" });
        expect((await reserve("tcp-preferred", "tcp", false))[0]).toMatchObject({ port, source: "preferred" });
        await registry.release({ invocationId: "tcp-preferred" });
        expect((await reserve("tcp-stable", "tcp", false))[0]).toMatchObject({ port, source: "stable" });
      } finally { await rm(dir, { recursive: true, force: true }); }
    }), 150_000);
  }

  it("bounds stopping and replacement protection to live, recently refreshed lifecycles", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-bounded-protection-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
    const port = await allocateEphemeralPort();
    const dead = { pid: 2_147_483_000 };
    const age = async (ids: string[]) => {
      const state = await registry.read();
      for (const invocation of state.invocations) if (ids.includes(invocation.id)) invocation.updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
    };
    const leaseState = async (id: string) => (await registry.read()).allocations.find((item) => item.invocationId === id)?.state;
    try {
      // An interrupted down: a fresh stopping claim stays protected, an
      // expired one with a verified-dead owner is reconciled.
      await registry.reserve({ projectId: "app", instanceId: "down", invocationId: "down", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] });
      await registry.markActive("down", { api: { process: dead } });
      await registry.updateInvocation("down", { state: "stopping" });
      await registry.reconcile();
      expect(await leaseState("down")).toBe("active");
      await age(["down"]);
      await registry.reconcile();
      expect(await leaseState("down")).toBe("stale");
      expect((await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "sibling", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] }))[0].port).toBe(port);
      await registry.release({ invocationId: "sibling" });
      // An interrupted replacement protects its predecessor only while its
      // heartbeat is current.
      await registry.reserve({ projectId: "app", instanceId: "same", invocationId: "old", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] });
      await registry.markActive("old", { api: { process: dead } });
      await registry.reserve({ projectId: "app", instanceId: "same", invocationId: "new", replacingInvocationId: "old", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] });
      await registry.updateInvocation("new", { state: "starting" });
      await registry.reconcile();
      expect(await leaseState("old")).toBe("active");
      await age(["new"]);
      await registry.reconcile();
      expect(await leaseState("old")).toBe("stale");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("reclaims an abandoned starting proxy claim after its lease becomes stale", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-abandoned-proxy-"));
    const file = path.join(dir, "registry.json");
    const port = 18445;
    const registry = new FilePortRegistry(file, async () => port + 1, async () => true);
    try {
      await registry.reserve({ projectId: "app", instanceId: "abandoned", invocationId: "old", profile: "default",
        requests: [{ name: "api", spec: { preferred: port + 1 } }], proxyListenerPorts: [port] });
      await registry.updateInvocation("old", { state: "starting" });
      const state = JSON.parse(await readFile(file, "utf8"));
      state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      state.allocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(file, JSON.stringify(state));
      const sibling = await registry.reserve({ projectId: "app", instanceId: "legacy", invocationId: "legacy", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] });
      expect(sibling[0]).toMatchObject({ port, source: "exact", protocol: "udp" });
      expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
      await registry.release({ invocationId: "legacy" });
      await registry.gc();
      expect((await registry.read()).invocations).toEqual([]);
      const tcp = await registry.reserve({ projectId: "app", instanceId: "legacy", invocationId: "legacy-tcp", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "tcp" } }] });
      expect(tcp[0]).toMatchObject({ port, protocol: "tcp" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }), 150_000);

  it("reclaims an abandoned listener claim beside a mixed-case route owned by another instance", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-abandoned-case-route-"));
    const port = 18450;
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), async () => port + 1, async () => true);
    try {
      await registry.reserve({ projectId: "app", instanceId: "abandoned", invocationId: "old", profile: "default",
        requests: [{ name: "api", spec: { preferred: port + 1 } }], proxyListenerPorts: [port] });
      await registry.updateInvocation("old", { state: "starting" });
      const state = JSON.parse(await readFile(registry.filePath, "utf8"));
      state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      state.allocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
      await writeFile(path.join(dir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: [{
        id: "sibling", instanceId: "sibling", hostname: "Sibling.localhost", targetHost: "127.0.0.1",
        targetPort: port + 2, tls: "off", updatedAt: "now",
      }] }));
      await registry.reconcile();
      await registry.gc();
      expect((await registry.read()).invocations).toEqual([]);
      const allocation = await registry.reserve({ projectId: "app", instanceId: "legacy", invocationId: "legacy", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] });
      expect(allocation[0].port).toBe(port);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }), 150_000);

  it("retains a ready proxy claim while an owned route or live Caddy owner remains", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-ready-proxy-"));
    const file = path.join(dir, "registry.json");
    const port = 18446;
    const registry = new FilePortRegistry(file, async () => port + 1, async () => true);
    const reserveSibling = () => registry.reserve({ projectId: "app", instanceId: "legacy", invocationId: "legacy", profile: "default",
      requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "tcp" } }] });
    try {
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "ready", profile: "default",
        requests: [{ name: "api", spec: { preferred: port + 1 } }], proxyListenerPorts: [port] });
      await registry.markActive("ready");
      const state = JSON.parse(await readFile(file, "utf8"));
      state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(file, JSON.stringify(state));
      const routeFile = path.join(dir, "proxy-routes.json");
      await writeFile(routeFile, JSON.stringify({ version: 1, routes: [{ id: "r", instanceId: "proxy", hostname: "app.localhost",
        targetHost: "127.0.0.1", targetPort: port + 1, tls: "off", updatedAt: new Date().toISOString() }] }));
      await registry.reconcile();
      await registry.gc();
      await expect(reserveSibling()).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: {
        instanceId: "proxy", action: expect.stringContaining("stop proxy instance proxy"),
      } });
      await rm(routeFile);
      await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: process.pid }));
      await registry.reconcile();
      expect((await registry.read()).invocations[0].state).toBe("ready");
      await rm(path.join(dir, "proxy-owner.json"));
      const pendingFile = path.join(dir, "proxy-routes.pending.json");
      await writeFile(pendingFile, JSON.stringify({ version: 1, routes: [{ id: "pending", instanceId: "proxy", hostname: "app.localhost",
        targetHost: "127.0.0.1", targetPort: port + 1, tls: "off", updatedAt: new Date().toISOString() }] }));
      await registry.reconcile();
      expect((await registry.read()).invocations[0].state).toBe("ready");
      await writeFile(pendingFile, "{}");
      await registry.reconcile();
      expect((await registry.read()).invocations[0].state).toBe("ready");
      await rm(pendingFile);
      await registry.reconcile();
      await registry.gc();
      expect((await reserveSibling())[0].port).toBe(port);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }), 150_000);

  it("keeps a port targeted by committed or pending proxy routes from sibling reservations", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-routed-target-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
    const port = await allocateEphemeralPort();
    const request = (exact: boolean) => [{ name: "api", spec: { preferred: port, exact } }];
    try {
      for (const name of ["proxy-routes.json", "proxy-routes.pending.json"]) {
        // An interrupted replacement can leave a route on a port whose lease
        // was already released; the route still sends traffic there.
        await writeFile(path.join(dir, name), JSON.stringify({ version: 1, routes: [{ id: "routed:app", instanceId: "routed",
          hostname: "app.localhost", targetHost: "127.0.0.1", targetPort: port, tls: "off", updatedAt: new Date().toISOString() }] }));
        await expect(registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: `exact-${name}`, profile: "default", requests: request(true) }))
          .rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { port, instanceId: "routed" } });
        await expect(registry.assertReplacementAvailable([], "sibling", request(true), async () => undefined))
          .rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { port, instanceId: "routed" } });
        const moved = await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: `preferred-${name}`, profile: "default", requests: request(false) });
        expect(moved[0].port).not.toBe(port);
        await registry.release({ invocationId: `preferred-${name}` });
        // The routed instance itself repairs the route onto this port.
        expect((await registry.reserve({ projectId: "app", instanceId: "routed", invocationId: `owner-${name}`, profile: "default", requests: request(true) }))[0].port).toBe(port);
        await registry.release({ invocationId: `owner-${name}` });
        await rm(path.join(dir, name));
      }
      expect((await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "unrouted", profile: "default", requests: request(true) }))[0].port).toBe(port);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("keeps an abandoned listener claim when route or owner evidence is malformed", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-claim-invalid-state-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), async () => 18449, async () => true);
    const port = 18448;
    const sibling = (protocol: "tcp" | "udp") => registry.reserve({ projectId: "legacy", instanceId: "legacy", invocationId: `legacy-${protocol}`,
      profile: "default", requests: [{ name: "listener", spec: { preferred: port, exact: true, protocol } }] });
    try {
      await registry.reserve({ projectId: "app", instanceId: "abandoned", invocationId: "old", profile: "default",
        requests: [{ name: "api", spec: { preferred: port + 1 } }], proxyListenerPorts: [port] });
      await registry.updateInvocation("old", { state: "starting" });
      const state = JSON.parse(await readFile(registry.filePath, "utf8"));
      state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      state.allocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
      for (const name of ["proxy-routes.json", "proxy-routes.pending.json"]) {
        await writeFile(path.join(dir, name), JSON.stringify({ version: 1, routes: [{ id: "", instanceId: "other", hostname: "other.localhost",
          targetHost: "127.0.0.1", targetPort: port + 1, tls: "off", updatedAt: new Date().toISOString() }] }));
        await registry.reconcile();
        await registry.gc();
        expect((await registry.read()).invocations[0].state).toBe("starting");
        // Unreadable routes cannot prove which target ports they still use.
        for (const protocol of ["tcp", "udp"] as const) {
          await expect(sibling(protocol)).rejects.toMatchObject({ code: "DEVFN_REGISTRY_INVALID" });
        }
        await rm(path.join(dir, name));
      }
      await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: 999999, birthSignature: 42 }));
      await registry.gc();
      await expect(sibling("tcp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
      await rm(path.join(dir, "proxy-owner.json"));
      await registry.reconcile();
      await registry.gc();
      expect((await sibling("udp"))[0].port).toBe(port);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }), 150_000);
  it("claims proxy listeners atomically across TCP and UDP and releases failed claims", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-proxy-"));
    const port = 18443;
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), async () => port + 1, async () => true);
    const request = (instanceId: string, invocationId: string, protocol: "tcp" | "udp", exact = true) =>
      registry.reserve({ projectId: "app", instanceId, invocationId, profile: "default", requests: [{ name: "api", spec: { preferred: port, exact, protocol } }] });
    expect((await request("legacy", "legacy-exact", "tcp"))[0]).toMatchObject({ port, source: "exact" });
    await registry.release({ invocationId: "legacy-exact" });
    expect((await request("legacy", "legacy-preferred", "udp", false))[0]).toMatchObject({ port, source: "preferred" });
    await expect(registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "blocked", profile: "default",
      requests: [], proxyListenerPorts: [port] })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    expect((await registry.read()).invocations.map((item) => item.id)).not.toContain("blocked");
    await registry.release({ invocationId: "legacy-preferred" });
    expect((await request("legacy", "legacy-stable", "udp", false))[0]).toMatchObject({ port, source: "stable" });
    await registry.release({ invocationId: "legacy-stable" });
    await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "proxy-starting", profile: "default",
      requests: [], proxyListenerPorts: [port] });
    await expect(request("sibling", "blocked-tcp", "tcp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    await expect(request("sibling", "blocked-udp", "udp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
    expect((await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "reallocated", profile: "default",
      requests: [{ name: "api", spec: { preferred: port, protocol: "udp", range: [port, port + 1] } }] }))[0].port).toBe(port + 1);
    await registry.release({ invocationId: "reallocated" });
    await registry.recoverInterrupted("proxy");
    expect((await request("legacy", "recovered", "tcp"))[0].port).toBe(port);
  }), 150_000);

  it("keeps an interrupted or failed lifecycle's listener claim until its routes are removed", async () => await withCaddyAdminPort(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-interrupted-claim-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
    const port = await allocateEphemeralPort();
    const routeFile = path.join(dir, "proxy-routes.json");
    const sibling = (id: string) => registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: id, profile: "default",
      requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] });
    try {
      // An activation committed its route, then its command was interrupted.
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "interrupted", profile: "default", requests: [], proxyListenerPorts: [port] });
      await writeFile(routeFile, JSON.stringify({ version: 1, routes: [{ id: "proxy:app", instanceId: "proxy", hostname: "app.localhost",
        targetHost: "127.0.0.1", targetPort: port + 1, tls: "off", updatedAt: new Date().toISOString() }] }));
      await expect(registry.recoverInterrupted("proxy")).resolves.toBe(1);
      expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED", proxyClaimRetained: true });
      await expect(sibling("after-recovery")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "proxy" } });
      // The next lifecycle fails before it reconciles those routes.
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "unprepared", profile: "default", requests: [] });
      await registry.release({ invocationId: "unprepared", errorCode: "DEVFN_ENDPOINT_RESOLUTION_FAILED" });
      await registry.gc();
      await expect(sibling("after-preparation-failure")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "proxy" } });
      // A claiming lifecycle that fails while its routes remain keeps its claim too.
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "rollback", profile: "default", requests: [], proxyListenerPorts: [port] });
      await registry.release({ invocationId: "rollback", errorCode: "DEVFN_PROXY_RELOAD_FAILED" });
      expect((await registry.read()).invocations.find((item) => item.id === "rollback")).toMatchObject({ state: "failed", proxyClaimRetained: true });
      await expect(registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "own-exact", profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT",
        details: { instanceId: "proxy", action: expect.stringContaining("devfn down") } });
      await rm(routeFile);
      expect((await sibling("after-routes-removed"))[0]).toMatchObject({ port, protocol: "udp" });
      expect((await registry.read()).invocations.filter((item) => item.proxyClaimRetained)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }), 150_000);

  it("serializes a proxy claim against a concurrent sibling listener reservation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-proxy-race-"));
    const file = path.join(dir, "registry.json");
    const port = 18444;
    const proxy = new FilePortRegistry(file, async () => port + 1, async () => true);
    const sibling = new FilePortRegistry(file, async () => port + 1, async () => true);
    const results = await Promise.allSettled([
      proxy.reserve({ projectId: "app", instanceId: "proxy", invocationId: "proxy", profile: "default", requests: [], proxyListenerPorts: [port] }),
      sibling.reserve({ projectId: "app", instanceId: "sibling", invocationId: "sibling", profile: "default",
        requests: [{ name: "udp", spec: { preferred: port, exact: true, protocol: "udp" } }] }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "DEVFN_PORT_CONFLICT" } });
    const state = await proxy.read();
    expect(state.invocations).toHaveLength(1);
    expect(state.allocations.some((allocation) => allocation.port === port)).toBe(state.invocations[0].instanceId === "sibling");
  });
  it("gives concurrent worktrees distinct deterministic allocations", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const reserve = (instanceId: string, invocationId: string) => registry.reserve({ projectId: "app", instanceId, invocationId, profile: "default", requests: [{ name: "app", spec: { range: [43000, 43100] } }] });
    const [first, second] = await Promise.all([reserve("worktree-a", "one"), reserve("worktree-b", "two")]);
    expect(first[0].port).not.toBe(second[0].port);
    expect((await registry.read()).revision).toBe(2);
    const freshDir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const repeated = await new FilePortRegistry(path.join(freshDir, "registry.json")).reserve({ projectId: "app", instanceId: "worktree-a", invocationId: "repeat", profile: "default", requests: [{ name: "app", spec: { range: [43000, 43100] } }] });
    expect(repeated[0].port).toBe(first[0].port);
  });

  it("fails closed when an exact reservation is already leased", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const exactPort = await allocateEphemeralPort();
    const input = { projectId: "app", profile: "default", requests: [{ name: "oauth", spec: { preferred: exactPort, exact: true } }] } as const;
    await registry.reserve({ ...input, instanceId: "a", invocationId: "one" });
    await expect(registry.reserve({ ...input, instanceId: "b", invocationId: "two" })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
  });

  it("tracks TCP and UDP leases independently", async () => {
    let exactPort = 0;
    let udp: Awaited<ReturnType<FilePortRegistry["reserve"]>> | undefined;
    for (let attempt = 0; attempt < 20 && !udp; attempt += 1) {
      const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
      const registry = new FilePortRegistry(path.join(dir, "registry.json"));
      exactPort = await allocateEphemeralPort();
      try {
        await registry.reserve({ projectId: "app", instanceId: "tcp", invocationId: `tcp-${attempt}`, profile: "default", requests: [{ name: "tcp", spec: { preferred: exactPort, exact: true, protocol: "tcp" } }] });
        udp = await registry.reserve({ projectId: "app", instanceId: "udp", invocationId: `udp-${attempt}`, profile: "default", requests: [{ name: "udp", spec: { preferred: exactPort, exact: true, protocol: "udp" } }] });
      } catch (error) {
        if ((error as { code?: string }).code !== "DEVFN_PORT_CONFLICT") throw error;
        // Retry only when another process claims either protocol between probes.
      }
    }
    expect(udp?.[0]).toMatchObject({ port: exactPort, protocol: "udp" });
  });

  it("applies project policy ranges and renders them for humans", () => {
    const policy = { version: 1 as const, ports: [{ name: "app-range", range: [45000, 45099] as [number, number], kind: "preferred" as const, project: "app" }] };
    expect(resolvePolicy(policy, "app").preferredRange).toEqual([45000, 45099]);
    expect(renderPolicyInventory(policy)).toContain("45000-45099");
  });

  it("preserves contiguous exact blocks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    let firstPort = 0;
    let allocations: Awaited<ReturnType<typeof registry.reserve>> | undefined;
    for (let attempt = 0; attempt < 20 && !allocations; attempt += 1) {
      firstPort = await allocateEphemeralPort();
      if (firstPort >= 65535 || !await isPortAvailable(firstPort) || !await isPortAvailable(firstPort + 1)) continue;
      allocations = await registry.reserve({
        projectId: "oauth", instanceId: "one", invocationId: `block-${attempt}`, profile: "oauth",
        requests: [
          { name: "callback", spec: { preferred: firstPort, exact: true, block: "oauth" } },
          { name: "issuer", spec: { preferred: firstPort + 1, exact: true, block: "oauth" } },
        ],
      }).catch(() => undefined);
    }
    expect(allocations).toBeDefined();
    expect(allocations!.map((item) => item.port)).toEqual([firstPort, firstPort + 1]);
    expect(allocations!.every((item) => item.source === "exact")).toBe(true);
  });

  it("honors contiguous preferred ports for reallocatable blocks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
    const firstPort = 45_670;
    const allocations = await registry.reserve({
      projectId: "oauth", instanceId: "preferred", invocationId: "preferred-block", profile: "default",
      requests: [
        { name: "callback", spec: { preferred: firstPort, block: "oauth" } },
        { name: "issuer", spec: { preferred: firstPort + 1, block: "oauth" } },
      ],
    });
    expect(allocations.map((item) => item.port)).toEqual([firstPort, firstPort + 1]);
    expect(allocations.every((item) => item.source === "preferred")).toBe(true);
  });

  it("rejects blocks whose assigned ports cannot satisfy every member range", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
    await expect(registry.reserve({
      projectId: "oauth", instanceId: "incompatible", invocationId: "incompatible-block", profile: "default",
      requests: [
        { name: "callback", spec: { range: [5000, 5001], block: "oauth" } },
        { name: "issuer", spec: { range: [6000, 6001], block: "oauth" } },
      ],
    })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
  });

  it("skips registry-leased ports returned by the OS ephemeral allocator", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const leased = await allocateEphemeralPort();
    let replacement = await allocateEphemeralPort();
    while (replacement === leased) replacement = await allocateEphemeralPort();
    const candidates = [leased, replacement];
    const registry = new FilePortRegistry(path.join(dir, "registry.json"), async () => candidates.shift()!);
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "exact", profile: "default", requests: [{ name: "exact", spec: { preferred: leased, exact: true } }] });
    const ephemeral = await registry.reserve({ projectId: "app", instanceId: "two", invocationId: "ephemeral", profile: "default", requests: [{ name: "ephemeral", spec: { ephemeral: true } }] });
    expect(ephemeral[0]).toMatchObject({ port: replacement, source: "ephemeral" });
  });

  it("releases planned leases left by an interrupted instance", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "interrupted", profile: "default", requests: [{ name: "app", spec: { range: [45600, 45699] } }] });
    await expect(registry.recoverInterrupted("one")).resolves.toBe(1);
    const state = await registry.read();
    expect(state.allocations[0].state).toBe("released");
    expect(state.invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  });

  it("fails interrupted planning invocations that reserved no ports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "empty", profile: "default", requests: [] });
    await expect(registry.recoverInterrupted("one")).resolves.toBe(1);
    expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  });

  it("recovers ownerless stale lock directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-lock-"));
    const lockPath = path.join(dir, "registry.lock");
    await mkdir(lockPath);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(withFileLock(lockPath, async () => "acquired", { staleMs: 1, timeoutMs: 1000 })).resolves.toBe("acquired");
  });

  it.skipIf(process.platform !== "darwin")("recovers a stale legacy lock whose PID now belongs to a process started after it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-lock-"));
    const unrelated = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    const saved = process.env.TZ;
    try {
      await new Promise<void>((resolve) => unrelated.once("spawn", () => resolve()));
      const lstart = async (TZ: string) => (await promisify(execFile)("ps", ["-o", "lstart=", "-p", String(unrelated.pid)], { env: { ...process.env, TZ, LC_ALL: "C" } })).stdout.trim();
      const born = Date.parse(`${await lstart("UTC0")} UTC`);
      const birthSignature = `darwin:${await lstart("UTC+1")}`;
      process.env.TZ = "UTC+1";
      // Its legacy text equals this caller's rendering, but the record predates the process.
      const reusedLock = path.join(dir, "reused.lock");
      await mkdir(reusedLock);
      await writeFile(path.join(reusedLock, "owner.json"), JSON.stringify({ token: "old", pid: unrelated.pid, birthSignature, createdAt: new Date(born - 3_600_000 + 5_000).toISOString() }));
      await expect(withFileLock(reusedLock, async () => "acquired", { staleMs: 1, timeoutMs: 2_000 })).resolves.toBe("acquired");
      // An old lock held by the process that recorded it is never taken, in any time zone.
      process.env.TZ = "UTC";
      const heldLock = path.join(dir, "held.lock");
      await mkdir(heldLock);
      await writeFile(path.join(heldLock, "owner.json"), JSON.stringify({ token: "held", pid: unrelated.pid, birthSignature, createdAt: new Date(born + 5_000).toISOString() }));
      await expect(withFileLock(heldLock, async () => "acquired", { staleMs: 1, timeoutMs: 300 })).rejects.toMatchObject({ code: "DEVFN_REGISTRY_LOCK_TIMEOUT" });
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
      try { process.kill(-unrelated.pid!, "SIGKILL"); } catch { /* already stopped */ }
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes planned allocations with the lifecycle heartbeat", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "starting", profile: "default", requests: [{ name: "app", spec: { range: [45100, 45199] } }] });
    const before = (await registry.read()).allocations[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registry.updateInvocation("starting", { state: "starting" });
    expect(Date.parse((await registry.read()).allocations[0].updatedAt)).toBeGreaterThan(Date.parse(before));
  });

  it("does not refresh planned allocations after an invocation becomes terminal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "failed", profile: "default", requests: [{ name: "app", spec: { range: [45200, 45299] } }] });
    const before = (await registry.read()).allocations[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registry.updateInvocation("failed", { state: "failed" });
    const after = await registry.read();
    expect(after.invocations[0].state).toBe("failed");
    expect(after.allocations[0].updatedAt).toBe(before);
  });

  it("counts only verified-dead recorded owners as lifecycle death evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-owner-evidence-"));
    const originalPath = process.env.PATH;
    const dockerState = path.join(dir, "docker-state");
    const age = async () => {
      const state = await registry.read();
      for (const item of [...state.invocations, ...state.allocations]) item.updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
    };
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const server = net.createServer();
    try {
      await writeFile(path.join(dir, "docker"), `#!/bin/sh
case "$(cat "${dockerState}")" in
  running) echo true;;
  gone) echo "Error: No such object: $4" >&2; exit 1;;
  *) echo "Cannot connect to the Docker daemon" >&2; exit 1;;
esac
`, { mode: 0o700 });
      process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;
      const port = await allocateEphemeralPort();
      await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "start", profile: "default", requests: [{ name: "api", spec: { preferred: port, exact: true } }] });
      await registry.updateInvocation("start", { state: "starting" });
      await age();
      // Journaled and launched nothing yet: nothing of it can run.
      expect(await registry.instanceMayRun("one")).toBe(false);
      await registry.beginLaunch("start", "api", { projectName: "devfn-app", composeService: "api", preExisting: false, existingContainerIds: [], runningContainerIds: [] });
      await age();
      // A launch whose identity is not recorded yet is ambiguous.
      expect(await registry.instanceMayRun("one")).toBe(true);
      await registry.recordOwners("start", "api", [{ container: { id: "fixture-container" } }]);
      await age();
      await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
      // An expired planned lease on an occupied port is not stale.
      expect((await registry.reconcile()).allocations[0].state).toBe("externally-occupied");
      for (const [docker, mayRun] of [["running", true], ["unreachable", true], ["gone", false]] as const) {
        await writeFile(dockerState, docker);
        expect(await registry.instanceMayRun("one")).toBe(mayRun);
      }
      await writeFile(dockerState, "running");
      await registry.gc();
      expect(await registry.instanceMayRun("one")).toBe(true);

      // A legacy invocation with no owner journal and no recorded owner proves nothing.
      const state = await registry.read();
      state.invocations.push({ id: "legacy", projectId: "app", instanceId: "legacy", profile: "default", state: "ready", createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" });
      await writeFile(registry.filePath, JSON.stringify(state));
      expect(await registry.instanceMayRun("legacy")).toBe(true);
    } finally {
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "darwin")("keeps a live recorded owner whose birth signature cannot be read as possibly running", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-unverified-owner-"));
    const originalPath = process.env.PATH;
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    try {
      const birthSignature = await processBirthSignature(process.pid);
      expect(birthSignature).toBeTruthy();
      await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "ready", profile: "default", requests: [{ name: "api", spec: { range: [45300, 45399] } }] });
      await registry.markActive("ready", { api: { process: { pid: process.pid, birthSignature: birthSignature! } } });
      // macOS reads birth signatures through ps; a failing ps leaves the live PID unverifiable.
      await writeFile(path.join(dir, "ps"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
      process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;
      expect(await registry.instanceMayRun("one")).toBe(true);
      expect((await registry.reconcile()).allocations[0].state).toBe("active");
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps counting a failed lifecycle's recorded owners through gc until they are verified dead", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-failed-owner-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { stdio: "ignore" });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    try {
      let birthSignature: string | undefined;
      for (let attempt = 0; attempt < 50 && !birthSignature; attempt += 1) {
        birthSignature = await processBirthSignature(child.pid!);
        if (!birthSignature) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(birthSignature).toBeTruthy();
      // The start recorded its node's identity, then stopped before its receipt listed it.
      await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "interrupted", profile: "default", requests: [] });
      await registry.updateInvocation("interrupted", { state: "starting" });
      await registry.beginLaunch("interrupted", "api", { projectName: "devfn-app", composeService: "api", preExisting: false, existingContainerIds: [], runningContainerIds: [] });
      await registry.recordOwners("interrupted", "api", [{ process: { pid: child.pid!, birthSignature: birthSignature! } }]);
      expect(await registry.recoverInterrupted("one")).toBe(1);
      await registry.gc();
      expect((await registry.read()).invocations.map((item) => [item.id, item.state])).toEqual([["interrupted", "failed"]]);
      expect(await registry.instanceMayRun("one")).toBe(true);

      // A handled failure resolved its own launches before it ended.
      await registry.reserve({ projectId: "app", instanceId: "two", invocationId: "handled", profile: "default", requests: [] });
      await registry.beginLaunch("handled", "api", { projectName: "devfn-app", composeService: "api", preExisting: false, existingContainerIds: [], runningContainerIds: [] });
      await registry.release({ invocationId: "handled", errorCode: "DEVFN_START_FAILED" });
      expect(await registry.instanceMayRun("two")).toBe(false);

      child.kill("SIGKILL");
      await exited;
      expect(await registry.instanceMayRun("one")).toBe(false);
      await registry.gc();
      expect((await registry.read()).invocations).toEqual([]);
    } finally {
      child.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the last listener claim through a route-free release while a listener remains on a claimed port", async ({ skip }) => await withCaddyAdminPort(async () => {
    // Retirement needs conclusive listener evidence, which a busy Caddy admin port denies.
    if (!await isPortAvailable(2019, "tcp", "127.0.0.1")) skip("127.0.0.1:2019 is in use, so listener absence cannot be proven on this host.");
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-release-listener-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const port = await allocateEphemeralPort();
    const listener = dgram.createSocket("udp4");
    try {
      // A Caddy whose exit was never confirmed may still hold its HTTP/3 socket.
      await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.bind(port, "127.0.0.1", () => resolve()); });
      await registry.reserve({ projectId: "app", instanceId: "proxy", invocationId: "start", profile: "default", requests: [], proxyListenerPorts: [port] });
      await registry.release({ invocationId: "start", errorCode: "DEVFN_PROXY_RELOAD_FAILED" });
      expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", proxyClaimRetained: true });
      const sibling = async (invocationId: string) => await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId, profile: "default",
        requests: [{ name: "api", spec: { preferred: port, exact: true } }] });
      await expect(sibling("blocked")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "proxy" } });
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      expect((await sibling("accepted"))[0].port).toBe(port);
    } finally {
      await new Promise<void>((resolve) => { try { listener.close(() => resolve()); } catch { resolve(); } });
      await rm(dir, { recursive: true, force: true });
    }
  }));

  it("retires a verified-dead lifecycle's listener claim although a foreign process took its leased port", async ({ skip }) => await withCaddyAdminPort(async () => {
    if (!await isPortAvailable(2019, "tcp", "127.0.0.1")) skip("127.0.0.1:2019 is in use, so listener absence cannot be proven on this host.");
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-dead-claim-foreign-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const foreign = net.createServer();
    try {
      const child = spawn(process.execPath, ["-e", "setTimeout(() => undefined, 200)"], { stdio: "ignore" });
      const birthSignature = await processBirthSignature(child.pid!);
      await new Promise((resolve) => child.once("exit", resolve));
      const appPort = await allocateEphemeralPort();
      let listenerPort = await allocateEphemeralPort();
      while (listenerPort === appPort) listenerPort = await allocateEphemeralPort();
      await registry.reserve({ projectId: "app", instanceId: "dead", invocationId: "dead", profile: "default",
        requests: [{ name: "api", spec: { preferred: appPort, exact: true } }], proxyListenerPorts: [listenerPort] });
      await registry.markActive("dead", { api: { process: { pid: child.pid!, birthSignature: birthSignature ?? "gone" } } });
      const state = await registry.read();
      for (const item of [...state.invocations, ...state.allocations]) item.updatedAt = "2020-01-01T00:00:00.000Z";
      await writeFile(registry.filePath, JSON.stringify(state));
      await new Promise<void>((resolve) => foreign.listen(appPort, "127.0.0.1", resolve));
      const reconciled = await registry.reconcile();
      expect(reconciled.allocations[0].state).toBe("externally-occupied");
      expect(reconciled.invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
      const sibling = await registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: "sibling", profile: "default",
        requests: [{ name: "api", spec: { preferred: listenerPort, exact: true } }] });
      expect(sibling[0].port).toBe(listenerPort);
    } finally {
      if (foreign.listening) await new Promise<void>((resolve) => foreign.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  }));

  it("inspects container owners through their persisted Docker selector", async () => {
    let observedHost: string | undefined;
    let observedArgs: string[] = [];
    await expect(inspectContainerRunning({ id: "remote-id", dockerEnvironment: { DOCKER_HOST: "tcp://remote.example:2376" } }, async (_file, args, options) => {
      observedArgs = args;
      observedHost = options.env.DOCKER_HOST;
      return { stdout: "true\n" };
    })).resolves.toBe(true);
    expect(observedHost).toBe("tcp://remote.example:2376");
    expect(observedArgs).toEqual(["inspect", "--format", "{{.State.Running}}", "remote-id"]);
  });

  it("distinguishes a missing container from an unavailable Docker endpoint", async () => {
    await expect(inspectContainerRunning({ id: "missing" }, async () => { throw Object.assign(new Error("inspect failed"), { stderr: "Error: No such object: missing" }); })).resolves.toBe(false);
    await expect(inspectContainerRunning({ id: "remote" }, async () => { throw Object.assign(new Error("inspect failed"), { stderr: "Cannot connect to the Docker daemon" }); })).resolves.toBeUndefined();
  });

  it("escapes backslashes, pipes, and carriage returns in policy tables", () => {
    const output = renderPolicyInventory({ version: 1, ports: [{ name: "a\\|b\rc", kind: "protected", port: 4100 }] });
    expect(output).toContain("a\\\\\\|b c");
  });
});
