import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { bindProbe, parseDockerListeners, parseProxyOwner, parseWindowsNetstatListeners, withRoutingLock } from "../src/index.js";

describe("Docker listener parsing", () => {
  it("associates published ports with container IDs and names", () => {
    expect(parseDockerListeners([
      "abc123\tdevfn-api-1\t127.0.0.1:4100->3000/tcp, [::]:4101->3001/udp, 0.0.0.0:4102->3002/tcp",
      "def456\tdevfn-worker-1\t",
      "",
    ].join("\n"))).toEqual([
      { containerId: "abc123", process: "devfn-api-1", host: "127.0.0.1", port: 4100, protocol: "tcp", source: "docker" },
      { containerId: "abc123", process: "devfn-api-1", host: "[::]", port: 4101, protocol: "udp", source: "docker" },
      { containerId: "abc123", process: "devfn-api-1", host: "0.0.0.0", port: 4102, protocol: "tcp", source: "docker" },
    ]);
  });

  it("retains Windows netstat local addresses", () => {
    expect(parseWindowsNetstatListeners([
      "  TCP    127.0.0.1:4100    0.0.0.0:0    LISTENING    101",
      "  TCP    [::1]:4101        [::]:0       LISTENING    102",
    ].join("\n"), "tcp")).toEqual([
      { protocol: "tcp", host: "127.0.0.1", port: 4100, pid: 101, source: "os" },
      { protocol: "tcp", host: "[::1]", port: 4101, pid: 102, source: "os" },
    ]);
  });
});

describe("listener and owner evidence", () => {
  it("reports a bind that fails for a missing address as unavailable, not occupied", async () => {
    // 192.0.2.1 (TEST-NET-1) is not an address of this host.
    expect(await bindProbe(0, "tcp", "192.0.2.1")).toBe("unavailable");
    expect(await bindProbe(0, "udp", "192.0.2.1")).toBe("unavailable");
  });

  it("rejects an owner PID that is not a safe integer", () => {
    expect(() => parseProxyOwner(JSON.stringify({ pid: 9_007_199_254_740_992 }))).toThrow(/Invalid proxy owner/);
    expect(parseProxyOwner(JSON.stringify({ pid: 4242 }))).toEqual({ pid: 4242 });
  });
});

describe("routing lock", () => {
  it("re-enters a held routing lock through another spelling of its state directory", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "devfn-routing-alias-"));
    const stateDir = path.join(parent, "state");
    const alias = path.join(parent, "alias");
    try {
      await mkdir(stateDir);
      await symlink(stateDir, alias);
      expect(await withRoutingLock(stateDir, async () => await withRoutingLock(alias, async () => "nested"))).toBe("nested");
    } finally { await rm(parent, { recursive: true, force: true }); }
  }, 10_000);

  it("recovers a routing lock left by a verified-dead holder well within a waiter's budget", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-routing-stale-"));
    try {
      // A holder that crashed two minutes ago: its PID no longer exists.
      await mkdir(path.join(stateDir, "routing.lock"));
      await writeFile(path.join(stateDir, "routing.lock", "owner.json"), JSON.stringify({ token: "crashed", pid: 2_147_483_646,
        createdAt: new Date(Date.now() - 120_000).toISOString() }));
      expect(await withRoutingLock(stateDir, async () => "recovered")).toBe("recovered");
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  }, 10_000);
});
