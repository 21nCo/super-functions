import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({ hidden: false }));
vi.mock("../src/listeners.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/listeners.js")>();
  return {
    ...actual,
    // A non-dumpable owner (setcap Caddy on Linux) is invisible to same-user
    // socket inspection even though inspection itself succeeds.
    scanListenerState: async (includeDocker?: boolean) => scan.hidden
      ? { listeners: [], inspection: { tcp: true, udp: true, docker: false } }
      : await actual.scanListenerState(includeDocker),
  };
});

import { processBirthSignature } from "@devfn/processes";
import { allocateEphemeralPort, FilePortRegistry, isPortAvailable, withFileLock } from "../src/index.js";

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

const sibling = (registry: FilePortRegistry, port: number, id: string) => registry.reserve({ projectId: "app", instanceId: "sibling", invocationId: id,
  profile: "default", requests: [{ name: "api", spec: { preferred: port, exact: true, protocol: "udp" } }] });

async function listen(server: net.Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen({ port, host, ipv6Only: host.includes(":") }, resolve));
}

it("retains an abandoned claim whose loopback listener is hidden from successful socket inspection", async () => {
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
});

it("retains a privileged-port claim while a hidden listener still accepts", async () => {
  // macOS lets unprivileged processes bind privileged ports on the wildcard
  // address only; unprivileged Linux cannot, so there the fixture cannot
  // create the hidden listener it needs.
  let port: number | undefined;
  for (const candidate of [1023, 1022, 1021]) if (await isPortAvailable(candidate, "tcp", "0.0.0.0")) { port = candidate; break; }
  if (port === undefined) return;
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
