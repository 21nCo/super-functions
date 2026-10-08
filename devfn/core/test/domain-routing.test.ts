import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { registerDomain } from "@devfn/proxy";
import { validateDevFnConfig } from "@devfn/config";
import { DevFnOrchestrator } from "../src/index.js";

it("refuses an unregistered or differently owned domain before lifecycle state exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-domain-preflight-"));
  const stateDir = path.join(root, "machine-state");
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "-e", "void 0"], ports: ["app"] } },
    profiles: { default: { processes: ["app"], proxy: true } },
    hostnames: { app: { target: "app", domain: "dev.example.test" } } });
  try {
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/not registered/);
    await expect(access(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    await registerDomain(stateDir, { domain: "dev.example.test", projectId: "other", repositoryIdentity: root, tls: "internal" },
      (async () => [{ address: "127.0.0.1", family: 4 }]) as never);
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toThrow(/not registered/);
    await expect(access(path.join(stateDir, "registry.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("starts local-only preflight despite an invalid machine domain registry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-local-preflight-"));
  const stateDir = path.join(root, "machine-state");
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "-e", "process.exit(7)"], ports: ["app"] } },
    profiles: { default: { processes: ["app"], proxy: true } }, hostnames: { app: { target: "app" } } });
  try {
    await mkdir(stateDir);
    await writeFile(path.join(stateDir, "domains.json"), "{invalid-json");
    await expect(new DevFnOrchestrator().up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_START_FAILED" });
    await expect(access(path.join(stateDir, "registry.json"))).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
