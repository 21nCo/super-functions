import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { discoverProject, loadTrustedDevFnConfig, trustProject, validateDevFnConfig, validateDevFnPolicy } from "../src/index.js";

describe("DevFn configuration", () => {
  it("validates named ports, processes, services, profiles, and hostnames", () => {
    const config = validateDevFnConfig({
      version: 1,
      project: { id: "sample" },
      ports: { app: { preferred: 3200, range: [3200, 3299], env: "PORT" }, db: { preferred: 5432, exact: true, internal: 5432 } },
      processes: { app: { adapter: "npm", script: "dev", ports: ["app"], dependsOn: ["db"], health: { type: "http", port: "app", path: "/health" } } },
      services: { db: { adapter: "compose", service: "postgres", ports: { db: 5432 }, persistent: true } },
      profiles: { default: { processes: ["app"], services: ["db"] } },
      hostnames: { app: { target: "app" } },
    });
    expect(config.project.id).toBe("sample");
    expect(config.services?.db.persistent).toBe(true);
  });

  it("rejects unsafe paths and dangling references", () => {
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, runtimeDir: "../outside", profiles: { default: {} } })).toThrow(/inside the repository/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, profiles: { default: { processes: ["missing"] } } })).toThrow(/unknown process/);
  });

  it("rejects colliding lifecycle names and unsafe hostnames", () => {
    expect(() => validateDevFnConfig({
      version: 1, project: { id: "x" }, ports: { app: {} },
      processes: { shared: { adapter: "command", command: ["node"], ports: ["app"] } },
      services: { shared: { adapter: "compose", service: "app", ports: { app: 3000 } } },
      profiles: { default: {} },
    })).toThrow(/both a process and a service/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { app: { target: "app", hostname: "safe.localhost\n:80" } } })).toThrow(/\.localhost/);
  });

  it("accepts only documented hostname placeholders", () => {
    const config = validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { app: { target: "app", hostname: "app-{instance}-{project}.localhost" } } });
    expect(config.hostnames?.app.hostname).toBe("app-{instance}-{project}.localhost");
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { app: { target: "app", hostname: "app-{unknown}.localhost" } } })).toThrow(/only/);
  });

  it("validates structured organization policy", () => {
    expect(validateDevFnPolicy({ version: 1, fallbackRange: [4000, 4999], ports: [{ name: "postgres", port: 5432, kind: "protected" }] }).ports).toHaveLength(1);
  });

  it("requires explicit redaction metadata for inherited secrets", () => {
    const base = { version: 1, project: { id: "x" }, profiles: { default: { processes: ["app"] } } };
    expect(() => validateDevFnConfig({ ...base, processes: { app: { adapter: "command", command: ["node"], envAllowlist: ["API_TOKEN"] } } })).toThrow(/secretEnv/);
    expect(validateDevFnConfig({ ...base, processes: { app: { adapter: "command", command: ["node"], envAllowlist: ["API_TOKEN"], secretEnv: ["API_TOKEN"] } } }).processes?.app.secretEnv).toEqual(["API_TOKEN"]);
  });

  it("requires an implicit default profile and private output modes", () => {
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, profiles: { one: {} } })).toThrow(/profiles.default/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, profiles: { default: {} }, environmentOutputs: [{ path: ".devfn/out", mode: 0o644 }] })).toThrow(/group or other/);
  });

  it("does not map unsupported package managers to npm", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-yarn-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    await writeFile(path.join(root, "yarn.lock"), "");
    const result = await discoverProject(root);
    expect(result.config.processes).toEqual({});
    expect(result.config.prerequisites).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ kind: "package-manager", confidence: "proposed" }));
  });

  it("honors unsupported package-manager declarations without lockfiles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-bun-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.2.0", scripts: { dev: "vite" } }));
    expect((await discoverProject(root)).config.processes).toEqual({});
  });

  it("rejects commented dynamic imports in trusted executable manifests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-trusted-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.mjs");
    await writeFile(configPath, 'await import /* comment */ ("node:fs");\nexport default { version: 1, project: { id: "x" }, profiles: { default: {} } };\n');
    await trustProject(root, configPath, stateDir);
    await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/self-contained/);
  });

  it("rejects CommonJS require property access in trusted manifests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-trusted-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.cjs");
    await writeFile(configPath, 'module.require("node:fs");\nmodule.exports = { version: 1, project: { id: "x" }, profiles: { default: {} } };\n');
    await trustProject(root, configPath, stateDir);
    await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/self-contained/);
  });

  it("loads JSON only from a matching trusted snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-json-trusted-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.json");
    await writeFile(configPath, JSON.stringify({ version: 1, project: { id: "x" }, profiles: { default: {} } }));
    await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/not trusted/);
    await trustProject(root, configPath, stateDir);
    expect((await loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).config.project.id).toBe("x");
    await writeFile(configPath, JSON.stringify({ version: 1, project: { id: "changed" }, profiles: { default: {} } }));
    await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/not trusted/);
  });
});
