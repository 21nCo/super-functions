import { execFileSync, spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { isPortAvailable, withFileLock } from "@devfn/ports";
import { CaddyProxyController, proxyListenerPorts, renderCaddyfile, type ProxyRoute } from "../src/index.js";

// Fixtures that need the fixed Caddy admin port 127.0.0.1:2019 free share one
// machine-wide lock with other DevFn packages' fixtures that bind it.
const withCaddyAdminPort = async <T>(action: () => Promise<T>): Promise<T> =>
  await withFileLock(path.join(os.tmpdir(), "devfn-test-caddy-admin.lock"), action, { timeoutMs: 120_000 });

/** Stop a DevFn-started Caddy: its process group on POSIX, the process on Windows. */
function stopOwnerGroup(pid: number): void {
  process.kill(process.platform === "win32" ? pid : -pid, "SIGTERM");
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function upstream(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((request, response) => { response.end(request.url); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, port: typeof address === "object" && address ? address.port : 0 };
}

/** Caddy's internal root, which verifies its internal TLS certificates; it exists once Caddy created its CA. */
async function internalRoot(dataHome: string): Promise<string | undefined> {
  return await readFile(path.join(dataHome, "caddy", "pki", "authorities", "local", "root.crt"), "utf8").catch(() => undefined);
}

/**
 * Request through Caddy. With trusted roots the request uses TLS and verifies
 * the served chain and hostname against only those roots.
 */
async function request(port: number, host: string, requestPath: string, trustedRoots?: string): Promise<{ status: number; body: string; certificate?: string; location?: string }> {
  const secure = trustedRoots !== undefined;
  return await new Promise((resolve, reject) => {
    const client = secure ? https : http;
    const call = client.request({ hostname: "127.0.0.1", port, path: requestPath, method: "GET", headers: { Host: host },
      ...(secure ? { servername: host, ca: trustedRoots } : {}) }, (response) => {
      let body = "";
      const certificate = secure ? (response.socket as import("node:tls").TLSSocket).getPeerCertificate().subjectaltname : undefined;
      response.on("data", (chunk) => { body += String(chunk); });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body, location: response.headers.location,
        ...(secure ? { certificate } : {}) }));
    });
    call.on("error", reject);
    call.end();
  });
}

it.skipIf(process.env.DEVFN_REAL_PROXY !== "1")("observes isolated Caddy exact, prefix, strip, denial and internal TLS requests", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "devfn-caddy-contract-"));
  const certificateFile = path.join(stateDir, "registered-cert.pem");
  const keyFile = path.join(stateDir, "registered-key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
    "-days", "1", "-subj", "/CN=explicit.dev.example.test", "-addext", "subjectAltName=DNS:explicit.dev.example.test"], { stdio: "ignore" });
  const [exact, prefix, secure] = await Promise.all([upstream(), upstream(), upstream()]);
  const listenerPorts = new Set<number>();
  while (listenerPorts.size < 3) listenerPorts.add(await freePort());
  const [httpPort, httpsPort, adminPort] = [...listenerPorts];
  const route = (id: string, hostname: string, targetPort: number, tls: "off" | "internal", routePath = "/", match: "exact" | "prefix" = "prefix", stripPrefix = false): ProxyRoute =>
    ({ id, instanceId: "fixture", hostname, targetHost: "127.0.0.1", targetPort, tls, updatedAt: "now", path: routePath, match, stripPrefix });
  const routes = [route("prefix", "app.localhost", prefix.port, "off", "/api", "prefix", true),
    route("exact", "app.localhost", exact.port, "off", "/api", "exact"), route("tls", "secure.localhost", secure.port, "internal"),
    { ...route("registered", "explicit.dev.example.test", secure.port, "internal"), tls: "certificate" as const,
      registeredDomain: "dev.example.test", certificateFile, keyFile }];
  const config = renderCaddyfile(routes, false, { httpPort, httpsPort }).replace("admin 127.0.0.1:2019", `admin 127.0.0.1:${adminPort}`);
  const configPath = path.join(stateDir, "Caddyfile");
  await writeFile(configPath, config);
  const child = spawn("caddy", ["run", "--config", configPath, "--adapter", "caddyfile"], { env: { ...process.env, XDG_DATA_HOME: path.join(stateDir, "data"), XDG_CONFIG_HOME: path.join(stateDir, "config") }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (chunk) => { log += String(chunk); });
  child.stderr.on("data", (chunk) => { log += String(chunk); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      ready = await fetch(`http://127.0.0.1:${adminPort}/config/`, { signal: AbortSignal.timeout(200) }).then(() => true).catch(() => false);
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ready, log).toBe(true);
    expect(log).not.toContain("installing root certificate");
    expect(await request(httpPort, "app.localhost", "/api")).toMatchObject({ status: 200, body: "/api" });
    expect(await request(httpPort, "app.localhost", "/api/v1")).toMatchObject({ status: 200, body: "/v1" });
    expect(await request(httpPort, "app.localhost", "/API/v1")).toMatchObject({ status: 200, body: "/v1" });
    expect(() => renderCaddyfile([...routes, route("shadow", "app.localhost", exact.port, "off", "/API/", "prefix")])).toThrow(/Ambiguous route/);
    expect(await request(httpPort, "app.localhost", "/apix")).toMatchObject({ status: 404 });
    expect(await request(httpPort, "app.localhost", "/api%2fx")).toMatchObject({ status: 400 });
    expect(await request(httpPort, "unselected.localhost", "/api")).toMatchObject({ status: 404 });
    expect(await request(httpPort, `secure.localhost:${httpPort}`, "/")).toMatchObject({ status: 308, location: `https://secure.localhost${httpsPort === 443 ? "" : `:${httpsPort}`}/` });
    expect(config).toContain(`https_port ${httpsPort}`);
    expect(await request(httpPort, "unselected.localhost", "/")).toMatchObject({ status: 404 });
    let tlsResponse: Awaited<ReturnType<typeof request>> | undefined;
    const dataHome = path.join(stateDir, "data");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const root = await internalRoot(dataHome);
      tlsResponse = root ? await request(httpsPort, "secure.localhost", "/", root).catch(() => undefined) : undefined;
      if (tlsResponse) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(tlsResponse, log.slice(-3000)).toMatchObject({ status: 200, body: "/", certificate: expect.stringContaining("secure.localhost") });
    expect(await request(httpPort, "explicit.dev.example.test", "/")).toMatchObject({ status: 308 });
    // The explicit certificate is self-signed, so it is its own trusted root.
    expect(await request(httpsPort, "explicit.dev.example.test", "/", await readFile(certificateFile, "utf8"))).toMatchObject({
      status: 200, body: "/", certificate: expect.stringContaining("explicit.dev.example.test"),
    });
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
    await Promise.all([exact.server, prefix.server, secure.server].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await rm(stateDir, { recursive: true, force: true });
  }
}, 30_000);

it.skipIf(process.env.DEVFN_REAL_PROXY !== "1")("does not commit a fresh internal-TLS Caddy that fails to bind its HTTPS listener", async () => await withCaddyAdminPort(async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "devfn-caddy-bind-"));
  const original = { XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  const { httpsPort } = proxyListenerPorts();
  const target = await upstream();
  const blocker = net.createServer((socket) => socket.destroy());
  const proxy = new CaddyProxyController(stateDir);
  const secure: Omit<ProxyRoute, "updatedAt"> = { id: "secure", instanceId: "fixture", hostname: "secure.localhost", targetHost: "127.0.0.1", targetPort: target.port, tls: "internal" };
  try {
    // Fresh storage makes Caddy create its internal CA during startup, after
    // its admin endpoint already answers.
    process.env.XDG_DATA_HOME = path.join(stateDir, "data");
    process.env.XDG_CONFIG_HOME = path.join(stateDir, "config");
    expect(await isPortAvailable(2019)).toBe(true);
    await new Promise<void>((resolve, reject) => blocker.once("error", reject).listen(httpsPort, "127.0.0.1", resolve));
    await expect(proxy.upsert([secure])).rejects.toMatchObject({ code: "DEVFN_PROXY_RELOAD_FAILED" });
    await expect(access(path.join(stateDir, "proxy-routes.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(stateDir, "proxy-owner.json"))).rejects.toMatchObject({ code: "ENOENT" });
    for (let attempt = 0; attempt < 50 && !await isPortAvailable(2019); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await isPortAvailable(2019)).toBe(true);
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    const activated = await proxy.upsert([secure]);
    expect(await proxy.instanceRoutesLive("fixture", activated)).toBe(true);
    let live: Awaited<ReturnType<typeof request>> | undefined;
    // Caddy issues the internal certificate asynchronously after startup.
    for (let attempt = 0; attempt < 30 && !live; attempt += 1) {
      const root = await internalRoot(process.env.XDG_DATA_HOME!);
      live = root ? await request(httpsPort, "secure.localhost", "/live", root).catch(() => undefined) : undefined;
      if (!live) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(live).toMatchObject({ status: 200, body: "/live" });
    const { pid } = JSON.parse(await readFile(path.join(stateDir, "proxy-owner.json"), "utf8")) as { pid: number };
    stopOwnerGroup(pid);
    for (let attempt = 0; attempt < 50 && !await isPortAvailable(2019); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await proxy.instanceRoutesLive("fixture", activated)).toBe(false);
  } finally {
    if (blocker.listening) await new Promise<void>((resolve) => blocker.close(() => resolve()));
    try { stopOwnerGroup((JSON.parse(await readFile(path.join(stateDir, "proxy-owner.json"), "utf8")) as { pid: number }).pid); } catch { /* stopped */ }
    for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await new Promise<void>((resolve) => target.server.close(() => resolve()));
    await rm(stateDir, { recursive: true, force: true });
  }
// The admin-port lock may wait up to two minutes before the fixture's own work.
}), 240_000);
