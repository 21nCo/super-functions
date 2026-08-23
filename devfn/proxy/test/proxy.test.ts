import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CaddyProxyController, proxyOwnerStatus, renderCaddyfile } from "../src/index.js";

describe("Caddy route rendering", () => {
  it("renders explicit routes without a catch-all", () => {
    const output = renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" }]);
    expect(output).toContain("http://app-i.localhost {\n  reverse_proxy 127.0.0.1:4100\n}");
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

  it("fails closed on corrupt persisted route state", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    await writeFile(path.join(stateDir, "proxy-routes.json"), "{not-json");
    await expect(new CaddyProxyController(stateDir).routes()).rejects.toMatchObject({ code: "DEVFN_PROXY_CONFIG_INVALID" });
  });

  it("recovers a route activation journal before serving state to cleanup", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-"));
    const pendingPath = path.join(stateDir, "proxy-routes.pending.json");
    const route = { id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" } as const;
    await writeFile(pendingPath, `${JSON.stringify({ version: 1, routes: [route] })}\n`);
    await expect(new CaddyProxyController(stateDir).routes()).resolves.toEqual([route]);
    expect(JSON.parse(await readFile(path.join(stateDir, "proxy-routes.json"), "utf8"))).toEqual({ version: 1, routes: [route] });
    await expect(access(pendingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("distinguishes dead proxy owners from live PID reuse", async () => {
    await expect(proxyOwnerStatus({ pid: 2_147_483_647, birthSignature: "missing" })).resolves.toBe("dead");
    await expect(proxyOwnerStatus({ pid: process.pid, birthSignature: "different-process" })).resolves.toBe("identity-mismatch");
  });
});
