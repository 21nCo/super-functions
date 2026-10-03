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
    expect(resolved.nodes.consumer.readinessEnvironment).toMatchObject({ DEVFN_URL_WEB: "http://127.0.0.1:4103", BASE: "http://127.0.0.1:4103", UPSTREAM: "http://127.0.0.1:4103" });
  });

  it("rejects a native loopback URL consumed by Compose before creating state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-native-compose-reference-"));
    const stateDir = path.join(root, "state");
    try {
      for (const viaProfile of [false, true]) {
        const config = fixture();
        config.profiles.default.environment = {};
        config.services = { consumer: { adapter: "compose", service: "consumer", dependsOn: ["api"], env: { UPSTREAM: viaProfile ? "{{env.PROFILE_UPSTREAM}}" : "{{env.DEVFN_URL_API}}" } } };
        config.profiles.default.services = ["consumer"];
        if (viaProfile) config.profiles.default.environment = { PROFILE_UPSTREAM: "{{env.DEVFN_URL_API}}" };
        await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/native loopback process unreachable from Compose|missing reference DEVFN_URL_API/);
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("resolves Compose command readiness in host context while preserving container startup values", () => {
    const config = fixture();
    config.profiles.default.environment = {};
    config.services = {
      web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } },
      consumer: { adapter: "compose", service: "consumer", dependsOn: ["web"], env: { UPSTREAM: "{{env.DEVFN_URL_WEB}}" }, health: { type: "command", command: ["node", "probe.mjs", "{{env.UPSTREAM}}", "{{env.DEVFN_URL_WEB}}"] } },
    };
    config.ports!.web = {};
    config.profiles.default.services = ["consumer"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103 } });
    expect(resolved.nodes.consumer.environment.UPSTREAM).toBe("http://web:8080");
    expect(resolved.nodes.consumer.readinessEnvironment.UPSTREAM).toBe("http://127.0.0.1:4103");
    expect(resolved.nodes.consumer.healthCommand).toEqual(["node", "probe.mjs", "http://127.0.0.1:4103", "http://127.0.0.1:4103"]);
  });

  it("retains a Compose container bind HOST without changing native loopback HOST", () => {
    const config = fixture();
    config.profiles.default.environment = {};
    config.services = { web: { adapter: "compose", service: "web", env: { HOST: "0.0.0.0" } } };
    config.profiles.default.services = ["web"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } });
    expect(resolved.nodes.web.environment.HOST).toBe("0.0.0.0");
    expect(resolved.nodes.api.environment.HOST).toBe("127.0.0.1");
  });

  it("rejects Compose sibling URLs across isolated projects before state creation", async () => {
    const config = fixture();
    config.profiles.default.environment = {};
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

  it("allows independent Compose projects without publishing unreachable sibling URLs", () => {
    const config = fixture();
    config.profiles.default.environment = {};
    config.services = {
      web: { adapter: "compose", service: "web", projectName: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } },
      other: { adapter: "compose", service: "other", projectName: "other", ports: { other: 8081 }, health: { type: "http", port: "other" } },
    };
    config.ports!.web = {};
    config.ports!.other = {};
    config.profiles.default.services = ["web", "other"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103, other: 4104 } });
    expect(resolved.nodes.web.environment.DEVFN_URL_WEB).toBe("http://web:8080");
    expect(resolved.nodes.web.environment).not.toHaveProperty("DEVFN_URL_OTHER");
    expect(resolved.nodes.other.environment.DEVFN_URL_OTHER).toBe("http://other:8081");
    expect(resolved.nodes.other.environment).not.toHaveProperty("DEVFN_URL_WEB");
    config.services.other.dependsOn = ["web"];
    config.services.other.health = { type: "command", command: ["node", "probe.mjs", "{{env.DEVFN_URL_WEB}}"] };
    const hostProbe = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103, other: 4104 } });
    expect(hostProbe.nodes.other.healthCommand).toEqual(["node", "probe.mjs", "http://127.0.0.1:4103"]);
    expect(hostProbe.nodes.other.environment).not.toHaveProperty("DEVFN_URL_WEB");
  });

  it("rejects credential-bearing health paths and argv before state creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-health-argv-secret-"));
    const stateDir = path.join(root, "state");
    try {
      for (const kind of ["process", "service"] as const) {
        for (const location of ["port-path", "url-path"] as const) {
          const config = fixture();
          const health = { type: "http" as const, ...(location === "port-path" ? { port: kind === "process" ? "api" : "web" } : { url: "http://127.0.0.1:4101/" }), path: "/health?token=synthetic-sentinel" };
          if (kind === "process") config.processes!.api.health = health;
          else {
            config.ports!.web = {};
            config.services = { web: { adapter: "compose", service: "web", ports: { web: 8080 }, health } };
            config.profiles.default.services = ["web"];
          }
          expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103 } })).toThrow(/secret channel/);
          const error = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (failure: Error) => failure.message);
          expect(error).toMatch(/secret channel/);
          expect(error).not.toContain("synthetic-sentinel");
          await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
      for (const argument of ["--token=synthetic-sentinel", "--api-key=synthetic-sentinel", "--password", "prefix --secret=synthetic-sentinel", "--health=/health?token=synthetic-sentinel"]) {
        const config = fixture();
        config.processes!.worker.command = ["node", argument];
        expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } })).toThrow(/secret channel/);
        const error = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (failure: Error) => failure.message);
        expect(error).toMatch(/secret channel/);
        expect(error).not.toContain("synthetic-sentinel");
        await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects credential-bearing URL literals before state creation without echoing them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-url-secret-"));
    const stateDir = path.join(root, "state");
    try {
      for (const url of ["http://user:pa'private@127.0.0.1:4101/health", "http://127.0.0.1:4101/health?token=private", "http://127.0.0.1:4101/health?api-key=private", "http://127.0.0.1:4101/health?X-Amz-Signature=private", "http://127.0.0.1:4101/health#access_token=private", "http://127.0.0.1:4101/health#/callback?access%5Ftoken=private"]) {
        for (const location of ["profile", "node", "argv", "health"] as const) {
          const config = fixture();
          if (location === "profile") config.profiles.default.environment = { DATABASE_URL: url };
          if (location === "node") config.processes!.worker.env = { CONNECTION: url };
          if (location === "argv") config.processes!.worker.command = ["node", url];
          if (location === "health") config.processes!.api.health = { type: "http", url };
          expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102 } })).toThrow(/secret channel/);
          const failure = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (error: Error) => error.message);
          expect(failure).toMatch(/secret channel/);
          expect(failure).not.toContain("private");
          await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
      for (const kind of ["process", "service"] as const) {
        for (const health of [{ type: "http", port: kind === "process" ? "api" : "web", path: "/health#access_token=private" }, { type: "http", url: "http://127.0.0.1:4101/health", path: "#access_token=private" }] as const) {
          const config = fixture();
          if (kind === "process") config.processes!.api.health = health;
          else {
            config.ports!.web = {};
            config.services = { web: { adapter: "compose", service: "web", ports: { web: 8080 }, health } };
            config.profiles.default.services = ["web"];
          }
          const failure = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (error: Error) => error.message);
          expect(failure).toMatch(/secret channel/);
          expect(failure).not.toContain("private");
          await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
      const quoted = fixture();
      quoted.processes!.worker.command = ["node", "--database=\"postgres://user:private@database.test\""];
      expect(() => resolveEndpointTemplates({ config: quoted, plan: createPlan(quoted), ownerId: "owner", ports: { api: 4101, worker: 4102 } })).toThrow(/secret channel/);
      const quotedFailure = await new DevFnOrchestrator().up({ config: quoted, root, stateDir }).then(() => "", (error: Error) => error.message);
      expect(quotedFailure).toMatch(/secret channel/);
      expect(quotedFailure).not.toContain("private");
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects qualified credential keys in every manifest consumer before mutation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devfn-qualified-secret-"));
    const stateDir = path.join(root, "state");
    const marker = "synthetic-sentinel";
    try {
      for (const kind of ["process", "service"] as const) {
        for (const location of ["profile", "node", "argv", "health"] as const) {
          const config = fixture();
          const url = `http://example.test/health?db_password=${marker}`;
          if (kind === "service") {
            config.ports!.web = {};
            config.services = { web: { adapter: "compose", service: "web", ports: { web: 8080 }, health: { type: "http", port: "web" } } };
            config.profiles.default.services = ["web"];
            config.profiles.default.environment = {};
          }
          if (location === "profile") config.profiles.default.environment = { ENDPOINT: url };
          if (location === "node") {
            if (kind === "process") config.processes!.worker.env = { ENDPOINT: url };
            else config.services!.web.env = { ENDPOINT: url };
          }
          if (location === "argv") {
            if (kind === "process") config.processes!.worker.command = ["node", `--db-password=${marker}`];
            else config.services!.web.health = { type: "command", command: ["node", `--db-password=${marker}`] };
          }
          if (location === "health") {
            if (kind === "process") config.processes!.api.health = { type: "http", port: "api", path: `/health#password_hint=${marker}` };
            else config.services!.web.health = { type: "http", port: "web", path: `/health#password_hint=${marker}` };
          }
          expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "owner", ports: { api: 4101, worker: 4102, web: 4103 } })).toThrow(/secret channel/);
          const failure = await new DevFnOrchestrator().up({ config, root, stateDir }).then(() => "", (error: Error) => error.message);
          expect(failure).toMatch(/secret channel/);
          expect(failure).not.toContain(marker);
          await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
        }
      }
      const safe = fixture();
      safe.profiles.default.environment = { ENDPOINT: "http://example.test/health?monkey=1&ready=1" };
      expect(resolveEndpointTemplates({ config: safe, plan: createPlan(safe), ownerId: "--db-password=opaque", ports: { api: 4101, worker: 4102 } }).environment.ENDPOINT).toContain("monkey=1");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("derives stable route labels from opaque owners without changing their identity", () => {
    const owner = "session:any/owner";
    const hostname = resolveLocalHostname(undefined, "api", "fixture", owner);
    expect(hostname).toMatch(/^api-o-[a-f0-9]{20}\.localhost$/);
    expect(hostname).not.toContain("session");
    expect(resolveLocalHostname(undefined, "api", "fixture", owner)).toBe(hostname);
    expect(resolveLocalHostname(undefined, "api", "fixture", "owner")).not.toBe(resolveLocalHostname(undefined, "api", "fixture", "OWNER").toLowerCase());
    expect(resolveLocalHostname(undefined, "api", "fixture", "OWNER")).not.toBe(resolveLocalHostname(undefined, "api", "fixture", "owner-0559aadba9e2"));
    expect(resolveLocalHostname(undefined, "api", "fixture", "--token=synthetic-sentinel")).not.toContain("synthetic-sentinel");
    const config = fixture();
    config.profiles.default.proxy = true;
    config.hostnames = { api: { target: "api" } };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } });
    expect(resolved.ownerId).toBe(owner);
    expect(resolved.environment.DEVFN_INSTANCE_ID).toBe(owner);
  });

  it("keeps referenced opaque owner delimiters as literal data in every consumer", () => {
    const config = fixture();
    const owner = "session/{{blue}}";
    config.profiles.default.environment = { OWNER_COPY: "{{env.DEVFN_INSTANCE_ID}}" };
    config.processes!.worker.env = { OWNER_NODE: "{{env.OWNER_COPY}}" };
    config.processes!.worker.command = ["node", "{{env.OWNER_NODE}}"];
    config.processes!.worker.health = { type: "command", command: ["node", "{{env.DEVFN_INSTANCE_ID}}"] };
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } });
    expect(resolved.environment.OWNER_COPY).toBe(owner);
    expect(resolved.nodes.worker.environment.OWNER_NODE).toBe(owner);
    expect(resolved.nodes.worker.command).toEqual(["node", owner]);
    expect(resolved.nodes.worker.healthCommand).toEqual(["node", owner]);
    config.processes!.worker.command = ["node", "{{env.OWNER_NODE}} {{broken}}"];
    expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } })).toThrow(/malformed template/);
  });

  it("preserves credential-shaped opaque owner data while rejecting manifest credentials", () => {
    for (const owner of ["--token=owner", "session?token=owner"]) {
      const config = fixture();
      config.profiles.default.environment = { OWNER_COPY: "{{env.DEVFN_INSTANCE_ID}}" };
      config.processes!.worker.env = { ...config.processes!.worker.env, OWNER_NODE: "{{env.OWNER_COPY}}" };
      config.processes!.worker.command = ["node", "{{env.OWNER_NODE}}"];
      config.processes!.worker.health = { type: "command", command: ["node", "{{env.OWNER_NODE}}"] };
      const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } });
      expect(resolved.environment.OWNER_COPY).toBe(owner);
      expect(resolved.nodes.worker.environment.OWNER_NODE).toBe(owner);
      expect(resolved.nodes.worker.command).toEqual(["node", owner]);
      expect(resolved.nodes.worker.healthCommand).toEqual(["node", owner]);
      config.processes!.worker.command = ["node", "--token={{env.OWNER_NODE}}"];
      expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: owner, ports: { api: 4101, worker: 4102 } })).toThrow(/secret channel/);
    }
    const assembled = fixture();
    assembled.profiles.default.environment = { FLAG: "--", ARGUMENT: "token=owner", COMBINED: "{{env.FLAG}}{{env.ARGUMENT}}" };
    expect(() => resolveEndpointTemplates({ config: assembled, plan: createPlan(assembled), ownerId: "--token=owner", ports: { api: 4101, worker: 4102 } })).toThrow(/secret channel/);
  });

  it("shares effective Compose project identity across case variants", () => {
    const config = fixture();
    config.profiles.default.environment = {};
    config.ports!.web = {};
    config.services = {
      web: { adapter: "compose", service: "web", projectName: "blue", ports: { web: 8080 }, health: { type: "http", port: "web" } },
      consumer: { adapter: "compose", service: "consumer", projectName: "BLUE", dependsOn: ["web"], env: { UPSTREAM: "{{env.DEVFN_URL_WEB}}" } },
    };
    config.profiles.default.services = ["consumer"];
    const resolved = resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "Owner", ports: { api: 4101, worker: 4102, web: 4103 } });
    expect(resolved.nodes.consumer.environment.UPSTREAM).toBe("http://web:8080");
    config.services.consumer.projectName = "green";
    expect(() => resolveEndpointTemplates({ config, plan: createPlan(config), ownerId: "Owner", ports: { api: 4101, worker: 4102, web: 4103 } })).toThrow(/another Compose project network/);
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
    config.processes!.api.health = { type: "http", url: `http://${resolveLocalHostname(undefined, "api", "fixture", "owner", ".test.localhost")}/health` };
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
