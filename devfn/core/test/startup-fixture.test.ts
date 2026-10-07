import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { validateDevFnConfig } from "@devfn/config";
import { proxyOwnerStatus } from "@devfn/proxy";
import { describe, expect, it } from "vitest";

import { DevFnOrchestrator, readReceipt, resolveInstanceIdentity, resolveLocalHostname, writeReceipt } from "../src/index.js";

const execFileAsync = promisify(execFile);

async function stopFixtureProxy(stateDir: string): Promise<void> {
  const raw = await readFile(path.join(stateDir, "proxy-owner.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!raw) return;
  const owner = JSON.parse(raw) as { pid: number; birthSignature?: string };
  if (await proxyOwnerStatus(owner) !== "active") return;
  try { process.kill(owner.pid, "SIGTERM"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  for (let attempt = 0; attempt < 20 && await proxyOwnerStatus(owner) === "active"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (await proxyOwnerStatus(owner) === "active") throw new Error(`Fixture Caddy process ${owner.pid} did not stop.`);
}

const serverScript = `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
const upstream = process.argv[2];
if (upstream && upstream !== process.env.DEVFN_URL_NATIVE && !(await fetch(upstream + "/health")).ok) throw new Error("upstream unavailable");
const server = createServer((request, response) => { response.writeHead(!process.env.EXPECTED_HEALTH_PATH || request.url === process.env.EXPECTED_HEALTH_PATH ? 200 : 404); response.end("ok"); });
await new Promise((resolve) => server.listen(Number(process.env.DEVFN_PORT_NATIVE), process.env.HOST || "127.0.0.1", resolve));
await writeFile(process.env.OBSERVED_FILE, JSON.stringify({
  port: process.env.DEVFN_PORT_NATIVE,
  url: process.env.DEVFN_URL_NATIVE,
  upstream: process.env.UPSTREAM_URL,
  mode: process.env.MODE,
  profileOnly: process.env.PROFILE_ONLY,
  argv: process.argv.slice(2),
  host: process.env.HOST,
  boundHost: server.address().address,
  devfnHost: process.env.DEVFN_HOST,
  inheritedSecretPresent: Boolean(process.env.DB_PRIVATE_KEY),
}));
if (process.env.SECRET_TOKEN) console.log(process.env.SECRET_TOKEN);
`;

describe("real local startup fixtures", () => {
  it("avoids prelock Docker config calls when the selected graph has no sibling URL reference", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-preflight-"));
    const originalPath = process.env.PATH;
    const originalLog = process.env.TEST_DOCKER_LOG;
    try {
      const bin = path.join(root, "bin");
      const log = path.join(root, "docker-calls.log");
      await mkdir(bin);
      await writeFile(path.join(bin, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_DOCKER_LOG"
case " $* " in
  *" config "*) printf '%s\\n' '{"services":{"api":{"image":"busybox","networks":{"default":null}}},"networks":{"default":{"name":"fixture_default"}}}' ;;
  *" version "*) printf '%s\\n' 'Docker Compose version v2.24.4' ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n");
      process.env.PATH = `${bin}:${originalPath ?? ""}`;
      process.env.TEST_DOCKER_LOG = log;
      const config = validateDevFnConfig({ version: 1, project: { id: "compose-preflight-fixture" },
        services: { api: { adapter: "compose", service: "api", envAllowlist: ["TEST_DOCKER_LOG"] } },
        profiles: { default: { services: ["api"] } } });
      await expect(new DevFnOrchestrator().up({ config, root, stateDir: path.join(root, "state") })).rejects.toThrow();
      const calls = (await readFile(log, "utf8")).split("\n").filter(Boolean);
      expect(calls.filter((call) => call.includes(" config --format json"))).toHaveLength(2);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalLog === undefined) delete process.env.TEST_DOCKER_LOG;
      else process.env.TEST_DOCKER_LOG = originalLog;
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("rejects disjoint effective Compose networks before state creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-disjoint-networks-"));
    const stateDir = path.join(root, "state");
    try {
      await writeFile(path.join(root, "compose.yaml"), `services:
  web:
    image: busybox
    networks: [blue]
  consumer:
    image: busybox
    networks: [green]
networks:
  blue: {}
  green: {}
`);
      const config = validateDevFnConfig({
        version: 1, project: { id: "disjoint-networks-fixture" }, ports: { web: {} },
        services: {
          web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } },
          consumer: { adapter: "compose", service: "consumer", dependsOn: ["web"], env: { UPSTREAM: "{{env.DEVFN_URL_WEB}}" } },
        },
        profiles: { default: { services: ["consumer"] } },
      });
      await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/no shared effective Compose network/);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);

  it("starts a public native process with explicit HOST only after authorization", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-public-host-"));
    const stateDir = path.join(root, "state");
    const observed = path.join(root, "observed.json");
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const config = validateDevFnConfig({
      version: 1, project: { id: "public-host-fixture" }, ports: { native: {} },
      processes: { native: { adapter: "command", command: [process.execPath, "server.mjs"], exposure: "public", ports: ["native"], health: { type: "http", port: "native", timeoutMs: 10_000 }, env: { HOST: "0.0.0.0", OBSERVED_FILE: observed } } },
      profiles: { default: { processes: ["native"] } },
    });
    const orchestrator = new DevFnOrchestrator();
    let started = false;
    try {
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED" });
      const receipt = await orchestrator.up({ config, root, stateDir, allowPublic: true });
      started = true;
      expect(receipt.processes).toHaveLength(1);
      expect(JSON.parse(await readFile(observed, "utf8"))).toMatchObject({ host: "0.0.0.0", boundHost: "0.0.0.0" });
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    } finally {
      if (started) await orchestrator.down({ config, root, stateDir });
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it("degrades an old receipt after a selected port is added, then cleans up and restarts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-port-replan-"));
    const stateDir = path.join(root, "state");
    await writeFile(path.join(root, "server.mjs"), `import { createServer } from "node:http";
for (const key of ["DEVFN_PORT_WEB", "DEVFN_PORT_EXTRA"]) {
  if (process.env[key]) createServer((_request, response) => { response.writeHead(200); response.end("ready"); }).listen(Number(process.env[key]), "127.0.0.1");
}
`);
    const config = (extra: boolean) => validateDevFnConfig({
      version: 1, project: { id: "replan-fixture" }, ports: { web: {}, ...(extra ? { extra: {} } : {}) },
      processes: { web: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["web", ...(extra ? ["extra"] : [])], health: { type: "http", port: "web", timeoutMs: 10_000 } } },
      profiles: { default: { processes: ["web"] } },
    });
    const original = config(false);
    const changed = config(true);
    const orchestrator = new DevFnOrchestrator();
    let active = original;
    try {
      const old = await orchestrator.up({ config: original, root, stateDir });
      expect(await orchestrator.status({ config: changed, root })).toMatchObject({ state: "degraded", ok: false });
      const next = await orchestrator.up({ config: changed, root, stateDir });
      active = changed;
      expect(next.invocationId).not.toBe(old.invocationId);
      expect(next.allocations).toHaveLength(2);
      expect(await orchestrator.status({ config: changed, root })).toMatchObject({ state: "ready", ok: true });
      expect(old.processes[0].pid).not.toBe(next.processes[0].pid);
    } finally {
      await orchestrator.down({ config: active, root, stateDir }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it("passes resolved URL, port and literal argv to a native process before readiness", async () => {
    const withProxy = process.env.DEVFN_REAL_PROXY === "1";
    const withTls = withProxy && process.env.DEVFN_REAL_TLS === "1";
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-native-endpoint-"));
    const originalSecret = process.env.SECRET_TOKEN;
    const originalDbSecret = process.env.DB_PRIVATE_KEY;
    const originalPgSecret = process.env.PGPASSWORD;
    try {
    const observed = path.join(root, "observed.json");
    const owner = (await resolveInstanceIdentity("endpoint-fixture", root)).instanceId;
    if (withProxy) await writeFile(path.join(root, "policy.json"), JSON.stringify({ version: 1, hostnameSuffix: ".test.localhost" }));
    const secret = `private-${Date.now()}-credential`;
    process.env.SECRET_TOKEN = secret;
    process.env.DB_PRIVATE_KEY = secret;
    process.env.PGPASSWORD = secret;
    const config = validateDevFnConfig({
      version: 1, project: { id: "endpoint-fixture" },
      ports: { native: {} },
      processes: { native: {
        adapter: "command", command: [process.execPath, "server.mjs", "{{env.DEVFN_URL_NATIVE}}", "literal $HOME `id` ; & |", "{{env.HOST}}", "{{env.DEVFN_HOST}}"],
        ports: ["native"], health: { type: "http", port: "native", url: `${withTls ? "https" : "http"}://${withProxy ? resolveLocalHostname(undefined, "native", "endpoint-fixture", owner, ".test.localhost") : "route-not-yet-installed.localhost"}/health?probe=1`, timeoutMs: 15_000 },
        env: { OBSERVED_FILE: observed, UPSTREAM_URL: "{{env.DEVFN_URL_NATIVE}}", EXPECTED_HEALTH_PATH: "/health?probe=1", MODE: "node" },
        envAllowlist: ["SECRET_TOKEN", "DB_PRIVATE_KEY", "PGPASSWORD"], secretEnv: ["SECRET_TOKEN", "DB_PRIVATE_KEY", "PGPASSWORD"],
      } },
      profiles: { default: { processes: ["native"], environment: { MODE: "profile", PROFILE_ONLY: "first" }, proxy: withProxy } },
      environmentOutputs: [{ path: ".devfn/generated.env" }],
      ...(withProxy ? { policy: "policy.json", hostnames: { native: { target: "native", tls: withTls ? "internal" : "off" } } } : {}),
    });
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const orchestrator = new DevFnOrchestrator();
    let started = false;
    try {
      const receipt = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      started = true;
      const observation = JSON.parse(await readFile(observed, "utf8"));
      expect(observation).toMatchObject({ port: String(receipt.allocations[0].port), url: `http://127.0.0.1:${receipt.allocations[0].port}`, host: "127.0.0.1", devfnHost: "127.0.0.1", mode: "node", profileOnly: "first", inheritedSecretPresent: true });
      expect(observation.argv).toEqual([observation.url, "literal $HOME `id` ; & |", "127.0.0.1", "127.0.0.1"]);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      process.env.SECRET_TOKEN = `${secret}-rotated`;
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      process.env.SECRET_TOKEN = secret;
      config.processes!.native.envAllowlist!.push("ADDED_TOKEN");
      config.processes!.native.secretEnv!.push("ADDED_TOKEN");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      config.processes!.native.envAllowlist!.pop();
      config.processes!.native.secretEnv!.pop();
      config.ports!.native.exposure = "public";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      delete config.ports!.native.exposure;
      config.ports!.native.range = [receipt.allocations[0].port, receipt.allocations[0].port];
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      delete config.ports!.native.range;
      const nativePort = config.ports!.native;
      nativePort.exact = true;
      nativePort.preferred = receipt.allocations[0].port === 65535 ? 65534 : receipt.allocations[0].port + 1;
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      delete nativePort.exact;
      delete nativePort.preferred;
      const fingerprints = receipt.startupFingerprints;
      const portFingerprints = receipt.portSpecFingerprints;
      delete receipt.startupFingerprints;
      delete receipt.portSpecFingerprints;
      await writeReceipt(receipt);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") }))
        .rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      receipt.startupFingerprints = fingerprints;
      receipt.portSpecFingerprints = portFingerprints;
      await writeReceipt(receipt);
      config.processes!.native.command!.push("--db-password=synthetic-sentinel");
      const rejectedStatus = await orchestrator.status({ config, root });
      expect(rejectedStatus).toMatchObject({ ok: false, state: "degraded", urls: {} });
      expect(JSON.stringify(rejectedStatus)).not.toContain("synthetic-sentinel");
      const rejectedRetry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
      expect(rejectedRetry).toMatch(/secret channel/);
      expect(rejectedRetry).not.toContain("synthetic-sentinel");
      config.processes!.native.command!.pop();
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, owner))).not.toContain("synthetic-sentinel");
      expect(await readFile(observed, "utf8")).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.environmentOutputs[0], "utf8")).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain("synthetic-sentinel");
      config.processes!.native.env!.DB_PRIVATE_KEY = "synthetic-sentinel";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      const rejectedLiteral = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
      expect(rejectedLiteral).toMatch(/secret/);
      expect(rejectedLiteral).not.toContain("synthetic-sentinel");
      delete config.processes!.native.env!.DB_PRIVATE_KEY;
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, owner))).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.environmentOutputs[0], "utf8")).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain("synthetic-sentinel");
      for (const key of ["DBPWD", "dbPwd", "DBAUTHKEY", "DBKEY", "DBAUTH", "dbAuth", "DBKey", "DBAuth", "DBPwd", "DbKey", "dbKEY", "dbkey", "DB_PASS", "DBSIG", "DBSig", "DbSig", "apiPass", "USER_SIG", "PGPASSWORD", "PHPSESSID", "GITHUB_PAT"]) {
        config.processes!.native.env![key] = "synthetic-sentinel";
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
        const failedRetry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
        expect(failedRetry).toMatch(/secret/);
        expect(failedRetry).not.toContain("synthetic-sentinel");
        delete config.processes!.native.env![key];
      }
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, owner))).not.toContain("synthetic-sentinel");
      expect(await readFile(observed, "utf8")).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.environmentOutputs[0], "utf8")).not.toContain("synthetic-sentinel");
      expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain("synthetic-sentinel");
      config.processes!.native.command!.push("--header=Authorization: Bearer synthetic-sentinel");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      const headerRetry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
      expect(headerRetry).toMatch(/secret channel/);
      expect(headerRetry).not.toContain("synthetic-sentinel");
      config.processes!.native.command!.pop();
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, owner))).not.toContain("synthetic-sentinel");
      expect(await readFile(observed, "utf8")).not.toContain("synthetic-sentinel");
      for (const vector of [["-Hauthorization: Bearer synthetic-sentinel"], ["-HAuthor%69zation: Bearer synthetic-sentinel"], ["--proxy-header", "Authorization: Bearer synthetic-sentinel"],
        ["--user", "alice:synthetic-sentinel"], ["--user=alice:synthetic-sentinel"], ["-u", "alice:synthetic-sentinel"],
        ["--data-urlencode", "password=synthetic-sentinel"], ["--data-urlencode=password%3Dsynthetic-sentinel"], ["-F", "api_token=synthetic-sentinel"],
        ["--data-raw", '{"pass\\u0077ord":"synthetic-sentinel"}'], ["--data-raw", '{"payload":[{"api_token":"synthetic-sentinel"}]}'],
        ["--data-raw", '<request xmlns:x="urn:x" note=">" x:password="synthetic-sentinel"/>'],
        ["--data-raw", '{"note":"<!--"}<request><password>synthetic-sentinel</password></request>'],
        ["https://outer.example.test/?next=https://alice:synthetic-sentinel@inner.example.test/path"],
        ["https://outer.example.test/?next=https%3A%2F%2Falice%3Asynthetic-sentinel%40inner.example.test%2Fpath"],
        ["X-Config:password=synthetic-sentinel"], ["{password=synthetic-sentinel}"], ["FOO=PGPASSWORD=synthetic-sentinel"],
        ["--env", "PHPSESSID=synthetic-sentinel"], ["--env", "GITHUB_PAT"], ["--build-arg", "DB_PASSWORD"]]) {
        config.processes!.native.command!.push(...vector);
        const status = await orchestrator.status({ config, root });
        expect(status).toMatchObject({ ok: false, state: "degraded", urls: {} });
        expect(JSON.stringify(status)).not.toContain("synthetic-sentinel");
        const retry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
        expect(retry).toMatch(/secret channel/);
        expect(retry).not.toContain("synthetic-sentinel");
        config.processes!.native.command!.splice(-vector.length);
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
        expect(JSON.stringify(await readReceipt(config, root, owner))).not.toContain("synthetic-sentinel");
        expect(await readFile(observed, "utf8")).not.toContain("synthetic-sentinel");
        expect(await readFile(receipt.environmentOutputs[0], "utf8")).not.toContain("synthetic-sentinel");
        expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain("synthetic-sentinel");
      }
      if (withProxy) expect(receipt.urls.native).toBe(`${withTls ? "https" : "http"}://${resolveLocalHostname(undefined, "native", "endpoint-fixture", owner, ".test.localhost")}`);
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      config.profiles.default.environment = { MODE: "profile", PROFILE_ONLY: "second" };
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const profileRestart = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      expect(profileRestart.processes[0].pid).not.toBe(receipt.processes[0].pid);
      expect(JSON.parse(await readFile(observed, "utf8")).profileOnly).toBe("second");
      config.processes!.native.command![3] = "changed literal $HOME `id` ; & |";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const argvRestart = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      expect(argvRestart.processes[0].pid).not.toBe(profileRestart.processes[0].pid);
      expect(JSON.parse(await readFile(observed, "utf8")).argv[1]).toBe("changed literal $HOME `id` ; & |");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(await readFile(receipt.environmentOutputs[0], "utf8")).toContain(`DEVFN_URL_NATIVE=http://127.0.0.1:${receipt.allocations[0].port}`);
      expect(JSON.stringify(receipt)).not.toContain(secret);
      expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain(secret);
    } finally {
      if (started) await orchestrator.down({ config, root, stateDir: path.join(root, "state") });
      if (withProxy) await stopFixtureProxy(path.join(root, "state"));
    }
    } finally {
      if (originalSecret === undefined) delete process.env.SECRET_TOKEN;
      else process.env.SECRET_TOKEN = originalSecret;
      if (originalDbSecret === undefined) delete process.env.DB_PRIVATE_KEY;
      else process.env.DB_PRIVATE_KEY = originalDbSecret;
      if (originalPgSecret === undefined) delete process.env.PGPASSWORD;
      else process.env.PGPASSWORD = originalPgSecret;
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("passes resolved values to Compose siblings and a native dependent before routes exist", async () => {
    const withProxy = process.env.DEVFN_REAL_PROXY === "1";
    const withTls = withProxy && process.env.DEVFN_REAL_TLS === "1";
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-endpoint-"));
    const owner = (await resolveInstanceIdentity("compose-endpoint-fixture", root)).instanceId;
    const observed = path.join(root, "observed");
    await mkdir(observed);
    await writeFile(path.join(root, "web.mjs"), `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
await writeFile("/observed/web.json", JSON.stringify({ url: process.env.OBSERVED_URL, port: process.env.OBSERVED_PORT, mode: process.env.OBSERVED_MODE }));
createServer((request, response) => { response.writeHead(request.url === "/health?probe=1" || request.url === "/health" ? 200 : 404); response.end("ok"); }).listen(8080, process.env.HOST);
`);
    await writeFile(path.join(root, "consumer.mjs"), `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
const response = await fetch(process.env.UPSTREAM_URL + "/health");
if (!response.ok) throw new Error("Compose sibling unavailable");
await writeFile("/observed/consumer.json", JSON.stringify({ upstream: process.env.UPSTREAM_URL, port: process.env.DEVFN_PORT_WEB, response: response.status }));
createServer((_request, response) => { response.writeHead(200); response.end("ok"); }).listen(8081, "0.0.0.0");
`);
    await writeFile(path.join(root, "compose.yaml"), `services:
  web:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - ./web.mjs:/app/web.mjs:ro
      - ./observed:/observed
    command: ["node", "/app/web.mjs"]
    environment:
      HOST: "\${HOST}"
      OBSERVED_URL: "\${DEVFN_URL_WEB}"
      OBSERVED_PORT: "\${DEVFN_PORT_WEB}"
      OBSERVED_MODE: "\${MODE}"
  consumer:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - ./consumer.mjs:/app/consumer.mjs:ro
      - ./observed:/observed
    command: ["node", "/app/consumer.mjs"]
    environment:
      UPSTREAM_URL: "\${DEVFN_URL_WEB}"
      DEVFN_PORT_WEB: "\${DEVFN_PORT_WEB}"
`);
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const config = validateDevFnConfig({
      version: 1, project: { id: "compose-endpoint-fixture" },
      ports: { web: {}, consumer: {}, native: {} },
      services: {
        web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web", url: `${withTls ? "https" : "http"}://${withProxy ? resolveLocalHostname("web.localhost", "web", "compose-endpoint-fixture", owner) : "route-not-yet-installed.localhost"}/health?probe=1`, timeoutMs: 30_000 }, env: { HOST: "0.0.0.0", MODE: "service" } },
        consumer: { adapter: "compose", service: "consumer", ports: { consumer: 8081 }, dependsOn: ["web"], health: { type: "command", command: [process.execPath, "-e", "Promise.all([fetch(process.argv[1] + '/health'), fetch(process.env.HEALTH_UPSTREAM + '/health')]).then((responses) => { if (responses.some((response) => !response.ok)) process.exitCode = 1; }).catch(() => { process.exitCode = 1; });", "{{env.DEVFN_URL_WEB}}"], timeoutMs: 30_000 }, env: { HEALTH_UPSTREAM: "{{env.DEVFN_URL_WEB}}" } },
      },
      processes: { native: { adapter: "command", command: [process.execPath, "server.mjs", "{{env.DEVFN_URL_WEB}}"], ports: ["native"], dependsOn: ["consumer"], health: { type: "http", port: "native", timeoutMs: 30_000 }, env: { OBSERVED_FILE: path.join(root, "native.json"), UPSTREAM_URL: "{{env.DEVFN_URL_WEB}}", MODE: "node" } } },
      profiles: { default: { processes: ["native"], environment: { MODE: "profile" }, proxy: withProxy } },
      ...(withProxy ? { hostnames: { web: { target: "web", hostname: "web.localhost", tls: withTls ? "internal" : "off" } } } : {}),
    });
    const orchestrator = new DevFnOrchestrator();
    let started = false;
    let composeProjectName: string | undefined;
    try {
      const receipt = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      started = true;
      composeProjectName = receipt.services[0].projectName;
      const webPort = receipt.allocations.find((item) => item.service === "web")!.port;
      const web = JSON.parse(await readFile(path.join(observed, "web.json"), "utf8"));
      const consumer = JSON.parse(await readFile(path.join(observed, "consumer.json"), "utf8"));
      const native = JSON.parse(await readFile(path.join(root, "native.json"), "utf8"));
      expect(web).toEqual({ url: "http://web:8080", port: String(webPort), mode: "service" });
      expect(consumer).toEqual({ upstream: "http://web:8080", port: String(webPort), response: 200 });
      expect(native.argv[0]).toBe(`http://127.0.0.1:${webPort}`);
      expect(native.upstream).toBe(`http://127.0.0.1:${webPort}`);
      expect(native.mode).toBe("node");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      const networkSource = path.join(root, "compose.yaml");
      const sharedSource = await readFile(networkSource, "utf8");
      await writeFile(networkSource, sharedSource.replace('      DEVFN_PORT_WEB: "${DEVFN_PORT_WEB}"\n', '      DEVFN_PORT_WEB: "${DEVFN_PORT_WEB}"\n    networks: [isolated]\n') + '\nnetworks:\n  isolated: {}\n');
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") })).rejects.toThrow(/no shared effective Compose network/);
      await writeFile(networkSource, sharedSource);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      config.services!.web.env!.CHECK_URL = "http://example.test/?db_password=synthetic-sentinel";
      const rejectedStatus = await orchestrator.status({ config, root });
      expect(rejectedStatus).toMatchObject({ ok: false, state: "degraded", urls: {} });
      expect(JSON.stringify(rejectedStatus)).not.toContain("synthetic-sentinel");
      const rejectedRetry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
      expect(rejectedRetry).toMatch(/secret channel/);
      expect(rejectedRetry).not.toContain("synthetic-sentinel");
      delete config.services!.web.env!.CHECK_URL;
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, (await resolveInstanceIdentity(config.project.id, root)).instanceId))).not.toContain("synthetic-sentinel");
      expect(await readFile(path.join(observed, "web.json"), "utf8")).not.toContain("synthetic-sentinel");
      for (const service of receipt.services) {
        const log = await execFileAsync("docker", ["logs", service.containerIds[0]]);
        expect(log.stdout + log.stderr).not.toContain("synthetic-sentinel");
      }
      config.services!.web.env!.DB_PRIVATE_KEY = "synthetic-sentinel";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      const rejectedLiteral = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
      expect(rejectedLiteral).toMatch(/secret/);
      expect(rejectedLiteral).not.toContain("synthetic-sentinel");
      delete config.services!.web.env!.DB_PRIVATE_KEY;
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, (await resolveInstanceIdentity(config.project.id, root)).instanceId))).not.toContain("synthetic-sentinel");
      expect(await readFile(path.join(observed, "web.json"), "utf8")).not.toContain("synthetic-sentinel");
      for (const service of receipt.services) {
        const log = await execFileAsync("docker", ["logs", service.containerIds[0]]);
        expect(log.stdout + log.stderr).not.toContain("synthetic-sentinel");
      }
      for (const key of ["DBPWD", "dbPwd", "DBAUTHKEY", "DBKEY", "DBAUTH", "dbAuth", "DBKey", "DBAuth", "DBPwd", "DbKey", "dbKEY", "dbkey"]) {
        config.services!.web.env![key] = "synthetic-sentinel";
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
        const failedRetry = await orchestrator.up({ config, root, stateDir: path.join(root, "state") }).then(() => "", (error: Error) => error.message);
        expect(failedRetry).toMatch(/secret/);
        expect(failedRetry).not.toContain("synthetic-sentinel");
        delete config.services!.web.env![key];
      }
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, (await resolveInstanceIdentity(config.project.id, root)).instanceId))).not.toContain("synthetic-sentinel");
      expect(await readFile(path.join(observed, "web.json"), "utf8")).not.toContain("synthetic-sentinel");
      for (const service of receipt.services) {
        const log = await execFileAsync("docker", ["logs", service.containerIds[0]]);
        expect(log.stdout + log.stderr).not.toContain("synthetic-sentinel");
      }
      if (withProxy) expect(receipt.urls.web).toBe(`${withTls ? "https" : "http"}://${resolveLocalHostname("web.localhost", "web", "compose-endpoint-fixture", owner)}`);
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      config.services!.web.env!.MODE = "service-next";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const restarted = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      expect(restarted.services[0].containerIds[0]).not.toBe(receipt.services[0].containerIds[0]);
      expect(JSON.parse(await readFile(path.join(observed, "web.json"), "utf8")).mode).toBe("service-next");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      const composeFile = path.join(root, "compose.yaml");
      await writeFile(composeFile, (await readFile(composeFile, "utf8")).replace('OBSERVED_MODE: "${MODE}"', 'OBSERVED_MODE: "source-next"'));
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      const sourceRestarted = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      expect(sourceRestarted.services[0].containerIds[0]).not.toBe(restarted.services[0].containerIds[0]);
      expect(JSON.parse(await readFile(path.join(observed, "web.json"), "utf8")).mode).toBe("source-next");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    } finally {
      if (started) await orchestrator.down({ config, root, stateDir: path.join(root, "state") });
      if (withProxy) await stopFixtureProxy(path.join(root, "state"));
      if (composeProjectName) await execFileAsync("docker", ["network", "rm", `${composeProjectName}_default`]);
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("starts independent Compose projects with only their own reachable URLs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-independent-compose-"));
    const stateDir = path.join(root, "state");
    const observed = path.join(root, "observed");
    await mkdir(observed);
    await writeFile(path.join(root, "service.mjs"), `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
let ready = false;
const server = createServer((request, response) => { response.writeHead(request.url === "/internal" || ready ? 200 : 503); response.end("ready"); });
server.listen(8080, "0.0.0.0", async () => {
  const response = await fetch(process.env.SELF_URL + "/internal");
  if (!response.ok) throw new Error("own Compose URL is unreachable");
  await writeFile("/observed/" + process.env.SERVICE_NAME + ".json", JSON.stringify({ url: process.env.SELF_URL, port: process.env.SELF_PORT, status: response.status }));
  ready = true;
});
`);
    await writeFile(path.join(root, "compose.yaml"), `services:
  alpha:
    image: node:22-alpine
    working_dir: /app
    volumes: ["./service.mjs:/app/service.mjs:ro", "./observed:/observed"]
    command: ["node", "/app/service.mjs"]
    environment:
      SERVICE_NAME: alpha
      SELF_URL: "\${DEVFN_URL_ALPHA:-}"
      SELF_PORT: "\${DEVFN_PORT_ALPHA:-}"
  beta:
    image: node:22-alpine
    working_dir: /app
    volumes: ["./service.mjs:/app/service.mjs:ro", "./observed:/observed"]
    command: ["node", "/app/service.mjs"]
    environment:
      SERVICE_NAME: beta
      SELF_URL: "http://beta:8080"
      SELF_PORT: "\${DEVFN_PORT_BETA:-}"
`);
    const config = validateDevFnConfig({
      version: 1, project: { id: "independent-compose" }, ports: { alpha: {}, beta: {} },
      services: {
        alpha: { adapter: "compose", service: "alpha", projectName: "alpha", ports: { alpha: 8080 }, health: { type: "http", port: "alpha", timeoutMs: 30_000 } },
        beta: { adapter: "compose", service: "beta", projectName: "beta", ports: { beta: 8080 }, dependsOn: ["alpha"], health: { type: "command", command: [process.execPath, "-e", "Promise.all([fetch(process.argv[1]), fetch('http://127.0.0.1:' + process.argv[2])]).then((responses) => { if (responses.some((response) => !response.ok)) process.exitCode = 1; }).catch(() => { process.exitCode = 1; });", "{{env.DEVFN_URL_ALPHA}}", "{{env.DEVFN_PORT_BETA}}"], timeoutMs: 30_000 } },
      },
      profiles: { default: { services: ["alpha", "beta"] } },
    });
    const orchestrator = new DevFnOrchestrator();
    let projects: string[] = [];
    try {
      const receipt = await orchestrator.up({ config, root, stateDir });
      projects = receipt.services.map((service) => service.projectName);
      expect(new Set(projects).size).toBe(2);
      for (const name of ["alpha", "beta"] as const) {
        const actual = JSON.parse(await readFile(path.join(observed, `${name}.json`), "utf8"));
        expect(actual).toEqual({ url: `http://${name}:8080`, port: String(receipt.allocations.find((port) => port.service === name)!.port), status: 200 });
      }
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
    } finally {
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      const identity = await resolveInstanceIdentity(config.project.id, root);
      const journaled = await readReceipt(config, root, identity.instanceId);
      for (const project of new Set([...projects, ...(journaled?.services.map((service) => service.projectName) ?? [])])) {
        await execFileAsync("docker", ["network", "rm", `${project}_default`]).catch(() => undefined);
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
