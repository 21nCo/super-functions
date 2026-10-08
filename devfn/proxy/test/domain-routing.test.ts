import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { processBirthSignature } from "@devfn/processes";
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
    await expect(verifyLocalDns("api.example.test", resolver(["::1", "127.2.3.4"]) as never)).resolves.toBeUndefined();
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

  it("requires a valid matching certificate that covers the generated host", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "devfn-cert-"));
    const certificateFile = path.join(directory, "cert.pem");
    const keyFile = path.join(directory, "key.pem");
    try {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certificateFile,
        "-days", "1", "-subj", "/CN=*.dev.example.test", "-addext", "subjectAltName=DNS:*.dev.example.test"], { stdio: "ignore" });
      await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, keyFile)).resolves.toBeUndefined();
      await expect(verifyCertificate("app.other.example.test", certificateFile, keyFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
      await expect(verifyCertificate("app-fixture.dev.example.test", certificateFile, certificateFile)).rejects.toMatchObject({ code: "DEVFN_DOMAIN_CERT_INVALID" });
    } finally { await rm(directory, { recursive: true, force: true }); }
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
