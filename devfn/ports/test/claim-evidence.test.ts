import dgram from "node:dgram";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({ hidden: false, deniedUdpPort: 0, freeUdpPort: 0, firewalledPort: 0 }));
vi.mock("../src/listeners.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/listeners.js")>();
  return {
    ...actual,
    // An unprivileged process cannot bind a privileged UDP port, so that
    // bind proves nothing about a hidden HTTP/3 listener there.
    bindProbe: async (port: number, protocol?: "tcp" | "udp", host?: string) => {
      if (protocol === "udp" && port === scan.deniedUdpPort) return "denied" as const;
      // A privileged user's UDP bind of a free privileged port.
      if (protocol === "udp" && port === scan.freeUdpPort) return "available" as const;
      return await actual.bindProbe(port, protocol, host);
    },
    // A firewall rule that refuses connections to a port with a listener.
    connectionRefused: async (port: number, host?: string, timeoutMs?: number) => port === scan.firewalledPort || await actual.connectionRefused(port, host, timeoutMs),
    // A non-dumpable owner (setcap Caddy on Linux) is invisible to same-user
    // socket inspection even though inspection itself succeeds.
    scanListenerState: async (includeDocker?: boolean) => scan.hidden
      ? { listeners: [], inspection: { tcp: true, udp: true, docker: false } }
      : await actual.scanListenerState(includeDocker),
  };
});

import { processBirthSignature } from "@devfn/processes";
import { allocateEphemeralPort, connectionRefused, FilePortRegistry, isPortAvailable, withFileLock } from "../src/index.js";

const withCaddyAdminPort = async <T>(action: () => Promise<T>): Promise<T> =>
  await withFileLock(path.join(tmpdir(), "devfn-test-caddy-admin.lock"), action, { timeoutMs: 120_000 });

async function abandonedClaim(dir: string, port: number): Promise<FilePortRegistry> {
  const registry = new FilePortRegistry(path.join(dir, "registry.json"), undefined, async () => true);
  await registry.reserve({ projectId: "app", instanceId: "abandoned", invocationId: "old", profile: "default", requests: [], proxyListenerPorts: [port] });
  await registry.updateInvocation("old", { state: "starting" });
  const state = await registry.read();
  state.invocations[0].updatedAt = "2020-01-01T00:00:00.000Z";
  await writeFile(registry.filePath, JSON.stringify(state));
  return registry;
}

const sibling = (registry: FilePortRegistry, port: number, id: string, protocol: "tcp" | "udp" = "udp") => registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: id,
  profile: "default", requests: [{ name: "api", spec: { preferred: port, exact: true, protocol } }] });

async function serveAdminConfig(config: () => unknown): Promise<http.Server> {
  const admin = http.createServer((_request, response) => response.end(JSON.stringify(config())));
  await new Promise<void>((resolve, reject) => admin.once("error", reject).listen(2019, "127.0.0.1", resolve));
  return admin;
}

async function listen(server: net.Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen({ port, host, ipv6Only: host.includes(":") }, resolve));
}

it("retains an abandoned claim whose loopback listener is hidden from successful socket inspection", async () => await withCaddyAdminPort(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-hidden-claim-"));
  const port = await allocateEphemeralPort();
  const listener = net.createServer((socket) => socket.destroy());
  scan.hidden = true;
  try {
    const registry = await abandonedClaim(dir, port);
    const hosts = await isPortAvailable(0, "tcp", "::1") ? ["127.0.0.1", "::1"] : ["127.0.0.1"];
    for (const host of hosts) {
      await listen(listener, port, host);
      await expect(sibling(registry, port, `bound-${host}`)).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
      expect((await registry.read()).invocations[0].state).toBe("starting");
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    expect((await sibling(registry, port, "free"))[0]).toMatchObject({ port, protocol: "udp" });
    expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  } finally {
    scan.hidden = false;
    if (listener.listening) await new Promise<void>((resolve) => listener.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}), 150_000);

it("retains an abandoned claim while a hidden HTTP/3 UDP listener remains on either loopback family", async () => await withCaddyAdminPort(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-hidden-udp-claim-"));
  const port = await allocateEphemeralPort();
  scan.hidden = true;
  let socket: dgram.Socket | undefined;
  try {
    const registry = await abandonedClaim(dir, port);
    const hosts = await isPortAvailable(0, "tcp", "::1") ? ["::1", "127.0.0.1"] : ["127.0.0.1"];
    for (const host of hosts) {
      socket = dgram.createSocket(host.includes(":") ? "udp6" : "udp4");
      await new Promise<void>((resolve, reject) => socket!.once("error", reject).bind(port, host, resolve));
      // TCP on both families refuses and binds; only Caddy's UDP socket remains.
      await expect(sibling(registry, port, `tcp-${host}`, "tcp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
      expect((await registry.read()).invocations[0].state).toBe("starting");
      await new Promise<void>((resolve) => socket!.close(() => resolve()));
      socket = undefined;
    }
    expect((await sibling(registry, port, "free", "tcp"))[0]).toMatchObject({ port, protocol: "tcp" });
  } finally {
    scan.hidden = false;
    socket?.close();
    await rm(dir, { recursive: true, force: true });
  }
}), 150_000);

it("keeps a privileged claim whose UDP bind is denied unless a verified owner's configuration excludes the port", async () => await withCaddyAdminPort(async () => {
  const hosts = await isPortAvailable(0, "tcp", "::1") ? ["127.0.0.1", "::1"] : ["127.0.0.1"];
  let port: number | undefined;
  for (let candidate = 1023; candidate > 900 && port === undefined; candidate -= 1) {
    if ((await Promise.all(hosts.map(async (host) => await connectionRefused(candidate, host)))).every(Boolean)) port = candidate;
  }
  if (port === undefined) throw new Error("No refused privileged loopback port is available for the fixture.");
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-privileged-udp-claim-"));
  let config: unknown = { apps: { http: { servers: { srv0: { listen: [`127.0.0.1:${port}`] } } } } };
  let admin: http.Server | undefined;
  scan.hidden = true;
  scan.deniedUdpPort = port;
  try {
    const registry = await abandonedClaim(dir, port);
    // No owner: a refused TCP connection says nothing about UDP.
    await expect(sibling(registry, port, "ownerless", "tcp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    const birthSignature = await processBirthSignature(process.pid);
    expect(birthSignature).toBeTruthy();
    await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    admin = await serveAdminConfig(() => config);
    await expect(sibling(registry, port, "configured", "tcp")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    expect((await registry.read()).invocations[0].state).toBe("starting");
    config = { apps: { http: { servers: {} } } };
    expect((await sibling(registry, port, "excluded", "tcp"))[0]).toMatchObject({ port, protocol: "tcp" });
    expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  } finally {
    scan.hidden = false;
    scan.deniedUdpPort = 0;
    if (admin?.listening) await new Promise<void>((resolve) => admin!.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}), 150_000);

// macOS lets unprivileged processes bind privileged ports on the wildcard
// address only; unprivileged Linux cannot, so there these fixtures cannot
// create the hidden privileged listener they need.
const NO_PRIVILEGED_WILDCARD = "No privileged wildcard port is bindable by this user (unprivileged Linux); the hidden privileged listener cannot be created.";
async function privilegedWildcardPort(): Promise<number | undefined> {
  for (let candidate = 1023; candidate > 900; candidate -= 1) if (await isPortAvailable(candidate, "tcp", "0.0.0.0")) return candidate;
  return undefined;
}

it("retains a privileged-port claim while a hidden listener still accepts", async ({ skip }) => {
  const port = await privilegedWildcardPort();
  if (port === undefined) skip(NO_PRIVILEGED_WILDCARD);
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-hidden-privileged-claim-"));
  const listener = net.createServer((socket) => socket.destroy());
  scan.hidden = true;
  try {
    const registry = await abandonedClaim(dir, port);
    await listen(listener, port, "0.0.0.0");
    await expect(sibling(registry, port, "bound")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    expect((await registry.read()).invocations[0].state).toBe("starting");
  } finally {
    scan.hidden = false;
    if (listener.listening) await new Promise<void>((resolve) => listener.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

it("retains a privileged-port claim when a firewall refuses connections to its hidden listener", async ({ skip }) => await withCaddyAdminPort(async () => {
  const port = await privilegedWildcardPort();
  if (port === undefined) skip(NO_PRIVILEGED_WILDCARD);
  if (!await isPortAvailable(2019, "tcp", "127.0.0.1")) skip("127.0.0.1:2019 is in use, so listener absence cannot be proven on this host.");
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-firewalled-claim-"));
  const listener = net.createServer((socket) => socket.destroy());
  scan.hidden = true;
  scan.freeUdpPort = port!;
  scan.firewalledPort = port!;
  try {
    const registry = await abandonedClaim(dir, port!);
    await listen(listener, port!, "0.0.0.0");
    // Every TCP connection is refused and UDP binds, yet the TCP listener
    // remains; a refused connection alone never retires the claim.
    await expect(sibling(registry, port!, "firewalled")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    expect((await registry.read()).invocations[0].state).toBe("starting");
  } finally {
    scan.hidden = false;
    scan.freeUdpPort = 0;
    scan.firewalledPort = 0;
    if (listener.listening) await new Promise<void>((resolve) => listener.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}), 150_000);

it("retires a claim under a live verified owner only when its admin configuration has no listener on the port", async () => await withCaddyAdminPort(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-owner-config-claim-"));
  const port = await allocateEphemeralPort();
  let config: unknown = { apps: { http: { servers: { srv0: { listen: [`127.0.0.1:${port}`, `[::1]:${port}`] } } } } };
  let status = 200;
  const admin = http.createServer((_request, response) => { response.writeHead(status); response.end(JSON.stringify(config)); });
  scan.hidden = true;
  try {
    const registry = await abandonedClaim(dir, port);
    const birthSignature = await processBirthSignature(process.pid);
    expect(birthSignature).toBeTruthy();
    await writeFile(path.join(dir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    await new Promise<void>((resolve, reject) => admin.once("error", reject).listen(2019, "127.0.0.1", resolve));
    // The owner's configuration still names the port; a listener there may
    // be hidden even when every probe of it looks free.
    await expect(sibling(registry, port, "configured")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    status = 500;
    await expect(sibling(registry, port, "unreadable")).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT", details: { instanceId: "abandoned" } });
    expect((await registry.read()).invocations[0].state).toBe("starting");
    status = 200;
    config = { apps: { http: { servers: { srv0: { listen: [`127.0.0.1:${port + 1}`] } } } } };
    expect((await sibling(registry, port, "unconfigured"))[0]).toMatchObject({ port, protocol: "udp" });
    expect((await registry.read()).invocations[0]).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
  } finally {
    scan.hidden = false;
    if (admin.listening) await new Promise<void>((resolve) => admin.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}), 150_000);
