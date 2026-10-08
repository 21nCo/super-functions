import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { processBirthSignature } from "@devfn/processes";
import { CaddyProxyController, proxyOwnerStatus, renderCaddyfile } from "../src/index.js";

describe("Caddy route rendering", () => {
  it("renders explicit routes without a catch-all", () => {
    const output = renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" }]);
    expect(output).toContain("http://app-i.localhost {\n  reverse_proxy 127.0.0.1:4100\n}");
    expect(output).toContain("default_bind 127.0.0.1\n");
    expect(renderCaddyfile([], true)).toContain("default_bind 127.0.0.1 [::1]");
    expect(output).toContain("skip_install_trust");
    expect(output).toContain("http:// {\n  respond 404\n}");
    expect(output).not.toContain(":80 {");
    expect(output).not.toContain("* {");
    expect(output).not.toContain(":443 {");
  });

  it("brackets IPv6 loopback targets and rejects invalid route fields", () => {
    const output = renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "::1", targetPort: 4100, tls: "off", updatedAt: "now" }]);
    expect(output).toContain("reverse_proxy [::1]:4100");
    expect(() => renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app.localhost\n:80", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" }])).toThrow(/concrete/);
  });

  it("rejects non-integer proxy ports", () => {
    expect(() => renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app.localhost", targetHost: "127.0.0.1", targetPort: Number.NaN, tls: "off", updatedAt: "now" }])).toThrow(/integer/);
  });

  it("rejects route names that DNS treats as the same hostname", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-case-"));
    try {
      await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify({ version: 1, routes: [
        { id: "first", instanceId: "owner", hostname: "api-owner.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" },
      ] }));
      await expect(new CaddyProxyController(stateDir).upsert([{ id: "second", instanceId: "OWNER", hostname: "API-OWNER.localhost", targetHost: "127.0.0.1", targetPort: 4101, tls: "off" }]))
        .rejects.toThrow(/already owned/);
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  });

  it("fails closed on corrupt persisted route state", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    await writeFile(path.join(stateDir, "proxy-routes.json"), "{not-json");
    await expect(new CaddyProxyController(stateDir).routes()).rejects.toMatchObject({ code: "DEVFN_PROXY_CONFIG_INVALID" });
  });

  it("removes another instance and recovers its removal when a retained domain loses DNS", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-domain-cleanup-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const originalPath = process.env.PATH;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    const retained = { id: "a", instanceId: "a", hostname: "a.invalid.test", targetHost: "127.0.0.1", targetPort: 4101,
      tls: "internal" as const, registeredDomain: "invalid.test", projectId: "fixture", repositoryIdentity: stateDir, updatedAt: "now" };
    const removed = { id: "b", instanceId: "b", hostname: "b.localhost", targetHost: "127.0.0.1", targetPort: 4102,
      tls: "off" as const, updatedAt: "now" };
    try {
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const controller = new CaddyProxyController(stateDir);
      await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify({ version: 1, routes: [retained, removed] }));
      await controller.removeInstance("b");
      expect(await controller.routes()).toEqual([retained]);
      await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify({ version: 1, routes: [retained, removed] }));
      await writeFile(path.join(stateDir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: [retained] }));
      expect(await controller.routes()).toEqual([retained]);
      await expect(controller.upsert([retained])).rejects.toMatchObject({ code: "DEVFN_DOMAIN_UNREGISTERED" });
      await controller.upsert([removed]);
      const committedBefore = await controller.routes();
      await writeFile(path.join(stateDir, "domains.json"), JSON.stringify({ version: 1, domains: [
        { domain: "invalid.test", projectId: "fixture", repositoryIdentity: stateDir, tls: "internal" },
      ] }));
      const failedActivation = { ...retained, id: "new-domain", instanceId: "new", hostname: "new.invalid.test" };
      await writeFile(path.join(stateDir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: [...committedBefore, failedActivation] }));
      expect(await controller.routes()).toEqual(committedBefore);
      expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual({ version: 1, routes: committedBefore });
      expect(await controller.routes()).toEqual(committedBefore);
      await controller.removeInstance("b");
      expect(await controller.routes()).toEqual([retained]);
      expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual({ version: 1, routes: [retained] });
      await expect(access(path.join(stateDir, "proxy-routes.pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(controller.upsert([failedActivation])).rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
      expect(await controller.routes()).toEqual([retained]);
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("releases the shared lock after a stalled domain lookup so a sibling can stop", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-dns-lock-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const originalPath = process.env.PATH;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    const sibling = { id: "sibling", instanceId: "sibling", hostname: "sibling.localhost", targetHost: "127.0.0.1", targetPort: 4101, tls: "off" as const };
    const stalled = { id: "stalled", instanceId: "stalled", hostname: "stalled.dev.example.test", targetHost: "127.0.0.1", targetPort: 4102,
      tls: "internal" as const, registeredDomain: "dev.example.test", projectId: "fixture", repositoryIdentity: stateDir };
    try {
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(stateDir, "domains.json"), JSON.stringify({ version: 1, domains: [
        { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: stateDir, tls: "internal" },
      ] }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      let signalLookup!: () => void;
      const lookupStarted = new Promise<void>((resolve) => { signalLookup = resolve; });
      const controller = new CaddyProxyController(stateDir, (async () => { signalLookup(); return await new Promise(() => {}); }) as never, 50);
      await controller.upsert([sibling]);
      const activation = controller.upsert([stalled]);
      await lookupStarted;
      const cleanup = controller.removeInstance("sibling");
      await expect(activation).rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
      await expect(cleanup).resolves.toBeUndefined();
      expect(await controller.routes()).toEqual([]);
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("an empty owner selection recovers pending state and removes only that owner's routes", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-empty-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const originalPath = process.env.PATH;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    const first = { id: "a", instanceId: "a", hostname: "a.localhost", targetHost: "127.0.0.1", targetPort: 4101, tls: "off" as const, updatedAt: "now" };
    const sibling = { id: "b", instanceId: "b", hostname: "b.localhost", targetHost: "127.0.0.1", targetPort: 4102, tls: "off" as const, updatedAt: "now" };
    try {
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(stateDir, "proxy-routes.json"), JSON.stringify({ version: 1, routes: [first] }));
      await writeFile(path.join(stateDir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: [first, sibling] }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const controller = new CaddyProxyController(stateDir);
      await expect(controller.upsert([], "a")).resolves.toEqual([]);
      expect(await controller.routes()).toEqual([sibling]);
      expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual({ version: 1, routes: [sibling] });
      await expect(access(path.join(stateDir, "proxy-routes.pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(controller.upsert([])).rejects.toMatchObject({ code: "DEVFN_PROXY_CONFIG_INVALID" });
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("replays and commits a valid route activation journal", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    const pendingPath = path.join(stateDir, "proxy-routes.pending.json");
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const caddyLog = path.join(stateDir, "caddy.log");
    const route = { id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" } as const;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    await writeFile(pendingPath, `${JSON.stringify({ version: 1, routes: [route] })}\n`);
    await writeFile(path.join(stateDir, "proxy-owner.json"), `${JSON.stringify({ pid: process.pid, birthSignature })}\n`);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$DEVFN_TEST_CADDY_LOG\"\nexit 0\n", { mode: 0o700 });
    const originalPath = process.env.PATH;
    const originalLog = process.env.DEVFN_TEST_CADDY_LOG;
    try {
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      process.env.DEVFN_TEST_CADDY_LOG = caddyLog;
      await expect(new CaddyProxyController(stateDir).routes()).resolves.toEqual([route]);
      expect(await readFile(caddyLog, "utf8")).toContain("reload --config");
      expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual({ version: 1, routes: [route] });
      await expect(access(pendingPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      if (originalLog === undefined) delete process.env.DEVFN_TEST_CADDY_LOG; else process.env.DEVFN_TEST_CADDY_LOG = originalLog;
      await rm(stateDir, { recursive: true, force: true });
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("preserves a route activation journal when recovery reload fails", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    const pendingPath = path.join(stateDir, "proxy-routes.pending.json");
    const statePath = path.join(stateDir, "proxy-routes.json");
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const caddyLog = path.join(stateDir, "caddy.log");
    const previousRoute = { id: "old", instanceId: "i", hostname: "old-i.localhost", targetHost: "127.0.0.1", targetPort: 4099, tls: "off", updatedAt: "before" } as const;
    const route = { id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" } as const;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    await writeFile(statePath, `${JSON.stringify({ version: 1, routes: [previousRoute] })}\n`);
    await writeFile(pendingPath, `${JSON.stringify({ version: 1, routes: [route] })}\n`);
    await writeFile(path.join(stateDir, "proxy-owner.json"), `${JSON.stringify({ pid: process.pid, birthSignature })}\n`);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$DEVFN_TEST_CADDY_LOG\"\nif [ \"$1\" = reload ]; then exit 1; fi\nexit 0\n", { mode: 0o700 });
    const originalPath = process.env.PATH;
    const originalLog = process.env.DEVFN_TEST_CADDY_LOG;
    try {
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      process.env.DEVFN_TEST_CADDY_LOG = caddyLog;
      await expect(new CaddyProxyController(stateDir).routes()).rejects.toMatchObject({ code: "DEVFN_PROXY_RELOAD_FAILED" });
      expect(await readFile(caddyLog, "utf8")).toContain("reload --config");
      expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({ version: 1, routes: [previousRoute] });
      expect(JSON.parse(await readFile(pendingPath, "utf8"))).toEqual({ version: 1, routes: [route] });
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      if (originalLog === undefined) delete process.env.DEVFN_TEST_CADDY_LOG; else process.env.DEVFN_TEST_CADDY_LOG = originalLog;
      await rm(stateDir, { recursive: true, force: true });
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("serializes route reads with an in-flight proxy activation", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-tools-"));
    const reloadMarker = path.join(stateDir, "reload-started");
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    await writeFile(path.join(stateDir, "proxy-owner.json"), `${JSON.stringify({ pid: process.pid, birthSignature })}\n`);
    await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nif [ \"$1\" = reload ]; then : > \"$DEVFN_TEST_RELOAD_MARKER\"; sleep 0.2; fi\nexit 0\n", { mode: 0o700 });
    const originalPath = process.env.PATH;
    const originalMarker = process.env.DEVFN_TEST_RELOAD_MARKER;
    let update: Promise<unknown> | undefined;
    try {
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      process.env.DEVFN_TEST_RELOAD_MARKER = reloadMarker;
      const controller = new CaddyProxyController(stateDir);
      const route = { id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off" as const };
      update = controller.upsert([route]);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await access(reloadMarker).then(() => true).catch(() => false)) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await expect(access(reloadMarker)).resolves.toBeUndefined();
      const [, routes] = await Promise.all([update, controller.routes()]);
      expect(routes).toEqual([expect.objectContaining(route)]);
    } finally {
      await update?.catch(() => undefined);
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      if (originalMarker === undefined) delete process.env.DEVFN_TEST_RELOAD_MARKER; else process.env.DEVFN_TEST_RELOAD_MARKER = originalMarker;
      await rm(stateDir, { recursive: true, force: true });
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("distinguishes dead proxy owners from live PID reuse", async () => {
    await expect(proxyOwnerStatus({ pid: 2_147_483_647, birthSignature: "missing" })).resolves.toBe("dead");
    await expect(proxyOwnerStatus({ pid: process.pid, birthSignature: "different-process" })).resolves.toBe("identity-mismatch");
  });
});
