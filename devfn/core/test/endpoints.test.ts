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
      const config = fixture();
      config.processes!.worker.env = { A: "{{env.B}}", B: "{{env.A}}" };
      await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/cyclic reference/);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

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
  });
});
