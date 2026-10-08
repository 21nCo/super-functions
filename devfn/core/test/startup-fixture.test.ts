import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { validateDevFnConfig } from "@devfn/config";
import { proxyListenerPorts, proxyOwnerStatus } from "@devfn/proxy";
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

it.skipIf(process.env.DEVFN_REAL_PROXY !== "1")("replaces selected proxy routes when their hostname or TLS changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "devfn-route-replacement-"));
  const stateDir = path.join(root, "state");
  const config = validateDevFnConfig({
    version: 1, project: { id: "route-fixture" }, ports: { native: {} },
    processes: { native: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["native"],
      health: { type: "http", port: "native", timeoutMs: 10_000 }, env: { OBSERVED_FILE: path.join(root, "observed.json") } } },
    profiles: { default: { processes: ["native"], proxy: true } },
    hostnames: { native: { target: "native", hostname: "first.localhost", tls: "off" } },
  });
  const orchestrator = new DevFnOrchestrator();
  try {
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const first = await orchestrator.up({ config, root, stateDir });
    expect(first.routes).toHaveLength(1);
    config.hostnames!.native.hostname = "second.localhost";
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    const second = await orchestrator.up({ config, root, stateDir });
    expect(second.invocationId).not.toBe(first.invocationId);
    expect(second.routes[0].hostname).toContain("second.");
    expect(second.routes[0].hostname).not.toBe(first.routes[0].hostname);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    config.hostnames!.native.target = "missing";
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    await expect(orchestrator.up({ config, root, stateDir })).rejects.toThrow();
    expect((await readReceipt(config, root, second.instanceId))?.invocationId).toBe(second.invocationId);
    config.hostnames!.native.target = "native";
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    config.hostnames!.native.tls = "internal";
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    const third = await orchestrator.up({ config, root, stateDir });
    expect(third.routes[0].tls).toBe("internal");
    config.profiles.default.proxy = false;
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
    const withoutProxy = await orchestrator.up({ config, root, stateDir });
    expect(withoutProxy.routes).toEqual([]);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    await stopFixtureProxy(stateDir);
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

describe("real local startup fixtures", () => {
  it("replaces a native process when an inherited ordinary allowlist value changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-native-env-drift-"));
    const stateDir = path.join(root, "state");
    const oldMode = process.env.MODE;
    const config = validateDevFnConfig({ version: 1, project: { id: "native-env-drift-fixture" }, ports: { native: {} },
      processes: { native: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["native"],
        health: { type: "http", port: "native", timeoutMs: 10_000 }, envAllowlist: ["MODE"],
        env: { OBSERVED_FILE: path.join(root, "observed.json") } } },
      profiles: { default: { processes: ["native"] } } });
    const orchestrator = new DevFnOrchestrator();
    try {
      await writeFile(path.join(root, "server.mjs"), serverScript);
      process.env.MODE = "one";
      const first = await orchestrator.up({ config, root, stateDir });
      expect((await readFile(path.join(root, "observed.json"), "utf8"))).toContain('"mode":"one"');
      process.env.MODE = "two";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const second = await orchestrator.up({ config, root, stateDir });
      expect(second.invocationId).not.toBe(first.invocationId);
      expect((await readFile(path.join(root, "observed.json"), "utf8"))).toContain('"mode":"two"');
    } finally {
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (oldMode === undefined) delete process.env.MODE; else process.env.MODE = oldMode;
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("replaces dotenv-backed config drift while retaining duration-secret rotation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-config-lifecycle-"));
    const stateDir = path.join(root, "state");
    const previousDelay = process.env.DELAY;
    const previousConfig = process.env.APP_CONFIG;
    const source = `services:
  api:
    image: busybox
    network_mode: bridge
    command: [sleep, '3600']
    stop_grace_period: \${DELAY}s
    configs:
      - {source: settings, target: /app/settings.txt}
configs:
  settings: {environment: APP_CONFIG}
`;
    const config = validateDevFnConfig({ version: 1, project: { id: "config-lifecycle-fixture" },
      services: { api: { adapter: "compose", service: "api", envAllowlist: ["DELAY", "APP_CONFIG"], secretEnv: ["DELAY"] } },
      profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    const containers = new Set<string>();
    let projectName: string | undefined;
    try {
      process.env.DELAY = "10";
      delete process.env.APP_CONFIG;
      await writeFile(path.join(root, ".env"), "APP_CONFIG=one\n");
      await writeFile(path.join(root, "compose.yaml"), source);
      const first = await orchestrator.up({ config, root, stateDir });
      projectName = first.services[0].projectName;
      containers.add(first.services[0].containerIds[0]);
      expect((await execFileAsync("docker", ["exec", first.services[0].containerIds[0], "cat", "/app/settings.txt"])).stdout).toBe("one");
      process.env.DELAY = "20";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("20s");
      await writeFile(path.join(root, ".env"), "APP_CONFIG=two\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const second = await orchestrator.up({ config, root, stateDir });
      containers.add(second.services[0].containerIds[0]);
      expect(second.services[0].containerIds[0]).not.toBe(first.services[0].containerIds[0]);
      await expect(execFileAsync("docker", ["inspect", first.services[0].containerIds[0]])).rejects.toThrow();
      expect((await execFileAsync("docker", ["exec", second.services[0].containerIds[0], "cat", "/app/settings.txt"])).stdout).toBe("two");
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api: [invalid\n");
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toThrow();
      expect((await readReceipt(config, root, second.instanceId))?.invocationId).toBe(second.invocationId);
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", second.services[0].containerIds[0]])).stdout.trim()).toBe("true");
    } finally {
      await writeFile(path.join(root, "compose.yaml"), source).catch(() => undefined);
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (previousDelay === undefined) delete process.env.DELAY; else process.env.DELAY = previousDelay;
      if (previousConfig === undefined) delete process.env.APP_CONFIG; else process.env.APP_CONFIG = previousConfig;
      for (const id of containers) await execFileAsync("docker", ["inspect", id]).then(
        () => { throw new Error("Fixture container survived cleanup"); }, () => undefined);
      if (projectName) await execFileAsync("docker", ["network", "rm", `${projectName}_default`]).catch((error: Error) => {
        if (!error.message.includes("not found")) throw error;
      });
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("keeps nested include secret rotation ready and replaces ordinary drift", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-leaf-lifecycle-"));
    const stateDir = path.join(root, "state");
    const leaf = path.join(root, "child", "leaf");
    const oldCustom = process.env.CUSTOM;
    const config = validateDevFnConfig({ version: 1, project: { id: "leaf-lifecycle-fixture" },
      services: { api: { adapter: "compose", service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] } },
      profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    const leafSource = "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    environment:\n      CUSTOM: ${CUSTOM}\n      MODE: ${MODE}\n";
    const observedContainers = new Set<string>();
    try {
      delete process.env.CUSTOM;
      await mkdir(leaf, { recursive: true });
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: child/compose.yaml\n    env_file: child/scope.env\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "include: [leaf/compose.yaml]\n");
      await writeFile(path.join(root, "child", "scope.env"), "MODE=one\n");
      await writeFile(path.join(leaf, ".env"), "CUSTOM=private-one\n");
      await writeFile(path.join(leaf, "compose.yaml"), leafSource);
      const first = await orchestrator.up({ config, root, stateDir });
      observedContainers.add(first.services[0].containerIds[0]);
      const inspect = async (id: string) => JSON.parse((await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", id])).stdout) as string[];
      expect(await inspect(first.services[0].containerIds[0])).toEqual(expect.arrayContaining(["CUSTOM=private-one", "MODE=one"]));
      await writeFile(path.join(leaf, ".env"), "CUSTOM=private-two\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("private-two");
      await writeFile(path.join(root, "child", "scope.env"), "MODE=two\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const second = await orchestrator.up({ config, root, stateDir });
      observedContainers.add(second.services[0].containerIds[0]);
      await expect(execFileAsync("docker", ["inspect", first.services[0].containerIds[0]])).rejects.toThrow();
      expect(second.invocationId).not.toBe(first.invocationId);
      expect(await inspect(second.services[0].containerIds[0])).toEqual(expect.arrayContaining(["CUSTOM=private-two", "MODE=two"]));
      await writeFile(path.join(leaf, "compose.yaml"), "services:\n  api: [invalid\n");
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toThrow();
      expect((await readReceipt(config, root, second.instanceId))?.invocationId).toBe(second.invocationId);
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", second.services[0].containerIds[0]])).stdout.trim()).toBe("true");
    } finally {
      await writeFile(path.join(leaf, "compose.yaml"), leafSource).catch(() => undefined);
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (oldCustom === undefined) delete process.env.CUSTOM;
      else process.env.CUSTOM = oldCustom;
      for (const container of observedContainers) {
        await execFileAsync("docker", ["inspect", container]).then(
          () => { throw new Error("Fixture container survived cleanup"); }, () => undefined);
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("keeps env_file secret aliases private through status and replacement", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-envfile-lifecycle-"));
    const stateDir = path.join(root, "state");
    const envFile = path.join(root, "service.env");
    const oldSecret = process.env.CUSTOM;
    const oldProjectSecret = process.env.API_TOKEN;
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: [sh, -c, 'sleep 3600 # ${MODE} ${CUSTOM}']\n    env_file: service.env\n    environment:\n      API_TOKEN: ${API_TOKEN}\n");
    await writeFile(path.join(root, ".env"), "MODE=one\nAPI_TOKEN=private-one\n");
    await writeFile(envFile, "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=10\nLITERAL=\"\\$HOME\"\nLABEL='one'\n");
    const config = validateDevFnConfig({ version: 1, project: { id: "envfile-lifecycle-fixture" },
      services: { api: { adapter: "compose", service: "api", envAllowlist: ["CUSTOM", "API_TOKEN"], secretEnv: ["CUSTOM", "API_TOKEN"] } },
      profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    process.env.CUSTOM = "10";
    delete process.env.API_TOKEN;
    try {
      const first = await orchestrator.up({ config, root, stateDir });
      const inspect = async (id: string): Promise<string[]> => {
        const result = await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", id]);
        return JSON.parse(result.stdout) as string[];
      };
      expect(await inspect(first.services[0].containerIds[0])).toEqual(expect.arrayContaining(["CUSTOM=10", "ALIAS=prefix-10", "MODE=10", "API_TOKEN=private-one"]));
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("private-one");
      process.env.CUSTOM = "SYNTHETIC_DO_NOT_USE";
      await writeFile(path.join(root, ".env"), "MODE=one\nAPI_TOKEN=SYNTHETIC_DO_NOT_USE\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect((await readReceipt(config, root, first.instanceId))?.invocationId).toBe(first.invocationId);
      await writeFile(path.join(root, ".env"), "MODE=two\nAPI_TOKEN=SYNTHETIC_DO_NOT_USE\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const replacedForMode = await orchestrator.up({ config, root, stateDir });
      expect(replacedForMode.invocationId).not.toBe(first.invocationId);
      await writeFile(envFile, "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=11\nLITERAL=\"\\$HOME\"\nLABEL='one'\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const next = await orchestrator.up({ config, root, stateDir });
      expect(next.invocationId).not.toBe(replacedForMode.invocationId);
      expect(await inspect(next.services[0].containerIds[0])).toEqual(expect.arrayContaining(["CUSTOM=SYNTHETIC_DO_NOT_USE", "ALIAS=prefix-SYNTHETIC_DO_NOT_USE", "MODE=11"]));
      expect(JSON.stringify(await readReceipt(config, root, next.instanceId))).not.toContain("SYNTHETIC_DO_NOT_USE");
      await writeFile(envFile, "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=11\nLITERAL=\"\\$HOME\"\nLABEL='two'\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const quotedEdit = await orchestrator.up({ config, root, stateDir });
      expect(quotedEdit.invocationId).not.toBe(next.invocationId);
      expect(await inspect(quotedEdit.services[0].containerIds[0])).toEqual(expect.arrayContaining(["LABEL=two"]));
    } finally {
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (oldSecret === undefined) delete process.env.CUSTOM;
      else process.env.CUSTOM = oldSecret;
      if (oldProjectSecret === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = oldProjectSecret;
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("keeps ordered env_file credential branches private across replacement", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-ordered-envfile-lifecycle-"));
    const stateDir = path.join(root, "state");
    const source = path.join(root, "compose.yaml");
    const envFile = path.join(root, "service.env");
    const spec = "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    env_file: service.env\n";
    await writeFile(source, spec);
    await writeFile(envFile, "ACTIVATE=yes\nMODE=one\nALIAS=${ACTIVATE:+${API_TOKEN}}-${MODE}\n");
    await writeFile(path.join(root, ".env"), "API_TOKEN=guessable-one\n");
    const config = validateDevFnConfig({ version: 1, project: { id: "ordered-envfile-fixture" },
      services: { api: { adapter: "compose", service: "api" } }, profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    let lastId: string | undefined;
    let projectName: string | undefined;
    try {
      const first = await orchestrator.up({ config, root, stateDir });
      projectName = first.services[0].projectName;
      lastId = first.services[0].containerIds[0];
      const containerEnv = async (id: string): Promise<string[]> => JSON.parse((await execFileAsync("docker",
        ["inspect", "--format", "{{json .Config.Env}}", id])).stdout) as string[];
      expect(await containerEnv(lastId)).toContain("ALIAS=guessable-one-one");
      await writeFile(path.join(root, ".env"), "API_TOKEN=guessable-two\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("guessable-one");
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("guessable-two");
      await writeFile(envFile, "ACTIVATE=yes\nMODE=two\nALIAS=${ACTIVATE:+${API_TOKEN}}-${MODE}\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const next = await orchestrator.up({ config, root, stateDir });
      lastId = next.services[0].containerIds[0];
      expect(next.invocationId).not.toBe(first.invocationId);
      expect(await containerEnv(lastId)).toEqual(expect.arrayContaining(["ALIAS=guessable-two-two", "MODE=two"]));
      await writeFile(source, "services:\n  api: [invalid\n");
      await expect(orchestrator.up({ config, root, stateDir })).rejects.toThrow();
      expect((await readReceipt(config, root, next.instanceId))?.invocationId).toBe(next.invocationId);
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", lastId])).stdout.trim()).toBe("true");
    } finally {
      await writeFile(source, spec).catch(() => undefined);
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (lastId) await execFileAsync("docker", ["inspect", lastId]).then(
        () => { throw new Error("Fixture container survived cleanup"); }, () => undefined);
      if (projectName) await execFileAsync("docker", ["network", "rm", `${projectName}_default`]).catch((error: Error) => {
        if (!error.message.includes("not found")) throw error;
      });
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("keeps an owned Compose container running when a replacement source is invalid", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-replacement-"));
    const stateDir = path.join(root, "state");
    const source = path.join(root, "compose.yaml");
    const original = "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n";
    await writeFile(source, original);
    const config = validateDevFnConfig({ version: 1, project: { id: "replacement-fixture" },
      services: { api: { adapter: "compose", service: "api" } }, profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    let containerId: string | undefined;
    let projectName: string | undefined;
    const observedContainers = new Set<string>();
    try {
      const receipt = await orchestrator.up({ config, root, stateDir });
      projectName = receipt.services[0].projectName;
      containerId = receipt.services[0].containerIds[0];
      observedContainers.add(containerId);
      await writeFile(source, "services:\n  api: [invalid\n");
      await expect(orchestrator.up({ config, root, stateDir }))
        .rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED" });
      const inspection = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", containerId]);
      expect(inspection.stdout.trim()).toBe("true");
      expect((await readReceipt(config, root, receipt.instanceId))?.invocationId).toBe(receipt.invocationId);
      await writeFile(path.join(root, ".env"), "ALIAS=${HOME}\n");
      await writeFile(source, "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    environment:\n      ALIAS: ${ALIAS}\n");
      await expect(orchestrator.up({ config, root, stateDir }))
        .rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED" });
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", containerId])).stdout.trim()).toBe("true");
      expect((await readReceipt(config, root, receipt.instanceId))?.invocationId).toBe(receipt.invocationId);
      await writeFile(path.join(root, ".env"), "A=${HOME}\nB=${A}\nA=safe\nC=${A}\n");
      await writeFile(source, "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    environment:\n      MODE: ${B}${C}\n");
      await expect(orchestrator.up({ config, root, stateDir }))
        .rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED" });
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", containerId])).stdout.trim()).toBe("true");
      expect((await readReceipt(config, root, receipt.instanceId))?.invocationId).toBe(receipt.invocationId);
      await writeFile(path.join(root, ".env"), "SET=yes\nALIAS=${HOME}\n");
      await writeFile(source, "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    environment:\n      MODE: ${SET:-${ALIAS}}\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const replaced = await orchestrator.up({ config, root, stateDir });
      containerId = replaced.services[0].containerIds[0];
      observedContainers.add(containerId);
      expect(JSON.parse((await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", containerId])).stdout) as string[])
        .toContain("MODE=yes");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await writeFile(path.join(root, ".env"), "SET=\nALIAS=${HOME}\n");
      await expect(orchestrator.up({ config, root, stateDir }))
        .rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED" });
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", containerId])).stdout.trim()).toBe("true");
      expect((await readReceipt(config, root, replaced.instanceId))?.invocationId).toBe(replaced.invocationId);
    } finally {
      await writeFile(source, original);
      await writeFile(path.join(root, ".env"), "").catch(() => undefined);
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      for (const id of observedContainers) await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id]).then(
        () => { throw new Error("Fixture container survived cleanup"); }, () => undefined);
      if (projectName) await execFileAsync("docker", ["network", "rm", `${projectName}_default`]).catch((error: Error) => {
        if (!error.message.includes("not found")) throw error;
      });
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("uses a declared profile value for Compose interpolation at startup and status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-profile-env-"));
    const stateDir = path.join(root, "state");
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: [sleep, '3600']\n    environment:\n      WORK_DIR: '${HOME}'\n");
    const config = validateDevFnConfig({ version: 1, project: { id: "profile-env-fixture" },
      services: { api: { adapter: "compose", service: "api" } },
      profiles: { default: { services: ["api"], environment: { HOME: "/tmp/project" } } } });
    const orchestrator = new DevFnOrchestrator();
    try {
      const receipt = await orchestrator.up({ config, root, stateDir });
      expect(receipt.services).toHaveLength(1);
      const observed = await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", receipt.services[0].containerIds[0]]);
      expect(JSON.parse(observed.stdout) as string[]).toContain("WORK_DIR=/tmp/project");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    } finally {
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("keeps secret rotation ready but restarts for a matching literal Compose command edit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-secret-drift-"));
    const stateDir = path.join(root, "state");
    const source = path.join(root, "compose.yaml");
    const oldSecret = process.env.CUSTOM;
    const document = (command: string) => `services:\n  api:\n    image: busybox\n    command: [sh, -c, 'sleep 3600 # ${command}']\n    environment:\n      CUSTOM: \${CUSTOM}\n      SESSION_VALUE: prefix-\${CUSTOM}\n`;
    await writeFile(source, document("10"));
    const config = validateDevFnConfig({ version: 1, project: { id: "secret-drift-fixture" },
      services: { api: { adapter: "compose", service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] } },
      profiles: { default: { services: ["api"] } } });
    const orchestrator = new DevFnOrchestrator();
    process.env.CUSTOM = "10";
    try {
      const first = await orchestrator.up({ config, root, stateDir });
      process.env.CUSTOM = "SYNTHETIC_DO_NOT_USE";
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(JSON.stringify(await readReceipt(config, root, first.instanceId))).not.toContain("SYNTHETIC_DO_NOT_USE");
      process.env.CUSTOM = "20";
      await writeFile(source, document("20"));
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded" });
      const next = await orchestrator.up({ config, root, stateDir });
      expect(next.invocationId).not.toBe(first.invocationId);
      expect(next.services[0].containerIds[0]).not.toBe(first.services[0].containerIds[0]);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    } finally {
      await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
      if (oldSecret === undefined) delete process.env.CUSTOM;
      else process.env.CUSTOM = oldSecret;
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

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

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("rejects quoted and env_file selected sibling URLs before state creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-raw-disjoint-networks-"));
    const stateDir = path.join(root, "state");
    const config = validateDevFnConfig({
      version: 1, project: { id: "raw-disjoint-networks-fixture" }, ports: { web: {} },
      services: {
        web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } },
        consumer: { adapter: "compose", service: "consumer", dependsOn: ["web"] },
      },
      profiles: { default: { services: ["consumer"] } },
    });
    try {
      const common = "services:\n  web:\n    image: busybox\n    networks: [blue]\n  consumer:\n    image: busybox\n    networks: [green]\n";
      const networks = "networks:\n  blue: {}\n  green: {}\n";
      for (const selected of [
        { service: "    environment:\n      UPSTREAM: \"'${DEVFN_URL_WEB}'\"\n", env: "", projectEnv: "" },
        { service: "    env_file: service.env\n", env: "ACTIVATE=yes\nUPSTREAM=${ACTIVATE:+${DEVFN_URL_WEB}}\n", projectEnv: "" },
        { service: "    env_file: service.env\n", env: "ACTIVATE=yes\nUPSTREAM=${ACTIVATE:+${ALIAS}}\n",
          projectEnv: "ALIAS=${DEVFN_URL_WEB}\n" },
      ]) {
        await writeFile(path.join(root, "compose.yaml"), `${common}${selected.service}${networks}`);
        await writeFile(path.join(root, "service.env"), selected.env);
        await writeFile(path.join(root, ".env"), selected.projectEnv);
        await expect(new DevFnOrchestrator().up({ config, root, stateDir }))
          .rejects.toThrow(/no shared effective Compose network/);
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

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
      const originalTmpdir = process.env.TMPDIR;
      try {
        process.env.TMPDIR = root;
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      } finally {
        if (originalTmpdir === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = originalTmpdir;
      }
      if (withProxy) {
        const hostname = config.hostnames!.native;
        hostname.tls = hostname.tls === "off" ? "internal" : "off";
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
        hostname.tls = withTls ? "internal" : "off";
        hostname.hostname = "changed.localhost";
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
        delete hostname.hostname;
        config.profiles.default.proxy = false;
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
        config.profiles.default.proxy = true;
        expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      }
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
      if (withProxy) {
        const port = withTls ? proxyListenerPorts().httpsPort : proxyListenerPorts().httpPort;
        expect(receipt.urls.native).toBe(`${withTls ? "https" : "http"}://${resolveLocalHostname(undefined, "native", "endpoint-fixture", owner, ".test.localhost")}${port === (withTls ? 443 : 80) ? "" : `:${port}`}`);
      }
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
await writeFile("/observed/web.json", JSON.stringify({ url: process.env.OBSERVED_URL, port: process.env.OBSERVED_PORT, mode: process.env.OBSERVED_MODE, extra: process.env.EXTRA }));
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
    env_file: web.env
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
    await writeFile(path.join(root, "web.env"), "\uFEFFEXTRA='one'\n");
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
      expect(web).toEqual({ url: "http://web:8080", port: String(webPort), mode: "service", extra: "one" });
      expect(consumer).toEqual({ upstream: "http://web:8080", port: String(webPort), response: 200 });
      expect(native.argv[0]).toBe(`http://127.0.0.1:${webPort}`);
      expect(native.upstream).toBe(`http://127.0.0.1:${webPort}`);
      expect(native.mode).toBe("node");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await writeFile(path.join(root, "web.env"), "EXTRA='one'\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await writeFile(path.join(root, "web.env"), "\uFEFFEXTRA=${HOME}\n");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") })).rejects.toThrow();
      expect((await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", receipt.services[0].containerIds[0]])).stdout.trim()).toBe("true");
      await writeFile(path.join(root, "web.env"), "\uFEFFEXTRA='one'\n");
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
      if (withProxy) {
        const port = withTls ? proxyListenerPorts().httpsPort : proxyListenerPorts().httpPort;
        expect(receipt.urls.web).toBe(`${withTls ? "https" : "http"}://${resolveLocalHostname("web.localhost", "web", "compose-endpoint-fixture", owner)}${port === (withTls ? 443 : 80) ? "" : `:${port}`}`);
      }
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
