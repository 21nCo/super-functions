import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@devfn/proxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devfn/proxy")>();
  return {
    ...actual,
    verifyLocalDns: async () => undefined,
    CaddyProxyController: class extends actual.CaddyProxyController {
      constructor(stateDir: string) {
        // The command stub stands in for a Caddy that holds its listeners and
        // serves the committed configuration.
        super(stateDir, (async () => [{ address: "127.0.0.1", family: 4 }]) as never, 5_000, async () => true, async () => true);
      }
      // This fixture replaces Caddy with a command stub; physical owner and
      // listener preflight is covered by the isolated real-Caddy suite.
      override async assertActivationReady(): Promise<void> {}
    },
  };
});

import { validateDevFnConfig } from "@devfn/config";
import { FilePortRegistry } from "@devfn/ports";
import { processBirthSignature, ProcessSupervisor } from "@devfn/processes";
import { CaddyProxyController, proxyListenerPorts, registerDomain } from "@devfn/proxy";
import { DevFnOrchestrator, domainAliases, readReceipt, resolveInstanceIdentity, writeReceipt } from "../src/index.js";

it.each(["internal", "certificate"] as const)("keeps a registered %s route ready through status and retry", async (tls) => {
  const parent = await mkdtemp(path.join(tmpdir(), "devfn-registered-up-"));
  const root = path.join(parent, "repo");
  const stateDir = path.join(parent, "state");
  const toolsDir = path.join(parent, "tools");
  const originalPath = process.env.PATH;
  const orchestrator = new DevFnOrchestrator();
  const config = validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 10_000 } } },
    profiles: { default: { processes: ["app"], proxy: true } },
    hostnames: { app: { target: "app", domain: "dev.example.test", host: "app" } } });
  try {
    execFileSync("git", ["init", root], { stdio: "ignore" });
    await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
    await writeFile(path.join(root, "server.mjs"), `import { createServer } from "node:http";
const server = createServer((_request, response) => response.end("ok"));
server.listen(Number(process.env.DEVFN_PORT_APP), "127.0.0.1");\n`);
    const identity = await resolveInstanceIdentity("fixture", root);
    expect(identity.isPrimaryWorktree).toBe(true);
    const certificateFile = path.join(parent, "cert.pem");
    const keyFile = path.join(parent, "key.pem");
    if (tls === "certificate") execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
      "-days", "1", "-subj", "/CN=unrelated.test", "-addext", `subjectAltName=${domainAliases("app", "dev.example.test", identity).map((alias) => `DNS:${alias}`).join(",")}`], { stdio: "ignore" });
    await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: identity.repositoryIdentity, tls,
      ...(tls === "certificate" ? { certificateFile, keyFile } : {}) },
      (async () => [{ address: "127.0.0.1", family: 4 }]) as never);
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Fixture process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
    const receipt = await orchestrator.up({ config, root, stateDir });
    expect(receipt.state).toBe("ready");
    expect(receipt.routes.map((route) => route.hostname)).toContain("app.dev.example.test");
    const port = proxyListenerPorts().httpsPort;
    expect(receipt.urls.app).toBe(`https://${receipt.routes[0].hostname}${port === 443 ? "" : `:${port}`}`);
    expect(await readFile(path.join(stateDir, "Caddyfile"), "utf8")).toContain("app.dev.example.test");
    if (tls === "certificate") expect(receipt.routes[0].certificateDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready", urls: receipt.urls });
    await expect(orchestrator.up({ config, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_ALREADY_RUNNING" });
    if (tls === "internal") {
      receipt.urls.app = `https://${receipt.routes[0].hostname}${port === 443 ? ":8443" : ""}`;
      await writeReceipt(receipt);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: false, state: "degraded", urls: {} });
      const refreshed = await orchestrator.up({ config, root, stateDir });
      expect(refreshed.invocationId).not.toBe(receipt.invocationId);
      expect(refreshed.urls.app).toBe(`https://${refreshed.routes[0].hostname}${port === 443 ? "" : `:${port}`}`);
      expect(await orchestrator.status({ config, root })).toMatchObject({ ok: true, state: "ready", urls: refreshed.urls });
    }
    expect((await orchestrator.down({ config, root, stateDir })).state).toBe("stopped");
  } finally {
    await orchestrator.down({ config, root, stateDir }).catch(() => undefined);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(parent, { recursive: true, force: true });
  }
}, 30_000);

describe("replacement rollback of a certificate-backed route", () => {
  const issue = (identity: Awaited<ReturnType<typeof resolveInstanceIdentity>>, certificateFile: string, keyFile: string) => execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyFile, "-out", certificateFile, "-days", "1", "-subj", "/CN=unrelated.test",
    "-addext", `subjectAltName=${domainAliases("app", "dev.example.test", identity).map((alias) => `DNS:${alias}`).join(",")}`], { stdio: "ignore" });
  const configFor = (domain: boolean) => validateDevFnConfig({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"],
      health: { type: "http", port: "app", timeoutMs: 10_000 } } },
    profiles: { default: { processes: ["app"], proxy: true } },
    hostnames: { app: domain ? { target: "app", domain: "dev.example.test", host: "app" } : { target: "app" } } });

  // The replacement serves a plain .localhost route, so activating it prunes
  // the prior route's certificate snapshot before the injected failure.
  it.each([
    ["removed", "a failed replacement record"], ["removed", "a refused prior teardown"],
    ["rotated", "a failed replacement record"], ["rotated", "a refused prior teardown"],
  ] as const)("restores the served certificate after its source was %s and %s", async (sourceChange, failure) => {
    await replaceAndFail(sourceChange, failure, false);
  }, 60_000);

  it.each(["a failed replacement record", "a refused prior teardown"] as const)("reports a failed route rollback after %s", async (failure) => {
    await replaceAndFail("removed", failure, true);
  }, 60_000);

  // The rollback copy lives only in the replacing command, so a kill after
  // preactivation loses it; recovery is degraded status, down, then a fresh up.
  it.each(["removed", "rotated"] as const)("recovers a replacement interrupted before prior teardown after its source was %s", async (sourceChange) => {
    await replaceAndFail(sourceChange, "an interruption before prior teardown", false);
  }, 60_000);

  async function replaceAndFail(sourceChange: "removed" | "rotated", failure: "a failed replacement record" | "a refused prior teardown" | "an interruption before prior teardown", rollbackFails: boolean): Promise<void> {
    const parent = await mkdtemp(path.join(tmpdir(), "devfn-cert-rollback-"));
    const root = path.join(parent, "repo");
    const stateDir = path.join(parent, "state");
    const toolsDir = path.join(parent, "tools");
    const originalPath = process.env.PATH;
    const orchestrator = new DevFnOrchestrator();
    const original = configFor(true);
    const replacement = configFor(false);
    const certificateFile = path.join(parent, "cert.pem");
    const keyFile = path.join(parent, "key.pem");
    const updateInvocation = FilePortRegistry.prototype.updateInvocation;
    const stop = ProcessSupervisor.prototype.stop;
    try {
      execFileSync("git", ["init", root], { stdio: "ignore" });
      await Promise.all([mkdir(stateDir), mkdir(toolsDir)]);
      await writeFile(path.join(root, "server.mjs"), `import { createServer } from "node:http";
const server = createServer((_request, response) => response.end("old"));
server.listen(Number(process.env.DEVFN_PORT_APP), "127.0.0.1");\n`);
      const identity = await resolveInstanceIdentity("fixture", root);
      issue(identity, certificateFile, keyFile);
      await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: identity.repositoryIdentity, tls: "certificate", certificateFile, keyFile },
        (async () => [{ address: "127.0.0.1", family: 4 }]) as never);
      const birthSignature = await processBirthSignature(process.pid);
      if (!birthSignature) throw new Error("Fixture process has no birth signature.");
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const first = await orchestrator.up({ config: original, root, stateDir });
      const digest = first.routes[0].certificateDigest;
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      if (sourceChange === "removed") await Promise.all([rm(certificateFile), rm(keyFile)]);
      else issue(identity, certificateFile, keyFile);

      if (failure === "an interruption before prior teardown") {
        // An in-process stand-in for a kill right after preactivation: the
        // command records nothing more, restores no route and releases no lease.
        vi.spyOn(FilePortRegistry.prototype, "updateInvocation").mockImplementation(async function (this: FilePortRegistry, id, update) {
          if (id !== first.invocationId && update.state === "starting") throw new Error("killed");
          await updateInvocation.call(this, id, update);
        });
        vi.spyOn(CaddyProxyController.prototype, "restoreInstanceRoutes").mockRejectedValue(new Error("killed"));
        vi.spyOn(FilePortRegistry.prototype, "release").mockRejectedValue(new Error("killed"));
        await orchestrator.up({ config: replacement, root, stateDir, replace: true }).catch(() => undefined);
        vi.restoreAllMocks();
        const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
        const interrupted = (await registry.read()).invocations.filter((item) => item.instanceId === first.instanceId && item.id !== first.invocationId);
        expect(interrupted).toMatchObject([{ state: "planning" }]);
        // The replacement's route is served while the prior lifecycle runs, and status says so.
        const served = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")) as { routes: Array<{ hostname: string; certificateDigest?: string }> };
        expect(served.routes.map((route) => route.hostname)).not.toEqual(first.routes.map((route) => route.hostname));
        expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
        expect(await orchestrator.status({ config: original, root })).toMatchObject({ ok: false, state: "degraded" });
        // down stops the prior lifecycle, removes every route of the instance and ends the interrupted invocation.
        expect((await orchestrator.down({ config: original, root, stateDir })).state).toBe("stopped");
        expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toMatchObject({ routes: [] });
        await expect(fetch(`http://127.0.0.1:${first.allocations[0].port}/`)).rejects.toThrow();
        const recovered = await registry.read();
        expect(recovered.invocations.find((item) => item.id === interrupted[0].id)).toMatchObject({ state: "failed", errorCode: "DEVFN_INTERRUPTED" });
        expect(recovered.allocations.filter((item) => item.instanceId === first.instanceId && ["planned", "active"].includes(item.state))).toEqual([]);
        // A removed certificate is reported, not served from a lost snapshot;
        // once it is fixed, a fresh up serves the route again.
        if (sourceChange === "removed") {
          await expect(orchestrator.up({ config: original, root, stateDir })).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
          issue(identity, certificateFile, keyFile);
        }
        const restarted = await orchestrator.up({ config: original, root, stateDir });
        expect(restarted.state).toBe("ready");
        expect(restarted.routes.map((route) => route.hostname)).toEqual(first.routes.map((route) => route.hostname));
        expect(restarted.routes[0].certificateDigest).not.toBe(digest);
        expect((await orchestrator.down({ config: original, root, stateDir })).state).toBe("stopped");
        return;
      }
      if (rollbackFails) vi.spyOn(CaddyProxyController.prototype, "restoreInstanceRoutes").mockRejectedValue(new Error("injected rollback failure"));
      if (rollbackFails) {
        if (failure === "a failed replacement record") {
          vi.spyOn(FilePortRegistry.prototype, "updateInvocation").mockImplementation(async function (this: FilePortRegistry, id, update) {
            if (id !== first.invocationId && update.state === "starting") throw new Error("injected registry failure");
            await updateInvocation.call(this, id, update);
          });
        } else {
          vi.spyOn(ProcessSupervisor.prototype, "stop").mockImplementation(async function (this: ProcessSupervisor, managed, timeoutMs) {
            if (managed.pid === first.processes[0].pid) throw new Error("injected stop failure");
            await stop.call(this, managed, timeoutMs);
          });
        }
        // The replacement routes stay committed; that is reported, never
        // claimed as the prior routes kept.
        const error = await orchestrator.up({ config: replacement, root, stateDir, replace: true }).then(() => undefined, (caught: unknown) => caught);
        expect(error).toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorInvocationId: first.invocationId, priorStopped: false, routesRestored: false } });
        expect((error as Error).message).toContain("prior routes could not be restored: injected rollback failure");
        const prior = await readReceipt(original, root, first.instanceId);
        if (failure === "a refused prior teardown") {
          expect(prior).toMatchObject({ state: "degraded" });
          expect(prior?.cleanup?.errors).toContain("prior routes could not be restored: injected rollback failure");
        }
        vi.restoreAllMocks();
        expect(await orchestrator.status({ config: original, root })).toMatchObject({ ok: false, state: "degraded" });
        expect((await orchestrator.down({ config: original, root, stateDir })).state).toBe("stopped");
        expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toMatchObject({ routes: [] });
        return;
      }
      if (failure === "a failed replacement record") {
        vi.spyOn(FilePortRegistry.prototype, "updateInvocation").mockImplementation(async function (this: FilePortRegistry, id, update) {
          if (id !== first.invocationId && update.state === "starting") throw new Error("injected registry failure");
          await updateInvocation.call(this, id, update);
        });
      } else {
        vi.spyOn(ProcessSupervisor.prototype, "stop").mockImplementation(async function (this: ProcessSupervisor, managed, timeoutMs) {
          if (managed.pid === first.processes[0].pid) throw new Error("injected stop failure");
          await stop.call(this, managed, timeoutMs);
        });
      }
      const failed = await orchestrator.up({ config: replacement, root, stateDir, replace: true }).then(() => undefined, (caught: unknown) => caught);
      expect(failed).toBeInstanceOf(Error);
      vi.restoreAllMocks();

      // The prior route is served again from the snapshot it was activated
      // with, whatever its source files now hold.
      const routes = JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8")) as { routes: Array<{ hostname: string; certificateDigest?: string }> };
      expect(routes.routes.map(({ hostname, certificateDigest }) => ({ hostname, certificateDigest }))).toEqual(first.routes.map(({ hostname }) => ({ hostname, certificateDigest: digest })));
      const snapshot = path.join(stateDir, "certificates", `${digest}.crt.pem`);
      await access(snapshot);
      await access(path.join(stateDir, "certificates", `${digest}.key.pem`));
      expect(await readFile(path.join(stateDir, "Caddyfile"), "utf8")).toContain(snapshot);
      await expect(access(path.join(stateDir, "proxy-routes.pending.json"))).rejects.toThrow();
      expect(await fetch(`http://127.0.0.1:${first.allocations[0].port}/`).then((response) => response.text())).toBe("old");
      expect(await readReceipt(original, root, first.instanceId)).toMatchObject({ invocationId: first.invocationId,
        state: failure === "a failed replacement record" ? "ready" : "degraded" });
      if (failure === "a failed replacement record") expect((failed as Error).message).toBe("injected registry failure");
      else expect(failed).toMatchObject({ code: "DEVFN_RUNTIME_INVALID", details: { priorInvocationId: first.invocationId, priorStopped: false, routesRestored: true } });
      expect((await orchestrator.down({ config: original, root, stateDir })).state).toBe("stopped");
    } finally {
      vi.restoreAllMocks();
      await orchestrator.down({ config: original, root, stateDir }).catch(() => undefined);
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(parent, { recursive: true, force: true });
    }
  }
});
