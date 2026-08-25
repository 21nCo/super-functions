import { describe, expect, it } from "vitest";
import {
  McpFnRegistry,
  createMcpFnServer,
  structuredResult,
} from "@mcpfn/core";

import {
  McpFnTestClient,
  MCPFN_HOST_PROFILES,
  assertManifestContract,
  buildOfficialConformanceArgs,
  checkHostCompatibility,
  runScenarios,
} from "../src/index.js";

describe("McpFn testing", () => {
  it("checks manifests and deterministic semantic scenarios", async () => {
    const registry = new McpFnRegistry().register({
      name: "echo",
      description: "Echo a value.",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
      handler: async ({ value }) => structuredResult({ value }),
    });
    const server = createMcpFnServer({
      info: { name: "test", version: "1.0.0" },
      registry,
    });
    const client = await McpFnTestClient.connect(server);
    try {
      await expect(assertManifestContract(client, server.manifest())).resolves.toHaveLength(1);
      const results = await runScenarios(client, [
        {
          name: "echoes",
          tool: "echo",
          arguments: { value: "hello" },
          expect: {
            structuredContent: { value: "hello" },
            structuredTextParity: true,
          },
        },
      ]);
      expect(results).toMatchObject([{ status: "passed" }]);
    } finally {
      await client.close();
    }
  });

  it("checks an explicit request-visible tool inventory against the full manifest", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "hidden",
        description: "Hidden tool.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      })
      .register({
        name: "visible",
        description: "Visible tool.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      });
    const server = createMcpFnServer({
      info: { name: "filtered", version: "1.0.0" },
      registry,
      toolVisibility: ({ tool }) => tool.name === "visible",
    });
    const client = await McpFnTestClient.connect(server);
    try {
      const manifest = server.manifest();
      await expect(assertManifestContract(client, manifest)).rejects.toThrow(
        /Tool inventory mismatch/,
      );
      await expect(assertManifestContract(client, manifest, {
        expectedToolNames: ["visible"],
      })).resolves.toMatchObject([{ name: "visible" }]);
      await expect(assertManifestContract(client, manifest, {
        expectedToolNames: ["missing"],
      })).rejects.toThrow(/absent from the manifest/);
    } finally {
      await client.close();
    }
  });

  it("rejects stale resource and prompt inventories and ignores undefined scenario fields", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "echo",
        description: "Echo.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ value: "ok" }),
      })
      .registerResource({
        uri: "docs://one",
        name: "one",
        read: async () => ({ contents: [{ uri: "docs://one", text: "One" }] }),
      })
      .registerResource({
        uri: "docs://two",
        name: "two",
        read: async () => ({ contents: [{ uri: "docs://two", text: "Two" }] }),
      })
      .registerPrompt({ name: "one", get: async () => ({ messages: [] }) })
      .registerPrompt({ name: "two", get: async () => ({ messages: [] }) });
    const server = createMcpFnServer({
      info: { name: "inventory", version: "1.0.0" },
      registry,
    });
    const client = await McpFnTestClient.connect(server);
    try {
      const manifest = server.manifest();
      await expect(assertManifestContract(client, {
        ...manifest,
        resources: manifest.resources?.slice(1),
      })).rejects.toThrow(/Resource inventory mismatch/);
      await expect(assertManifestContract(client, {
        ...manifest,
        prompts: manifest.prompts?.slice(1),
      })).rejects.toThrow(/Prompt inventory mismatch/);
      await expect(runScenarios(client, [{
        name: "undefined parity",
        tool: "echo",
        expect: { structuredContent: { value: "ok", omitted: undefined } },
      }])).resolves.toMatchObject([{ status: "passed" }]);
    } finally {
      await client.close();
    }
  });

  it("excludes resources listed by templates from static manifest equality", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "echo",
        description: "Echo.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ value: "ok" }),
      })
      .registerResource({
        uri: "docs://guide",
        name: "guide",
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
        read: async () => ({
          contents: [{ uri: "docs://guide", text: "Guide" }],
        }),
      })
      .registerResource({
        uri: "docs://plain",
        name: "plain",
        read: async () => ({
          contents: [{ uri: "docs://plain", text: "Plain" }],
        }),
      })
      .registerResourceTemplate({
        uriTemplate: "docs://users/{id}",
        name: "user",
        list: async () => ({
          resources: [{ uri: "docs://users/42", name: "Ada" }],
        }),
        read: async (uri) => ({
          contents: [{ uri: uri.toString(), text: "Ada" }],
        }),
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
      });
    const server = createMcpFnServer({
      info: { name: "dynamic-resources", version: "1.0.0" },
      registry,
    });
    const client = await McpFnTestClient.connect(server);
    try {
      const manifest = server.manifest();
      await expect(assertManifestContract(client, manifest)).resolves.toHaveLength(1);
      await expect(assertManifestContract(client, {
        ...manifest,
        resources: manifest.resources?.map((resource) =>
          resource.uri === "docs://plain"
            ? { ...resource, subscribable: true }
            : resource
        ),
      })).rejects.toThrow(/Resource subscription mismatch for docs:\/\/plain/);
      await expect(assertManifestContract(client, {
        ...manifest,
        resources: [],
      })).rejects.toThrow(/Resource inventory mismatch/);
    } finally {
      await client.close();
    }
  });

  it("pins the official conformance runner and its supported server flags", () => {
    expect(buildOfficialConformanceArgs({
      url: "http://127.0.0.1:3000/mcp",
      scenario: "server-initialize",
      outputDir: "/tmp/mcpfn-conformance",
    })).toEqual([
      "--yes",
      "@modelcontextprotocol/conformance@0.1.16",
      "server",
      "--url",
      "http://127.0.0.1:3000/mcp",
      "--scenario",
      "server-initialize",
      "--output-dir",
      "/tmp/mcpfn-conformance",
    ]);
  });

  it("reports degraded and incompatible host-profile matches", () => {
    const registry = new McpFnRegistry()
      .register({
        name: "requires_host",
        description: "Use host features.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      })
      .registerPrompt({
        name: "hello",
        get: async () => ({
          messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
        }),
      });
    const server = createMcpFnServer({
      info: { name: "profiles", version: "1.0.0" },
      registry,
      protocolVersions: ["2025-11-25"],
      clientRequirements: { sampling: true },
    });
    const toolsOnly = checkHostCompatibility(
      server.manifest(),
      MCPFN_HOST_PROFILES.toolsOnly,
    );
    expect(toolsOnly).toMatchObject({ status: "incompatible", compatible: false });
    expect(toolsOnly.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "sampling-required" }),
      expect.objectContaining({ code: "server-feature-unavailable", path: "capabilities.prompts" }),
    ]));
    expect(checkHostCompatibility(
      server.manifest(),
      MCPFN_HOST_PROFILES.fullProtocol,
    )).toMatchObject({ status: "compatible", compatible: true });

    const optionalPromptServer = createMcpFnServer({
      info: { name: "optional-prompts", version: "1.0.0" },
      registry: new McpFnRegistry().registerPrompt({
        name: "optional",
        get: async () => ({ messages: [] }),
      }),
      protocolVersions: ["2025-11-25"],
    });
    expect(checkHostCompatibility(
      optionalPromptServer.manifest(),
      MCPFN_HOST_PROFILES.toolsOnly,
    )).toMatchObject({
      status: "degraded",
      compatible: true,
      issues: [expect.objectContaining({
        code: "server-feature-unavailable",
        path: "capabilities.prompts",
      })],
    });
  });
});
