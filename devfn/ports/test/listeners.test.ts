import { describe, expect, it } from "vitest";

import { parseDockerListeners, parseWindowsNetstatListeners } from "../src/index.js";

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
