import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

import { processBirthSignature } from "@devfn/processes";
import { CaddyProxyController, registerDomain } from "@devfn/proxy";
import { validateDevFnConfig } from "@devfn/config";
import { DevFnOrchestrator, domainAliases, resolveAllocationUrls, resolveInstanceIdentity } from "../src/index.js";

const execFileAsync = promisify(execFile);

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

it("keeps registered-domain aliases and routes isolated across two Git worktrees", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "devfn-domain-worktrees-"));
  const primary = path.join(parent, "primary");
  const feature = path.join(parent, "feature");
  const stateDir = path.join(parent, "machine-state");
  const toolsDir = path.join(parent, "tools");
  const originalPath = process.env.PATH;
  try {
    await mkdir(primary); await mkdir(toolsDir);
    await execFileAsync("git", ["init", primary]);
    await writeFile(path.join(primary, "fixture.txt"), "fixture");
    await execFileAsync("git", ["-C", primary, "add", "fixture.txt"]);
    await execFileAsync("git", ["-C", primary, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "init"]);
    await execFileAsync("git", ["-C", primary, "worktree", "add", "--detach", feature]);
    const [main, child] = await Promise.all([primary, feature].map((root) => resolveInstanceIdentity("fixture", root)));
    expect(main.repositoryIdentity).toBe(child.repositoryIdentity);
    const mainAliases = domainAliases("app", "dev.example.test", main);
    const childAliases = domainAliases("app", "dev.example.test", child);
    expect(mainAliases).toContain("app.dev.example.test");
    expect(childAliases).toHaveLength(1);
    expect(childAliases[0]).toMatch(/^app-feature-[a-f0-9]{6}\.dev\.example\.test$/);
    const dns = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: main.repositoryIdentity, tls: "internal" }, dns);
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const proxy = new CaddyProxyController(stateDir, dns);
    const routes = (identity: typeof main, aliases: string[], port: number) => aliases.map((hostname, index) => ({
      id: `${identity.instanceId}:${index}`, instanceId: identity.instanceId, hostname, targetHost: "127.0.0.1", targetPort: port,
      tls: "internal" as const, registeredDomain: "dev.example.test", projectId: "fixture", repositoryIdentity: identity.repositoryIdentity,
    }));
    const first = routes(main, mainAliases, 4101);
    const second = routes(child, childAliases, 4102);
    await proxy.upsert(first);
    await proxy.upsert(second);
    expect((await proxy.routes()).map((route) => route.hostname).sort()).toEqual([...mainAliases, ...childAliases].sort());
    const allocation = (instanceId: string, port: number) => ({ id: instanceId, projectId: "fixture", instanceId, service: "app", protocol: "tcp" as const,
      host: "127.0.0.1", port, invocationId: "fixture", state: "active" as const, source: "exact" as const, createdAt: "now", updatedAt: "now" });
    expect(resolveAllocationUrls([allocation(main.instanceId, 4101)], await proxy.routes(), new Set(["app"])).app)
      .toBe(`https://${mainAliases[0]}`);
    expect(resolveAllocationUrls([allocation(child.instanceId, 4102)], await proxy.routes(), new Set(["app"])).app)
      .toBe(`https://${childAliases[0]}`);
    await expect(proxy.upsert([{ ...second[0], hostname: mainAliases[0] }])).rejects.toThrow(/already owned/);
    expect((await proxy.routes()).map((route) => route.hostname).sort()).toEqual([...mainAliases, ...childAliases].sort());
    await proxy.removeInstance(main.instanceId);
    expect((await proxy.routes()).map((route) => route.hostname)).toEqual(childAliases);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(parent, { recursive: true, force: true });
  }
});
