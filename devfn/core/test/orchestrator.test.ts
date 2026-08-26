import { describe, expect, it } from "vitest";

import { hasRecordedProcessOwner, resolveAllocationUrls, selectOwnershipListeners, verifyOwnedLoopbackListeners } from "../src/index.js";
import type { ListenerInfo, PortAllocation } from "@devfn/ports";
import type { ProxyRoute } from "@devfn/proxy";

describe("orchestrator listener ownership", () => {
  it("keeps unrelated host listeners while suppressing Docker proxy duplicates", () => {
    const allocation = { container: { id: "abc123full" } } as PortAllocation;
    const docker = { source: "docker", containerId: "abc123", process: "devfn-api-1", protocol: "tcp", host: "127.0.0.1", port: 4100 } as ListenerInfo;
    const proxy = { source: "os", pid: 10, process: "docker-proxy", protocol: "tcp", host: "127.0.0.1", port: 4100 } as ListenerInfo;
    const unrelated = { source: "os", pid: 11, process: "node", protocol: "tcp", host: "127.0.0.1", port: 4100 } as ListenerInfo;
    expect(selectOwnershipListeners(allocation, [docker, proxy, unrelated])).toEqual([docker, unrelated]);
    expect(selectOwnershipListeners(undefined, [proxy, unrelated])).toEqual([proxy, unrelated]);
    expect(selectOwnershipListeners({} as PortAllocation, [proxy])).toEqual([proxy]);
  });

  it("scopes recorded process owners to the current project and instance", () => {
    const allocation = { projectId: "other", instanceId: "other-instance", service: "app", protocol: "tcp", state: "active", process: { pid: 1 } } as PortAllocation;
    const ports = new Map<string, "tcp" | "udp">([["app", "tcp"]]);
    expect(hasRecordedProcessOwner([allocation], "current", "current-instance", ports, "tcp")).toBe(false);
    expect(hasRecordedProcessOwner([{ ...allocation, projectId: "current", instanceId: "current-instance" }], "current", "current-instance", ports, "tcp")).toBe(true);
    expect(hasRecordedProcessOwner([{ ...allocation, projectId: "current", instanceId: "current-instance", protocol: "udp" }], "current", "current-instance", ports, "tcp")).toBe(false);
  });

  it("does not assign a TCP proxy URL to a UDP allocation on the same port", () => {
    const allocation = { service: "web", protocol: "tcp", port: 4100 } as PortAllocation;
    const udp = { service: "socket", protocol: "udp", port: 4100 } as PortAllocation;
    const route = { hostname: "web.localhost", targetPort: 4100, tls: "off" } as ProxyRoute;
    expect(resolveAllocationUrls([allocation, udp], [route], new Set())).toEqual({ web: "http://web.localhost" });
  });

  it("rejects undeclared public listeners owned by a local process", async () => {
    await expect(verifyOwnedLoopbackListeners("app", [], process.pid, {
      listeners: [{ protocol: "tcp", host: "0.0.0.0", port: 4100, pid: process.pid, source: "os" }],
      inspection: { tcp: true, udp: true, docker: false },
    })).rejects.toThrow(/exposed port 4100 beyond loopback/);
  });
});
