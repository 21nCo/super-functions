import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { validateDevFnConfig } from "@devfn/config";
import { describe, expect, it } from "vitest";

import { DevFnOrchestrator } from "../src/index.js";

const execFileAsync = promisify(execFile);

const serverScript = `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
const upstream = process.argv[2];
if (upstream && upstream !== process.env.DEVFN_URL_NATIVE && !(await fetch(upstream + "/health")).ok) throw new Error("upstream unavailable");
await writeFile(process.env.OBSERVED_FILE, JSON.stringify({
  port: process.env.DEVFN_PORT_NATIVE,
  url: process.env.DEVFN_URL_NATIVE,
  upstream: process.env.UPSTREAM_URL,
  mode: process.env.MODE,
  argv: process.argv.slice(2),
  host: process.env.HOST,
}));
if (process.env.SECRET_TOKEN) console.log(process.env.SECRET_TOKEN);
createServer((request, response) => { response.writeHead(!process.env.EXPECTED_HEALTH_PATH || request.url === process.env.EXPECTED_HEALTH_PATH ? 200 : 404); response.end("ok"); })
  .listen(Number(process.env.DEVFN_PORT_NATIVE), "127.0.0.1");
`;

describe("real local startup fixtures", () => {
  it("passes resolved URL, port and literal argv to a native process before readiness", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-native-endpoint-"));
    const observed = path.join(root, "observed.json");
    const originalSecret = process.env.SECRET_TOKEN;
    const secret = `private-${Date.now()}-credential`;
    process.env.SECRET_TOKEN = secret;
    const config = validateDevFnConfig({
      version: 1, project: { id: "endpoint-fixture" },
      ports: { native: {} },
      processes: { native: {
        adapter: "command", command: [process.execPath, "server.mjs", "{{env.DEVFN_URL_NATIVE}}", "literal $HOME `id` ; & |"],
        ports: ["native"], health: { type: "http", port: "native", url: "http://route-not-yet-installed.localhost/health?probe=1", timeoutMs: 15_000 },
        env: { OBSERVED_FILE: observed, UPSTREAM_URL: "{{env.DEVFN_URL_NATIVE}}", EXPECTED_HEALTH_PATH: "/health?probe=1", MODE: "node" },
        envAllowlist: ["SECRET_TOKEN"], secretEnv: ["SECRET_TOKEN"],
      } },
      profiles: { default: { processes: ["native"], environment: { MODE: "profile" } } },
    });
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const orchestrator = new DevFnOrchestrator();
    let started = false;
    try {
      const receipt = await orchestrator.up({ config, root, stateDir: path.join(root, "state") });
      started = true;
      const observation = JSON.parse(await readFile(observed, "utf8"));
      expect(observation).toMatchObject({ port: String(receipt.allocations[0].port), url: `http://127.0.0.1:${receipt.allocations[0].port}`, host: "127.0.0.1", mode: "node" });
      expect(observation.argv).toEqual([observation.url, "literal $HOME `id` ; & |"]);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      await expect(orchestrator.up({ config, root, stateDir: path.join(root, "state") })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
      expect(await readFile(receipt.environmentOutputs[0], "utf8")).toContain(`DEVFN_URL_NATIVE=http://127.0.0.1:${receipt.allocations[0].port}`);
      expect(JSON.stringify(receipt)).not.toContain(secret);
      expect(await readFile(receipt.processes[0].logPath, "utf8")).not.toContain(secret);
    } finally {
      if (started) await orchestrator.down({ config, root, stateDir: path.join(root, "state") });
      if (originalSecret === undefined) delete process.env.SECRET_TOKEN;
      else process.env.SECRET_TOKEN = originalSecret;
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("passes resolved values to Compose interpolation and wires a native dependent to its leased endpoint", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-compose-endpoint-"));
    const observed = path.join(root, "observed");
    await mkdir(observed);
    await writeFile(path.join(root, "web.mjs"), `import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
await writeFile("/observed/web.json", JSON.stringify({ url: process.env.OBSERVED_URL, port: process.env.OBSERVED_PORT, mode: process.env.OBSERVED_MODE }));
createServer((request, response) => { response.writeHead(request.url === "/health?probe=1" || request.url === "/health" ? 200 : 404); response.end("ok"); }).listen(8080, "0.0.0.0");
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
      OBSERVED_URL: "\${DEVFN_URL_WEB}"
      OBSERVED_PORT: "\${DEVFN_PORT_WEB}"
      OBSERVED_MODE: "\${MODE}"
`);
    await writeFile(path.join(root, "server.mjs"), serverScript);
    const config = validateDevFnConfig({
      version: 1, project: { id: "compose-endpoint-fixture" },
      ports: { web: {}, native: {} },
      services: { web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web", url: "http://route-not-yet-installed.localhost/health?probe=1", timeoutMs: 30_000 }, env: { MODE: "service" } } },
      processes: { native: { adapter: "command", command: [process.execPath, "server.mjs", "{{env.DEVFN_URL_WEB}}"], ports: ["native"], dependsOn: ["web"], health: { type: "http", port: "native", timeoutMs: 30_000 }, env: { OBSERVED_FILE: path.join(root, "native.json"), UPSTREAM_URL: "{{env.DEVFN_URL_WEB}}", MODE: "node" } } },
      profiles: { default: { processes: ["native"], environment: { MODE: "profile" } } },
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
      const native = JSON.parse(await readFile(path.join(root, "native.json"), "utf8"));
      expect(web).toEqual({ url: `http://127.0.0.1:${webPort}`, port: String(webPort), mode: "service" });
      expect(native.argv[0]).toBe(web.url);
      expect(native.upstream).toBe(web.url);
      expect(native.mode).toBe("node");
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready" });
    } finally {
      if (started) await orchestrator.down({ config, root, stateDir: path.join(root, "state") });
      if (composeProjectName) await execFileAsync("docker", ["network", "rm", `${composeProjectName}_default`]);
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
