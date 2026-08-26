import { describe, expect, it } from "vitest";

import { defineMcpFnServer, structuredResult } from "../src/index.js";

describe("McpFn server declarations", () => {
  it("uses one declaration for manifests and runtime construction", () => {
    const declaration = defineMcpFnServer({
      info: { name: "minimal", version: "1.0.0" },
      transports: ["stdio", "streamable-http"],
      tools: [{
        name: "ping",
        description: "Return a pong.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async () => structuredResult({ pong: true }),
      }],
    });

    expect(declaration.manifest()).toMatchObject({
      server: { name: "minimal", version: "1.0.0" },
      transports: ["stdio", "streamable-http"],
      tools: [{ name: "ping" }],
    });
    expect(declaration.createServer().registry.listTools()).toMatchObject([
      { name: "ping" },
    ]);
  });
});
