import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  MCPFN_GENERIC_CLIENT_PROFILE_ID,
  McpFnProfileError,
  McpFnRegistry,
  McpFnTrustedContextError,
  analyzeProjectionEnrichmentSymmetry,
  applyTrustedArguments,
  assessSchemaPortability,
  buildEffectiveCatalog,
  createMcpFnServer,
  diffEffectiveCatalogs,
  omitToolInputFields,
  prepareToolCall,
  projectCatalogForProfile,
  redactClientProfileEvidence,
  resolveClientProfile,
  structuredResult,
  type McpFnClientProfile,
  type McpFnListedTool,
  type McpFnRequestExtra,
} from "../src/index.js";

const extra = {} as McpFnRequestExtra;

describe("client profile contract", () => {
  it("selects profiles from verified identity, not protocol capabilities", () => {
    const hosted: McpFnClientProfile = { id: "hosted", version: "1" };
    const generic = resolveClientProfile([hosted], { id: MCPFN_GENERIC_CLIENT_PROFILE_ID }, undefined);
    expect(generic.id).toBe(MCPFN_GENERIC_CLIENT_PROFILE_ID);
    expect(resolveClientProfile([hosted], { id: "hosted" }, undefined).id).toBe("hosted");
  });

  it("fails closed on ambiguous matches and stale profile versions", () => {
    const profiles: McpFnClientProfile[] = [
      { id: "hosted", version: "1", matchesIdentity: () => true },
      { id: "other", version: "1", matchesIdentity: () => true },
    ];
    expect(() => resolveClientProfile(profiles, { id: "hosted" }, undefined)).toThrow(McpFnProfileError);
    expect(() => resolveClientProfile(
      [{ id: "hosted", version: "1" }],
      { id: "hosted", profileVersion: "2" },
      undefined,
    )).toThrow(/does not match/);
  });

  it("overwrites forged server-owned arguments from trusted context", () => {
    expect(applyTrustedArguments(
      { query: "q", workspaceId: "forged" },
      { workspaceId: "trusted" },
      ["workspaceId"],
    )).toEqual({ query: "q", workspaceId: "trusted" });
    expect(() => applyTrustedArguments({ query: "q" }, {}, ["workspaceId"])).toThrow(
      McpFnTrustedContextError,
    );
  });

  it("builds effective catalogs and detects projection/enrichment asymmetry", () => {
    const canonical = [
      listed("search", { query: { type: "string" }, workspaceId: { type: "string" } }, ["query", "workspaceId"]),
    ];
    const projected = [omitToolInputFields(canonical[0]!, ["workspaceId"])];
    const catalog = buildEffectiveCatalog(canonical, projected, { id: "hosted", version: "1" });
    expect(catalog.changes).toEqual([
      expect.objectContaining({ kind: "field-removed", toolName: "search" }),
    ]);
    expect(analyzeProjectionEnrichmentSymmetry(canonical, projected, false)).toEqual([
      expect.objectContaining({ code: "projection-without-enrichment" }),
    ]);
    expect(analyzeProjectionEnrichmentSymmetry(canonical, canonical, true)).toEqual([
      expect.objectContaining({ code: "enrichment-without-projection" }),
    ]);
    expect(analyzeProjectionEnrichmentSymmetry(canonical, projected, true)).toEqual([]);
  });

  it("flags non-portable schema keywords", () => {
    const findings = assessSchemaPortability({
      type: "object",
      anyOf: [{ type: "object" }],
      unevaluatedProperties: false,
      properties: {
        ref: { $ref: "https://example.com/schema.json" },
      },
    });
    expect(findings.filter((finding) => finding.severity === "error").map((finding) => finding.code).sort())
      .toEqual(["remote-ref", "unevaluated-properties"]);
    expect(findings.some((finding) => finding.code === "any-of" && finding.severity === "warning")).toBe(true);
  });

  it("redacts credentials and argument values from compatibility evidence", () => {
    const redacted = redactClientProfileEvidence({
      authorization: "Bearer secret-token",
      token: "abc",
      tool: "search",
      arguments: { query: "private search", nested: { api_key: "k" } },
    });
    expect(JSON.stringify(redacted)).not.toContain("secret-token");
    expect(JSON.stringify(redacted)).not.toContain("private search");
    expect(redacted).toMatchObject({
      authorization: "REDACTED",
      token: "REDACTED",
      tool: "search",
      arguments: { query: "REDACTED", nested: { api_key: "REDACTED" } },
    });
  });

  it("diffs projected catalogs with the shared manifest classifier", () => {
    const before = [listed("search", { query: { type: "string" } }, ["query"])];
    const after = [listed("search", { query: { type: "string" }, limit: { type: "number" } }, ["query"])];
    const diff = diffEffectiveCatalogs(before, after);
    expect(diff.compatible).toBe(true);
    expect(diff.changes.some((change) => change.code.includes("property-added"))).toBe(true);
  });
});

describe("client profile request lifecycle", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((value) => value.close().catch(() => undefined)));
  });

  it("keeps generic clients on the canonical catalog when no profile matches", async () => {
    const { client, handlerReached } = await connectProfiledServer(closeables);
    const tools = await client.listTools();
    expect(tools.tools[0]?.inputSchema).toMatchObject({
      required: ["query", "workspaceId"],
    });
    await expect(client.callTool({
      name: "search",
      arguments: { query: "q", workspaceId: "from-model" },
    })).resolves.toMatchObject({
      structuredContent: { query: "q", workspaceId: "from-model" },
    });
    expect(handlerReached()).toBe(true);
  });

  it("projects schemas and enriches trusted fields before canonical validation", async () => {
    let handlerArgs: Record<string, unknown> | undefined;
    const { client } = await connectProfiledServer(closeables, {
      identityId: "hosted",
      onHandler: (args) => { handlerArgs = args; },
    });
    const tools = await client.listTools();
    expect(tools.tools[0]?.inputSchema.properties).not.toHaveProperty("workspaceId");
    expect(tools.tools[0]?.inputSchema.required).toEqual(["query"]);
    await expect(client.callTool({
      name: "search",
      arguments: { query: "from-model" },
    })).resolves.toMatchObject({
      structuredContent: { query: "from-model", workspaceId: "trusted-workspace" },
    });
    expect(handlerArgs).toEqual({ query: "from-model", workspaceId: "trusted-workspace" });
  });

  it("overwrites forged server-owned metadata during enrichment", async () => {
    const { client } = await connectProfiledServer(closeables, { identityId: "hosted" });
    await expect(client.callTool({
      name: "search",
      arguments: { query: "q", workspaceId: "forged" },
    })).resolves.toMatchObject({
      structuredContent: { workspaceId: "trusted-workspace" },
    });
  });

  it("fails closed when trusted context is missing", async () => {
    const { client } = await connectProfiledServer(closeables, {
      identityId: "hosted",
      trusted: {},
    });
    const result = await client.callTool({ name: "search", arguments: { query: "q" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: "MCPFN_TRUSTED_CONTEXT_MISSING",
        details: {
          lifecycle: {
            stage: "call_enrichment",
            profileId: "hosted",
            tool: "search",
          },
        },
      },
    });
  });

  it("reports unknown root properties with structured diagnostics after enrichment", async () => {
    const { client } = await connectProfiledServer(closeables, { identityId: "hosted" });
    const result = await client.callTool({
      name: "search",
      arguments: { query: "q", extra: true },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: "MCPFN_INVALID_ARGUMENTS",
        details: {
          issues: [
            expect.objectContaining({
              path: "/",
              schemaPath: "#/additionalProperties",
              keyword: "additionalProperties",
              rejectedProperty: "extra",
            }),
          ],
          lifecycle: {
            stage: "input_validation",
            profileId: "hosted",
            tool: "search",
          },
        },
      },
    });
  });

  it("does not select a profile from initialize clientInfo", async () => {
    const registry = searchRegistry();
    const server = createMcpFnServer({
      info: { name: "identity-boundary", version: "1.0.0" },
      registry,
      clientProfiles: [hostedProfile()],
      resolveVerifiedIdentity: (requestExtra) => (
        requestExtra.authInfo?.clientId
          ? { id: requestExtra.authInfo.clientId }
          : { id: MCPFN_GENERIC_CLIENT_PROFILE_ID }
      ),
      context: () => undefined,
    });
    const handler = await server.createWebStandardHandler({ enableJsonResponse: true });
    closeables.push(server);
    const post = (body: unknown, authInfo?: { token: string; clientId: string; scopes: string[] }) =>
      handler(new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }), authInfo ? { authInfo } : undefined);

    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "hosted", version: "9.9.9" },
      },
    });
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const body = await listed.json() as {
      result: { tools: Array<{ inputSchema: { required?: string[] } }> };
    };
    expect(body.result.tools[0]?.inputSchema.required).toEqual(["query", "workspaceId"]);
  });

  it("shares prepareToolCall with the runtime enrichment path", async () => {
    const prepared = await prepareToolCall({
      toolName: "search",
      arguments: { query: "q" },
      profile: hostedProfile({ workspaceId: "trusted-workspace" }),
      identity: { id: "hosted" },
      context: undefined,
      extra,
    });
    expect(prepared.arguments).toEqual({ query: "q", workspaceId: "trusted-workspace" });
    expect(prepared.stage).toBe("call_enrichment");
  });

  it("rejects projectors that invent tools", async () => {
    await expect(projectCatalogForProfile(
      [listed("search", { query: { type: "string" } }, ["query"])],
      {
        profile: {
          id: "hosted",
          version: "1",
          projectCatalog: async () => [listed("invented", {}, [])],
        },
        identity: { id: "hosted" },
      },
      extra,
      undefined,
    )).rejects.toThrow(/unknown tools/);
  });
});

function listed(
  name: string,
  properties: Record<string, unknown>,
  required: string[],
): McpFnListedTool {
  return {
    name,
    description: name,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

function hostedProfile(trusted: Record<string, unknown> = { workspaceId: "trusted-workspace" }): McpFnClientProfile {
  return {
    id: "hosted",
    version: "1",
    projectCatalog: async (tools) => tools.map((tool) => omitToolInputFields(tool, ["workspaceId"])),
    enrichCallArguments: async (_name, args) => applyTrustedArguments(args, trusted, ["workspaceId"]),
  };
}

function searchRegistry(onHandler?: (args: Record<string, unknown>) => void) {
  return new McpFnRegistry().register({
    name: "search",
    description: "Search one workspace.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        workspaceId: { type: "string" },
      },
      required: ["query", "workspaceId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      onHandler?.(args);
      return structuredResult(args);
    },
  });
}

async function connectProfiledServer(
  closeables: Array<{ close(): Promise<void> }>,
  options: {
    identityId?: string;
    trusted?: Record<string, unknown>;
    onHandler?: (args: Record<string, unknown>) => void;
  } = {},
) {
  let handlerReached = false;
  const registry = searchRegistry((args) => {
    handlerReached = true;
    options.onHandler?.(args);
  });
  const server = createMcpFnServer({
    info: { name: "profile-test", version: "1.0.0" },
    registry,
    clientProfiles: [hostedProfile(options.trusted ?? { workspaceId: "trusted-workspace" })],
    resolveVerifiedIdentity: () => ({ id: options.identityId ?? MCPFN_GENERIC_CLIENT_PROFILE_ID }),
  });
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeables.push(client, server);
  return {
    client,
    server,
    handlerReached: () => handlerReached,
  };
}
