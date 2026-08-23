import { describe, expect, it } from "vitest";

import { parseDockerListeners } from "../src/index.js";

describe("Docker listener parsing", () => {
  it("associates published ports with container IDs and names", () => {
    expect(parseDockerListeners([
      "abc123\tdevfn-api-1\t127.0.0.1:4100->3000/tcp, [::]:4101->3001/udp",
      "def456\tdevfn-worker-1\t",
      "",
    ].join("\n"))).toEqual([
      { containerId: "abc123", process: "devfn-api-1", host: "127.0.0.1", port: 4100, protocol: "tcp", source: "docker" },
      { containerId: "abc123", process: "devfn-api-1", host: "[::]", port: 4101, protocol: "udp", source: "docker" },
    ]);
  });
});
