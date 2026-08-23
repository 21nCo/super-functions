import { access, mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
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
    expect(() => validateDevFnConfig({ version: 1, project: { id: "bad_project" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { app: { target: "app", hostname: "{project}.localhost" } } })).toThrow(/invalid/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "{instance}" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { app: { target: "app", hostname: "{project}.localhost" } } })).toThrow(/invalid/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: {} }, profiles: { default: {} }, hostnames: { bad_name: { target: "app" } } })).toThrow(/invalid/);
  });

  it("rejects lifecycle names that cannot be used as safe runtime filenames", () => {
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, services: { "../outside": { adapter: "compose", service: "app" } }, profiles: { default: {} } })).toThrow(/unsupported|only letters/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, services: { "worker\n": { adapter: "compose", service: "app" } }, profiles: { default: {} } })).toThrow(/only letters/);
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

  it("rejects contradictory ephemeral blocks and colliding port environment names", () => {
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { callback: { ephemeral: true, block: "oauth" } }, profiles: { default: {} } })).toThrow(/part of a block/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { "api-http": {}, api_http: {} }, profiles: { default: {} } })).toThrow(/DEVFN_PORT_API_HTTP/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { "": { env: "EMPTY_OWNER" }, app: { env: "EMPTY_OWNER" } }, profiles: { default: {} } })).toThrow(/Port name/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: { env: "SHARED_PORT" }, admin: { env: "SHARED_PORT" } }, profiles: { default: {} } })).toThrow(/SHARED_PORT/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, ports: { app: { env: "DEVFN_PROJECT_ID" } }, profiles: { default: {} } })).toThrow(/reserved DEVFN_/);
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

  it("evaluates declarative TypeScript manifests in a restricted context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-trusted-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.ts");
    await writeFile(configPath, 'const project: string = "restricted"; export default { version: 1 as const, project: { id: project }, profiles: { default: {} } };\n');
    await trustProject(root, configPath, stateDir);
    expect((await loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).config.project.id).toBe("restricted");
  });

  it("does not expose host code generation or built-in module access to trusted manifests", async () => {
    for (const expression of [
      (marker: string) => `process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "1")`,
      () => 'eval("globalThis.escaped = true")',
      () => 'Function("return process")()',
      () => 'module["re" + "quire"]("node:fs")',
    ]) {
      const root = await mkdtemp(path.join(tmpdir(), "devfn-restricted-"));
      const stateDir = path.join(root, "state");
      const configPath = path.join(root, "devfn.config.ts");
      const marker = path.join(root, "escape");
      await writeFile(configPath, `${expression(marker)}; export default { version: 1, project: { id: "x" }, profiles: { default: {} } };\n`);
      await trustProject(root, configPath, stateDir);
      await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/restricted context/);
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("keeps scheduled manifest microtasks inside the evaluation timeout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-microtasks-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.ts");
    await writeFile(configPath, 'Promise.resolve().then(() => { const deadline = Date.now() + 1500; while (Date.now() < deadline) {} }); export default { version: 1, project: { id: "x" }, profiles: { default: {} } };\n');
    await trustProject(root, configPath, stateDir);
    await expect(loadTrustedDevFnConfig({ cwd: root, configPath, stateDir })).rejects.toThrow(/restricted context/);
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

  it("serializes concurrent stale trust-lock recovery", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-stale-trust-"));
    const stateDir = path.join(root, "state");
    const first = path.join(root, "first.json");
    const second = path.join(root, "second.json");
    await mkdir(stateDir);
    await writeFile(first, "first");
    await writeFile(second, "second");
    await mkdir(path.join(stateDir, "trust.lock"));
    await writeFile(path.join(stateDir, "trust.lock", "stale.ticket"), JSON.stringify({ token: "stale", number: 1, pid: 2_147_483_647, createdAt: "2000-01-01T00:00:00.000Z" }));
    await Promise.all([trustProject(root, first, stateDir), trustProject(root, second, stateDir)]);
    const state = JSON.parse(await readFile(path.join(stateDir, "trust.json"), "utf8")) as { records: Array<{ configPath: string }> };
    expect(state.records.map((record) => record.configPath).sort()).toEqual([first, second].sort());
  });

  it("recovers an ownerless ticket abandoned before metadata was written", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-ownerless-ticket-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.json");
    const lockPath = path.join(stateDir, "trust.lock");
    await mkdir(lockPath, { recursive: true });
    const choosingPath = path.join(lockPath, "abandoned.choosing");
    await writeFile(choosingPath, "");
    await utimes(choosingPath, new Date(0), new Date(0));
    await writeFile(configPath, "ownerless");
    await expect(trustProject(root, configPath, stateDir)).resolves.toBeUndefined();
  });

  it("recovers stale tickets when a PID has been reused", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-reused-pid-"));
    const stateDir = path.join(root, "state");
    const configPath = path.join(root, "devfn.config.json");
    const lockPath = path.join(stateDir, "trust.lock");
    await mkdir(lockPath, { recursive: true });
    await writeFile(path.join(lockPath, "reused.ticket"), JSON.stringify({ token: "reused", number: 1, pid: process.pid, birthSignature: "different-process", createdAt: "2000-01-01T00:00:00.000Z" }));
    await writeFile(configPath, "reused");
    await expect(trustProject(root, configPath, stateDir)).resolves.toBeUndefined();
  });
});
