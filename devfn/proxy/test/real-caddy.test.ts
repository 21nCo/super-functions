import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { renderCaddyfile, type ProxyRoute } from "../src/index.js";

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

async function request(port: number, host: string, requestPath: string, secure = false): Promise<{ status: number; body: string; certificate?: string }> {
  return await new Promise((resolve, reject) => {
    const client = secure ? https : http;
    const call = client.request({ hostname: "127.0.0.1", port, path: requestPath, method: "GET", headers: { Host: host },
      ...(secure ? { servername: host, rejectUnauthorized: false } : {}) }, (response) => {
      let body = "";
      const certificate = secure ? (response.socket as import("node:tls").TLSSocket).getPeerCertificate().subjectaltname : undefined;
      response.on("data", (chunk) => { body += String(chunk); });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body,
        ...(secure ? { certificate } : {}) }));
    });
    call.on("error", reject);
    call.end();
  });
}

it.skipIf(process.env.DEVFN_REAL_PROXY !== "1")("observes isolated Caddy exact, prefix, strip, denial and internal TLS requests", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "devfn-caddy-contract-"));
  const [exact, prefix, secure] = await Promise.all([upstream(), upstream(), upstream()]);
  const [httpPort, httpsPort, adminPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const route = (id: string, hostname: string, targetPort: number, tls: "off" | "internal", routePath = "/", match: "exact" | "prefix" = "prefix", stripPrefix = false): ProxyRoute =>
    ({ id, instanceId: "fixture", hostname, targetHost: "127.0.0.1", targetPort, tls, updatedAt: "now", path: routePath, match, stripPrefix });
  const routes = [route("prefix", "app.localhost", prefix.port, "off", "/api", "prefix", true),
    route("exact", "app.localhost", exact.port, "off", "/api", "exact"), route("tls", "secure.localhost", secure.port, "internal")];
  const config = renderCaddyfile(routes).replace("admin 127.0.0.1:2019", `admin 127.0.0.1:${adminPort}\n  http_port ${httpPort}\n  https_port ${httpsPort}`);
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
    expect(await request(httpPort, "app.localhost", "/apix")).toMatchObject({ status: 404 });
    expect(await request(httpPort, "app.localhost", "/api%2fx")).toMatchObject({ status: 400 });
    expect(await request(httpPort, "unselected.localhost", "/api")).toMatchObject({ status: 404 });
    let tlsResponse: Awaited<ReturnType<typeof request>> | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      tlsResponse = await request(httpsPort, "secure.localhost", "/", true).catch(() => undefined);
      if (tlsResponse) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(tlsResponse, log.slice(-3000)).toMatchObject({ status: 200, body: "/", certificate: expect.stringContaining("secure.localhost") });
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
    await Promise.all([exact.server, prefix.server, secure.server].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await rm(stateDir, { recursive: true, force: true });
  }
}, 30_000);
