import { describe, expect, it } from "vitest";

import { selectOwnershipListeners } from "../src/index.js";
import type { ListenerInfo, PortAllocation } from "@devfn/ports";

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
});
