import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateDevFnConfig, type DevFnConfig } from "@devfn/config";
import { describe, expect, it } from "vitest";

import { createPlan, DevFnOrchestrator, resolveEndpointTemplates } from "../src/index.js";

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
