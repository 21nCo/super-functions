import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

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
import { processBirthSignature } from "@devfn/processes";
import { proxyListenerPorts, registerDomain } from "@devfn/proxy";
import { DevFnOrchestrator, domainAliases, resolveInstanceIdentity, writeReceipt } from "../src/index.js";

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
