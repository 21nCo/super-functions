import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { X509Certificate } from "node:crypto";

import { processBirthSignature } from "@devfn/processes";
import { withFileLock } from "@devfn/ports";
import { CaddyProxyController, domainContains, readRegisteredDomains, registerDomain, renderCaddyfile, unregisterDomain, verifyCertificate, verifyLocalDns } from "../src/index.js";

const route = (id: string, pathValue: string, match: "exact" | "prefix", targetPort: number, stripPrefix = false) => ({
  id, instanceId: "fixture", hostname: "app.localhost", targetHost: "127.0.0.1", targetPort,
  tls: "off" as const, updatedAt: "now", path: pathValue, match, stripPrefix,
});

describe("registered local domains", () => {
  it("uses DNS label boundaries and rejects missing, mixed and nonloopback answers", async () => {
    expect(domainContains("dev.example.test", "api.dev.example.test")).toBe(true);
    expect(domainContains("dev.example.test", "api.dev.example.test.evil.test")).toBe(false);
    expect(domainContains("dev.example.test", "apidev.example.test")).toBe(false);
    const resolver = (addresses: string[]) => async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    await expect(verifyLocalDns("api.example.test", resolver([]) as never)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
    await expect(verifyLocalDns("api.example.test", resolver(["127.0.0.1", "192.0.2.1"]) as never)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
    await expect(verifyLocalDns("api.example.test", resolver(["::1", "127.2.3.4"]) as never)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
    await expect(verifyLocalDns("api.example.test", resolver(["127.0.0.1"]) as never)).resolves.toBeUndefined();
    await expect(verifyLocalDns("api.example.test", (() => new Promise(() => {})) as never, 20))
      .rejects.toMatchObject({ code: "DEVFN_DOMAIN_DNS_INVALID" });
  });

  it("fails closed on corrupt machine state", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-domains-"));
    try {
      await writeFile(path.join(stateDir, "domains.json"), '{"version":1,"domains":[{"domain":"bad.test.evil.test","tls":"internal"}]}');
      await expect(readRegisteredDomains(stateDir)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_INVALID" });
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  });

  it("binds registrations to one repository and rejects overlapping ownership", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-domains-"));
    const repo = await mkdtemp(path.join(tmpdir(), "devfn-repo-"));
    const resolve = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    try {
      await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: repo, tls: "internal" }, resolve);
      expect(await readRegisteredDomains(stateDir)).toHaveLength(1);
      await expect(registerDomain(stateDir, { domain: "other.dev.example.test", projectId: "fixture", repositoryIdentity: repo, tls: "internal" }, resolve))
        .rejects.toMatchObject({ code: "DEVFN_DOMAIN_IN_USE" });
      await expect(unregisterDomain(stateDir, "dev.example.test", "other", repo)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_UNREGISTERED" });
      await unregisterDomain(stateDir, "dev.example.test", "fixture", repo);
      expect(await readRegisteredDomains(stateDir)).toEqual([]);
    } finally { await rm(stateDir, { recursive: true, force: true }); await rm(repo, { recursive: true, force: true }); }
  });

  it("keeps a registration when either persisted route file cannot prove absence", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-domain-state-"));
    const resolve = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    try {
      await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: stateDir, tls: "internal" }, resolve);
      for (const file of ["proxy-routes.json", "proxy-routes.pending.json"]) {
        const valid = { id: "other", instanceId: "other", hostname: "other.localhost", targetHost: "127.0.0.1",
          targetPort: 4100, tls: "off", updatedAt: new Date().toISOString() };
        for (const state of [{}, { version: 1 }, { version: 1, routes: [null] }, { version: 1, routes: [{ registeredDomain: "other.test" }] },
          ...["id", "instanceId", "hostname", "updatedAt"].map((field) => ({ version: 1, routes: [{ ...valid, [field]: "" }] }))]) {
          await writeFile(path.join(stateDir, file), JSON.stringify(state));
          await expect(unregisterDomain(stateDir, "dev.example.test", "fixture", stateDir)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_INVALID" });
          expect((await readRegisteredDomains(stateDir)).map((item) => item.domain)).toEqual(["dev.example.test"]);
        }
        await rm(path.join(stateDir, file));
      }
      await unregisterDomain(stateDir, "dev.example.test", "fixture", stateDir);
      expect(await readRegisteredDomains(stateDir)).toEqual([]);
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  });

  it("waits for an in-flight proxy mutation before registering or unregistering domains", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-domain-lock-"));
    const resolve = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    const entry = (domain: string) => ({ domain, projectId: "fixture", repositoryIdentity: stateDir, tls: "internal" as const });
    try {
      await registerDomain(stateDir, entry("first.example.test"), resolve);
      let signalLocked!: () => void;
      const locked = new Promise<void>((resolveLocked) => { signalLocked = resolveLocked; });
      const holder = withFileLock(path.join(stateDir, "proxy.lock"), async () => {
        signalLocked();
        await new Promise((resolveWait) => setTimeout(resolveWait, 10_500));
      });
      await locked;
      const register = registerDomain(stateDir, entry("second.example.test"), resolve);
      const unregister = unregisterDomain(stateDir, "first.example.test", "fixture", stateDir);
      await holder;
      await expect(register).resolves.toMatchObject({ domain: "second.example.test" });
      await expect(unregister).resolves.toBeUndefined();
      expect((await readRegisteredDomains(stateDir)).map((item) => item.domain)).toEqual(["second.example.test"]);
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  }, 15_000);

  it("requires a valid matching certificate that covers the generated host", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "devfn-cert-"));
    const certificateFile = path.join(directory, "cert.pem");
    const keyFile = path.join(directory, "key.pem");
    try {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=*.dev.example.test", "-addext", "subjectAltName=DNS:*.dev.example.test"], { stdio: "ignore" });
      await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, keyFile)).resolves.toBeUndefined();
      const certificate = new X509Certificate(await readFile(certificateFile));
      const now = vi.spyOn(Date, "now");
      try {
        now.mockReturnValue(Date.parse(certificate.validFrom) - 1);
        await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, keyFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
        now.mockReturnValue(Date.parse(certificate.validTo));
        await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, keyFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      } finally { now.mockRestore(); }
      await expect(verifyCertificate("app.other.example.test", certificateFile, keyFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, certificateFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=app-fixture.dev.example.test"], { stdio: "ignore" });
      await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, keyFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("registers exact-alias SAN material and rejects an uncovered route before reload", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-exact-cert-"));
    const repo = await mkdtemp(path.join(tmpdir(), "devfn-exact-repo-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-exact-tools-"));
    const certificateFile = path.join(stateDir, "cert.pem");
    const keyFile = path.join(stateDir, "key.pem");
    const originalPath = process.env.PATH;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    const resolve = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    try {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=unrelated.test", "-addext", "subjectAltName=DNS:app-main.dev.example.test,DNS:app.dev.example.test"], { stdio: "ignore" });
      const registration = await registerDomain(stateDir, {
        domain: "dev.example.test", projectId: "fixture", repositoryIdentity: repo, tls: "certificate", certificateFile, keyFile,
      }, resolve);
      expect(registration.domain).toBe("dev.example.test");
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const controller = new CaddyProxyController(stateDir, resolve);
      const route = (id: string, hostname: string) => ({ id, instanceId: "main", hostname, targetHost: "127.0.0.1", targetPort: 4100,
        tls: "certificate" as const, registeredDomain: registration.domain, projectId: registration.projectId,
        repositoryIdentity: registration.repositoryIdentity, certificateFile, keyFile });
      await controller.upsert([route("readable", "app-main.dev.example.test"), route("canonical", "app.dev.example.test")]);
      await expect(unregisterDomain(stateDir, registration.domain, "fixture", repo)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_IN_USE" });
      await expect(controller.upsert([route("uncovered", "app-child.dev.example.test")])).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      expect((await controller.routes()).map((item) => item.hostname).sort()).toEqual(["app-main.dev.example.test", "app.dev.example.test"]);
      expect(await readFile(path.join(stateDir, "Caddyfile"), "utf8")).not.toContain("app-child.dev.example.test");
      await controller.removeInstance("main");
      await writeFile(path.join(stateDir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: [{
        ...route("pending", "app.dev.example.test"), updatedAt: new Date().toISOString(),
      }] }));
      await expect(unregisterDomain(stateDir, registration.domain, "fixture", repo)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_IN_USE" });
      await rm(path.join(stateDir, "proxy-routes.pending.json"));
      await unregisterDomain(stateDir, registration.domain, "fixture", repo);
      expect(await readRegisteredDomains(stateDir)).toEqual([]);
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(repo, { recursive: true, force: true });
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("retains activated certificate material while a sibling stops after the source disappears", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-cert-liveness-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-cert-tools-"));
    const originalPath = process.env.PATH;
    const certificateFile = path.join(stateDir, "source.crt.pem");
    const keyFile = path.join(stateDir, "source.key.pem");
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    const resolve = (async () => [{ address: "127.0.0.1", family: 4 }]) as never;
    try {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=a.dev.example.test", "-addext", "subjectAltName=DNS:a.dev.example.test"], { stdio: "ignore" });
      const registration = await registerDomain(stateDir, { domain: "dev.example.test", projectId: "fixture", repositoryIdentity: stateDir,
        tls: "certificate", certificateFile, keyFile }, resolve);
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const controller = new CaddyProxyController(stateDir, resolve);
      const retained = { id: "a", instanceId: "a", hostname: "a.dev.example.test", targetHost: "127.0.0.1", targetPort: 4101,
        tls: "certificate" as const, registeredDomain: "dev.example.test", projectId: "fixture", repositoryIdentity: registration.repositoryIdentity, certificateFile, keyFile };
      const sibling = { id: "b", instanceId: "b", hostname: "b.localhost", targetHost: "127.0.0.1", targetPort: 4102, tls: "off" as const };
      await controller.upsert([retained]);
      await controller.upsert([sibling]);
      const digest = (await controller.routes()).find((route) => route.id === "a")?.certificateDigest;
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      if (process.platform !== "win32") {
        expect((await stat(path.join(stateDir, "certificates"))).mode & 0o777).toBe(0o700);
        expect((await stat(path.join(stateDir, "certificates", `${digest}.key.pem`))).mode & 0o777).toBe(0o600);
      }
      await rm(certificateFile); await rm(keyFile);
      await controller.removeInstance("b");
      expect((await controller.routes()).map((route) => route.id)).toEqual(["a"]);
      const config = await readFile(path.join(stateDir, "Caddyfile"), "utf8");
      expect(config).toContain(path.join(stateDir, "certificates", `${digest}.crt.pem`));
      expect(config).not.toContain(certificateFile);
      if (process.env.DEVFN_REAL_PROXY === "1") {
        execFileSync("caddy", ["validate", "--config", path.join(stateDir, "Caddyfile"), "--adapter", "caddyfile"],
          { env: { ...process.env, PATH: originalPath }, stdio: "pipe" });
      }
      await expect(controller.upsert([retained])).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      expect((await controller.routes()).map((route) => route.id)).toEqual(["a"]);
      await writeFile(path.join(stateDir, "proxy-routes.pending.json"), JSON.stringify({ version: 1, routes: (await controller.routes()).filter((route) => route.id !== "a") }));
      await controller.routes();
      expect(await controller.routes()).toEqual([]);
      await expect(readFile(path.join(stateDir, "certificates", `${digest}.key.pem`))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(toolsDir, { recursive: true, force: true });
    }
  });
});

describe("host/path Caddy configuration", () => {
  it("orders exact before prefix, preserves segment boundaries and strips only when requested", () => {
    const output = renderCaddyfile([route("prefix", "/api", "prefix", 4102, true), route("exact", "/api", "exact", 4101)]);
    expect(output.indexOf("@route0 path /api\n")).toBeLessThan(output.indexOf("@route1 path /api /api/*"));
    expect(output).toContain("uri strip_prefix /api");
    expect(output).not.toContain("path /api*");
    expect(output).toContain("respond 404");
    expect(() => renderCaddyfile([route("a", "/api", "prefix", 4101), route("b", "/api", "prefix", 4102)])).toThrow(/Ambiguous route/);
    expect(() => renderCaddyfile([route("a", "/api", "prefix", 4101), route("b", "/API/", "prefix", 4102)])).toThrow(/Ambiguous route/);
    expect(() => renderCaddyfile([route("a", "/api", "exact", 4101), route("b", "/API", "exact", 4102)])).toThrow(/Ambiguous route/);
    expect(() => renderCaddyfile([route("a", "/api", "exact", 4101), route("b", "/api/", "exact", 4102)])).not.toThrow();
  });

  it("reserves an entire hostname for one instance even when paths differ", () => {
    expect(() => renderCaddyfile([
      { ...route("first", "/one", "exact", 4101), instanceId: "first" },
      { ...route("second", "/two", "exact", 4102), instanceId: "second" },
    ])).toThrow(/already owned by another instance/);
  });

  it("rejects malformed paths and nonloopback targets before Caddy reload", () => {
    expect(() => renderCaddyfile([{ ...route("bad", "/api%2fadmin", "exact", 4101) }])).toThrow(/Invalid proxy path/);
    expect(() => renderCaddyfile([{ ...route("bad", "/api", "exact", 4101), targetHost: "192.0.2.1" }])).toThrow(/loopback/);
  });

  it("keeps another worktree's routes when one stops or replaces its selection", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-routes-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-tools-"));
    const originalPath = process.env.PATH;
    const birthSignature = await processBirthSignature(process.pid);
    if (!birthSignature) throw new Error("Test process has no birth signature.");
    try {
      await writeFile(path.join(stateDir, "proxy-owner.json"), JSON.stringify({ pid: process.pid, birthSignature }));
      await writeFile(path.join(toolsDir, "caddy"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      process.env.PATH = `${toolsDir}${path.delimiter}${originalPath ?? ""}`;
      const controller = new CaddyProxyController(stateDir);
      const first = { ...route("one", "/", "prefix", 4101), instanceId: "one", hostname: "app-one.localhost" };
      const second = { ...route("two", "/", "prefix", 4102), instanceId: "two", hostname: "app-two.localhost" };
      await controller.upsert([first]);
      await controller.upsert([second]);
      expect((await controller.routes()).map((item) => item.hostname).sort()).toEqual(["app-one.localhost", "app-two.localhost"]);
      await controller.upsert([{ ...first, id: "one-new", hostname: "changed-one.localhost" }]);
      expect((await controller.routes()).map((item) => item.hostname).sort()).toEqual(["app-two.localhost", "changed-one.localhost"]);
      await controller.removeInstance("one");
      expect((await controller.routes()).map((item) => item.hostname)).toEqual(["app-two.localhost"]);
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
      await rm(stateDir, { recursive: true, force: true }); await rm(toolsDir, { recursive: true, force: true });
    }
  });
});
