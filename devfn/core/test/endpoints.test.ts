import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateDevFnConfig, type DevFnConfig } from "@devfn/config";
import { describe, expect, it } from "vitest";

import { createPlan, DevFnOrchestrator, resolveEndpointTemplates, resolveLocalHostname } from "../src/index.js";

const fixture = (): DevFnConfig => validateDevFnConfig({
  version: 1, project: { id: "fixture" },
  ports: { api: {}, worker: {} },
  processes: {
    api: { adapter: "command", command: ["node", "server.mjs", "{{env.DEVFN_PORT_API}}"], ports: ["api"], health: { type: "http", port: "api" } },
    worker: { adapter: "command", command: ["node", "worker.mjs", "{{env.UPSTREAM}}", "literal $HOME `id` ; & |"], ports: ["worker"], dependsOn: ["api"], health: { type: "http", port: "worker" }, env: { UPSTREAM: "{{env.DEVFN_URL_API}}/work", MODE: "process" } },
  },
  profiles: { default: { processes: ["worker"], environment: { MODE: "profile", BASE: "{{env.DEVFN_URL_API}}" } } },
});

describe("endpoint and template contract", () => {
  it("resolves leased direct URLs and argv for an opaque owner before startup", () => {
    const config = fixture();
    const result = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "session:any/owner", ports: { api: 4101, worker: 4102 } });
    expect(result.ownerId).toBe("session:any/owner");
    expect(result.environment).toMatchObject({ DEVFN_INSTANCE_ID: "session:any/owner", DEVFN_PORT_API: "4101", DEVFN_URL_API: "http://127.0.0.1:4101", BASE: "http://127.0.0.1:4101" });
    expect(result.nodes.worker.environment).toMatchObject({ MODE: "process", UPSTREAM: "http://127.0.0.1:4101/work" });
    expect(result.nodes.worker.command).toEqual(["node", "worker.mjs", "http://127.0.0.1:4101/work", "literal $HOME `id` ; & |"]);
  });

  it("keeps resolved profile references stable when a node overrides their source", () => {
    const config = fixture();
    config.profiles.default.environment = { MODE: "profile", PROFILE_MODE: "{{env.MODE}}" };
    const result = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(result.nodes.worker.environment).toMatchObject({ MODE: "process", PROFILE_MODE: "profile" });
  });

  it("keeps a generated port alias ahead of profile and node literals", () => {
    const config = fixture();
    config.ports!.api.env = "PORT";
    config.profiles.default.environment = { PORT: "profile" };
    config.processes!.worker.env = { PORT: "node", ACTUAL: "{{env.PORT}}", UPSTREAM: "{{env.DEVFN_URL_API}}/work" };
    const result = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(result.environment.PORT).toBe("4101");
    expect(result.nodes.worker.environment).toMatchObject({ PORT: "4101", ACTUAL: "4101" });
  });

  it("resolves package-manager scripts and command-health argv through the selected node", () => {
    const config = fixture();
    config.processes!.worker.adapter = "npm";
    config.processes!.worker.script = "start-{{env.MODE}}";
    config.processes!.worker.health = { type: "command", command: ["node", "probe.mjs", "{{env.DEVFN_PORT_WORKER}}"] };
    const result = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(result.nodes.worker.script).toBe("start-process");
    expect(result.nodes.worker.healthCommand).toEqual(["node", "probe.mjs", "4102"]);
  });

  it("uses the native loopback bind values in environment, argv and command health", () => {
    const config = fixture();
    config.processes!.worker.env = { ...config.processes!.worker.env, BIND: "{{env.HOST}}:{{env.DEVFN_HOST}}" };
    config.processes!.worker.command = ["node", "{{env.HOST}}", "{{env.DEVFN_HOST}}", "{{env.BIND}}"];
    config.processes!.worker.health = { type: "command", command: ["node", "{{env.HOST}}", "{{env.DEVFN_HOST}}"] };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(resolved.nodes.worker.environment).toMatchObject({ HOST: "127.0.0.1", DEVFN_HOST: "127.0.0.1", BIND: "127.0.0.1:127.0.0.1" });
    expect(resolved.nodes.worker.command).toEqual(["node", "127.0.0.1", "127.0.0.1", "127.0.0.1:127.0.0.1"]);
    expect(resolved.nodes.worker.healthCommand).toEqual(["node", "127.0.0.1", "127.0.0.1"]);
    expect(resolved.environment).not.toHaveProperty("HOST");
  });

  it("publishes the scheme of an explicitly direct HTTPS health endpoint", () => {
    const config = fixture();
    config.processes!.api.health = { type: "http", port: "api", url: "https://api.localhost/health?ready=1" };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(resolved.directUrls.api).toBe("https://127.0.0.1:4101");
    expect(resolved.nodes.worker.environment.UPSTREAM).toBe("https://127.0.0.1:4101/work");
  });

  it("keeps a leased-port health probe direct when its URL names a selected route", () => {
    const config = fixture();
    config.profiles.default.proxy = true;
    config.hostnames = { api: { target: "api", hostname: "api.localhost" } };
    config.processes!.api.health = { type: "http", port: "api", url: "http://api.localhost/health?ready=1" };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(resolved.directUrls.api).toBe("http://127.0.0.1:4101");
    expect(resolved.nodes.api.healthUrl).toBe("http://127.0.0.1:4101/health?ready=1");
  });

  it("uses upstream HTTP for an HTTPS proxy route and retains direct HTTPS elsewhere", () => {
    const config = fixture();
    config.profiles.default.proxy = true;
    config.hostnames = { api: { target: "api", hostname: "api.localhost", tls: "internal" } };
    config.processes!.api.health = { type: "http", port: "api", url: "https://api.localhost/health?ready=1" };
    const routed = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(routed.directUrls.api).toBe("http://127.0.0.1:4101");
    expect(routed.nodes.api.healthUrl).toBe("http://127.0.0.1:4101/health?ready=1");
    config.processes!.api.health.url = "https://direct.example.test/health?ready=1";
    const direct = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(direct.directUrls.api).toBe("https://127.0.0.1:4101");
    expect(direct.nodes.api.healthUrl).toBe("https://127.0.0.1:4101/health?ready=1");
  });

  it("gives Compose siblings network URLs while retaining host URLs for native nodes", () => {
    const config = fixture();
    config.services = { web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } }, consumer: { adapter: "compose", service: "consumer", dependsOn: ["web"], env: { UPSTREAM: "{{env.DEVFN_URL_WEB}}" } } };
    config.ports!.web = {};
    config.profiles.default.services = ["consumer"];
    config.profiles.default.environment = { BASE: "{{env.DEVFN_URL_WEB}}" };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103 } });
    expect(resolved.environment.BASE).toBe("http://127.0.0.1:4103");
    expect(resolved.nodes.worker.environment.BASE).toBe("http://127.0.0.1:4103");
    expect(resolved.nodes.consumer.environment).toMatchObject({ DEVFN_URL_WEB: "http://web:8080", BASE: "http://web:8080", UPSTREAM: "http://web:8080", DEVFN_PORT_WEB: "4103" });
  });

  it("retains a Compose container bind HOST without changing native loopback HOST", () => {
    const config = fixture();
    config.services = { web: { adapter: "compose", service: "web", env: { HOST: "0.0.0.0" } } };
    config.profiles.default.services = ["web"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(resolved.nodes.web.environment.HOST).toBe("0.0.0.0");
    expect(resolved.nodes.api.environment.HOST).toBe("127.0.0.1");
  });

  it("rejects Compose sibling URLs across isolated projects before state creation", async () => {
    const config = fixture();
    config.services = {
      web: { adapter: "compose", service: "web", projectName: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } },
      consumer: { adapter: "compose", service: "consumer", projectName: "consumer", dependsOn: ["web"], env: { UPSTREAM: "{{env.DEVFN_URL_WEB}}" } },
    };
    config.ports!.web = {};
    config.profiles.default.services = ["consumer"];
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-project-network-"));
    const stateDir = path.join(root, "state");
    try {
      await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/another Compose project network/);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects credential-bearing URL literals before state creation without echoing them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-url-secret-"));
    const stateDir = path.join(root, "state");
    try {
      for (const location of ["profile", "node", "health"] as const) {
        const config = fixture();
        if (location === "profile") config.profiles.default.environment = { DATABASE_URL: "postgres://user:private@database.test/db" };
        if (location === "node") config.processes!.worker.env = { CONNECTION: "postgres://user:private@database.test/db" };
        if (location === "health") config.processes!.api.health = { type: "http", url: "http://user:private@127.0.0.1:4101/health" };
        const failure = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (error: Error) => error.message);
        expect(failure).toMatch(/secret channel/);
        expect(failure).not.toContain("private");
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("derives stable route labels from opaque owners without changing their identity", () => {
    const owner = "session:any/owner";
    const hostname = resolveLocalHostname(undefined, "api", "fixture", owner);
    expect(hostname).toMatch(/^api-session-any-owner-[a-f0-9]{12}\.localhost$/);
    expect(resolveLocalHostname(undefined, "api", "fixture", owner)).toBe(hostname);
    const config = fixture();
    config.profiles.default.proxy = true;
    config.hostnames = { api: { target: "api" } };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } });
    expect(resolved.ownerId).toBe(owner);
    expect(resolved.environment.DEVFN_INSTANCE_ID).toBe(owner);
  });

  it("rejects invalid shadowed literals before creating state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-shadowed-template-"));
    const stateDir = path.join(root, "state");
    try {
      for (const level of ["profile", "node"] as const) {
        for (const invalid of ["{{env.MISSING}}", "{{env.BAD", "bad\0value"]) {
          const config = fixture();
          config.ports!.api.env = "PORT";
          if (level === "profile") config.profiles.default.environment = { PORT: invalid };
          else config.processes!.worker.env = { PORT: invalid };
          await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow();
          await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
      const cyclic = fixture();
      cyclic.ports!.api.env = "PORT";
      cyclic.profiles.default.environment = { PORT: "{{env.A}}", A: "{{env.PORT}}" };
      await expect(new DevFnOrchestrator().up({ config: cyclic, root, stateDir })).rejects.toThrow(/cyclic reference/);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("recognizes a selected URL-only route with a policy hostname suffix", () => {
    const config = fixture();
    config.profiles.default.proxy = true;
    config.hostnames = { api: { target: "api" } };
    config.processes!.api.health = { type: "http", url: "http://api-owner.test.localhost/health" };
    expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 }, hostnameSuffix: ".test.localhost" }))
      .toThrow(/URL-only readiness cannot wait for a selected proxy route/);
  });

  it("rejects URL-only readiness on a selected proxy route before state creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-route-health-"));
    const stateDir = path.join(root, "state");
    try {
      for (const kind of ["process", "service"] as const) {
        const config = validateDevFnConfig({
          version: 1, project: { id: "route-health" }, ports: { api: {} },
          ...(kind === "process" ? { processes: { api: { adapter: "command", command: ["node", "api.mjs"], ports: ["api"], health: { type: "http", url: "http://api.localhost/health" } } } }
            : { services: { api: { adapter: "compose", service: "api", ports: { api: 8080 }, health: { type: "http", url: "http://api.localhost./health" } } } }),
          profiles: { default: { proxy: true, ...(kind === "process" ? { processes: ["api"] } : { services: ["api"] }) } },
          hostnames: { api: { target: "api", hostname: "api.localhost" } },
        });
        await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/URL-only readiness cannot wait for a selected proxy route/);
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects missing, cyclic, secret, malformed and empty argv references before state creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-invalid-endpoint-"));
    const stateDir = path.join(root, "state");
    try {
      for (const argument of ["{{env.MISSING}}", "{{env.SECRET_TOKEN}}", "{{env.BAD", "\0"]) {
        const config = fixture();
        config.processes!.worker.command = ["node", argument];
        config.processes!.worker.envAllowlist = ["SECRET_TOKEN"];
        config.processes!.worker.secretEnv = ["SECRET_TOKEN"];
        await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow();
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
      for (const [field, value] of [["script", "bad\0script"], ["script", "{{env.MISSING}}"], ["health", "bad\0check"], ["health", "{{env.MISSING}}"]] as const) {
        const config = fixture();
        if (field === "script") {
          config.processes!.worker.adapter = "npm";
          config.processes!.worker.script = value;
        } else config.processes!.worker.health = { type: "command", command: ["node", value] };
        await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow();
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
      const pnpm = fixture();
      pnpm.processes!.worker.adapter = "pnpm";
      pnpm.processes!.worker.script = "bad\0script";
      await expect(new DevFnOrchestrator().up({ config: pnpm, root, stateDir })).rejects.toThrow();
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      const config = fixture();
      config.processes!.worker.env = { A: "{{env.B}}", B: "{{env.A}}" };
      await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/cyclic reference/);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps the secret channel out of resolved outputs and rejects normalized key collisions", () => {
    const config = fixture();
    config.processes!.worker.envAllowlist = ["SECRET_TOKEN"];
    config.processes!.worker.secretEnv = ["SECRET_TOKEN"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(JSON.stringify(resolved)).not.toContain("SECRET_TOKEN");
    expect(() => validateDevFnConfig({ version: 1, project: { id: "fixture" }, profiles: { default: {} }, ports: { "api-http": {}, api_http: {} } })).toThrow(/DEVFN_PORT_API_HTTP/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "fixture" }, profiles: { default: { environment: { DEVFN_URL_API: "fake" } } } })).toThrow(/reserved/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "fixture" }, profiles: { default: { environment: { HOST: "0.0.0.0" } } } })).toThrow(/reserved/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "fixture" }, profiles: { default: { environment: { Mode: "a", MODE: "b" } } } })).toThrow(/colliding environment keys/);
    config.profiles.default.environment = { Mode: "profile" };
    config.processes!.worker.env = { MODE: "process" };
    expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } })).toThrow(/collides with profile environment key/);
  });
});
