import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { customTarget } from "@mcpfn/client";
import {
  McpFnRegistry,
  createMcpFnServer,
  structuredResult,
  type McpFnClientProfile,
} from "@mcpfn/core";

import {
  createMcpFnClientProfileSnapshot,
  diffMcpFnClientProfileSnapshots,
  runMcpFnClientProfileContracts,
  validateMcpFnSchemaPortability,
  validateMcpFnClientProfileSnapshot,
} from "../src/index.js";

interface Context {
  subject?: string;
  tenantId?: string;
}

function projectedTool(): Tool {
  return {
    name: "lookup",
    description: "Look up a value.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  };
}

function profile(): McpFnClientProfile<Context> {
  return {
    id: "consumer/trusted",
    version: "1",
    matches: ({ subject }) => subject === "trusted-client",
    serverOwnedArguments: { lookup: ["tenantId"] },
    projectCatalog: ({ tools }) =>
      tools.map((tool) => (tool.name === "lookup" ? projectedTool() : tool)),
    enrichArguments: ({ arguments: args, context }) =>
      context.tenantId ? { ...args, tenantId: context.tenantId } : args,
  };
}

function targetFor(
  context: Context,
  handler = vi.fn(async (args: Record<string, unknown>) =>
    structuredResult(args),
  ),
) {
  return {
    handler,
    target: customTarget({
      kind: "profile-fixture",
      descriptor: { url: "https://server.test/mcp?api_key=target-secret" },
      open: async () => {
        const registry = new McpFnRegistry<Context>().register({
          name: "lookup",
          description: "Look up a value.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              tenantId: { type: "string" },
            },
            required: ["query", "tenantId"],
            additionalProperties: false,
          },
          handler,
        });
        const server = createMcpFnServer({
          info: { name: "profile-target", version: "1.0.0" },
          registry,
          context: () => context,
          clientProfiles: {
            profiles: [profile()],
            resolveVerifiedIdentity: ({ context: trusted }) =>
              trusted.subject ? { subject: trusted.subject } : undefined,
          },
        });
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        return { transport: clientTransport, close: () => server.close() };
      },
    }),
  };
}

describe("client profile compatibility contracts", () => {
  it("enumerates generic and configured catalogs and replays redacted fixtures", async () => {
    const generic = targetFor({ subject: "generic-client" });
    const trusted = targetFor({
      subject: "trusted-client",
      tenantId: "trusted-secret-tenant",
    });
    const report = await runMcpFnClientProfileContracts({
      profiles: [
        {
          id: "generic",
          version: "canonical",
          target: generic.target,
          fixtures: [
            {
              name: "canonical minimal call",
              tool: "lookup",
              arguments: {
                query: "generic-secret-query",
                tenantId: "model-tenant",
              },
              sideEffect: "read-only",
            },
          ],
        },
        {
          id: "consumer/trusted",
          version: "1",
          target: trusted.target,
          clientInfo: { name: "configured-client", version: "2.0.0" },
          capabilities: { roots: { listChanged: true } },
          expectedSnapshot: createMcpFnClientProfileSnapshot(
            { id: "consumer/trusted", version: "1" },
            [projectedTool()],
          ),
          fixtures: [
            {
              name: "minimal projected call",
              tool: "lookup",
              arguments: { query: "valid-secret-query" },
              sideEffect: "read-only",
            },
            {
              name: "captured unknown root property",
              tool: "lookup",
              arguments: {
                query: "captured-secret-query",
                unexpectedField: "secret-value",
              },
              sideEffect: "read-only",
              source: "captured-failure",
              expect: {
                isError: true,
                errorCode: "MCPFN_INVALID_ARGUMENTS",
                lifecycleStage: "input-validation",
                validationIssue: {
                  instancePath: "/",
                  schemaPath: "#/additionalProperties",
                  keyword: "additionalProperties",
                  rejectedProperty: "unexpectedField",
                },
              },
            },
          ],
        },
      ],
    });

    expect(report).toMatchObject({
      ok: true,
      status: "complete",
      profiles: [
        {
          profile: { id: "consumer/trusted" },
          snapshotMatches: true,
          ok: true,
        },
        { profile: { id: "generic" }, ok: true },
      ],
    });
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(generic.handler).toHaveBeenCalledTimes(1);
    expect(trusted.handler).toHaveBeenCalledTimes(1);
    expect(trusted.handler).toHaveBeenCalledWith(
      { query: "valid-secret-query", tenantId: "trusted-secret-tenant" },
      expect.objectContaining({ subject: "trusted-client" }),
      expect.anything(),
    );
  });

  it("fails stale snapshots and never runs unauthorized mutating fixtures", async () => {
    const fixture = targetFor({
      subject: "trusted-client",
      tenantId: "tenant",
    });
    const stale = {
      ...createMcpFnClientProfileSnapshot(
        { id: "consumer/trusted", version: "1" },
        [projectedTool()],
      ),
      catalogHash: "0".repeat(64),
    };
    const report = await runMcpFnClientProfileContracts({
      profiles: [
        {
          id: "consumer/trusted",
          version: "1",
          target: fixture.target,
          expectedSnapshot: stale,
          fixtures: [
            {
              name: "unsafe mutation",
              tool: "lookup",
              arguments: { query: "do not run" },
              sideEffect: "non-idempotent",
            },
          ],
        },
      ],
    });
    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      profiles: [
        {
          snapshotMatches: false,
          fixtures: [
            { status: "incomplete", code: "side-effect-not-authorized" },
          ],
        },
      ],
    });
    expect(fixture.handler).not.toHaveBeenCalled();
  });

  it("validates recursive schemas with their declared dialect", () => {
    const valid2020 = validateMcpFnSchemaPortability(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        $defs: { value: { type: "string" } },
        properties: { value: { $ref: "#/$defs/value" } },
        unevaluatedProperties: false,
      },
      "tools/modern/inputSchema",
    );
    expect(valid2020).toEqual([
      expect.objectContaining({
        severity: "warning",
        keyword: "unevaluatedProperties",
      }),
    ]);
    expect(
      validateMcpFnSchemaPortability(
        {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          definitions: { value: { type: "string" } },
          properties: { value: { $ref: "#/definitions/value" } },
        },
        "tools/legacy/inputSchema",
      ),
    ).toEqual([]);
    expect(
      validateMcpFnSchemaPortability(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { value: { $ref: "#/$defs/missing" } },
        },
        "tools/broken/inputSchema",
      ),
    ).toEqual([
      expect.objectContaining({ severity: "error", code: "schema-invalid" }),
    ]);
  });

  it("diffs reviewed effective catalog snapshots", () => {
    const before = createMcpFnClientProfileSnapshot(
      { id: "consumer/trusted", version: "1" },
      [projectedTool()],
    );
    const after = createMcpFnClientProfileSnapshot(
      { id: "consumer/trusted", version: "2" },
      [
        { ...projectedTool(), description: "Changed." },
        {
          name: "new-tool",
          description: "New.",
          inputSchema: { type: "object" },
        },
      ],
    );
    expect(diffMcpFnClientProfileSnapshots(before, after)).toMatchObject({
      compatible: true,
      summary: { added: 1, removed: 0, modified: 1 },
    });
    expect(diffMcpFnClientProfileSnapshots(after, before)).toMatchObject({
      compatible: false,
      summary: { added: 0, removed: 1, modified: 1 },
    });
  });

  it("validates report limits before opening targets and isolates connect failures", async () => {
    const open = vi.fn();
    await expect(
      runMcpFnClientProfileContracts({
        maxReportBytes: 100,
        profiles: [
          {
            id: "never-opened",
            version: "1",
            target: customTarget({ kind: "never-opened", open }),
          },
        ],
      }),
    ).rejects.toThrow(/at least 2048/);
    expect(open).not.toHaveBeenCalled();

    const valid = targetFor({ subject: "generic-client" });
    const report = await runMcpFnClientProfileContracts({
      profiles: [
        {
          id: "broken",
          version: "1",
          target: customTarget({
            kind: "broken",
            open: async () => {
              throw new Error("connect failed with token=secret");
            },
          }),
        },
        { id: "generic", version: "canonical", target: valid.target },
      ],
    });
    expect(report.profiles).toMatchObject([
      { profile: { id: "broken" }, ok: false, phase: "connect" },
      { profile: { id: "generic" }, ok: true },
    ]);
    expect(JSON.stringify(report)).not.toContain("token=secret");
  });

  it("bounds oversized compatibility evidence with explicit incompleteness", async () => {
    // Use larger evidence strings to exceed 2 KB with only three sessions. Avoid redundant
    // handshakes/schema compilations competing with the full monorepo suite.
    const handlers: ReturnType<typeof targetFor>["handler"][] = [];
    const cases = Array.from({ length: 3 }, (_, index) => {
      const fixture = targetFor({ subject: "generic-client" });
      handlers.push(fixture.handler);
      return {
        id: `generic-${String(index).padStart(2, "0")}`,
        version: "canonical",
        target: fixture.target,
        fixtures: [
          {
            name: `minimal-${index}-${"x".repeat(1000)}`,
            tool: "lookup",
            arguments: { query: "value", tenantId: "tenant" },
            sideEffect: "read-only" as const,
          },
        ],
      };
    });
    const report = await runMcpFnClientProfileContracts({
      profiles: cases,
      maxReportBytes: 2_048,
    });
    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      incompleteReason: expect.stringContaining("truncated"),
    });
    expect(report.droppedProfiles).toBeGreaterThan(0);
    expect(report.profiles.length + report.droppedProfiles).toBe(cases.length);
    for (const handler of handlers) expect(handler).toHaveBeenCalledOnce();
    expect(
      new TextEncoder().encode(JSON.stringify(report)).byteLength,
    ).toBeLessThanOrEqual(2_048);
  });
  it("rejects captured failures without an error assertion", async () => {
    const target = targetFor({ subject: "trusted-client", tenantId: "trusted" });
    await expect(runMcpFnClientProfileContracts({ profiles: [{
      id: "captured", version: "1", target: target.target,
      fixtures: [{ name: "unasserted", tool: "lookup", arguments: { query: "ok" }, sideEffect: "read-only", source: "captured-failure" }],
    }] })).rejects.toThrow(/meaningful error expectations/);
    expect(target.handler).not.toHaveBeenCalled();
  });

  it("checks tuple and content schemas under supported dialects", () => {
    for (const dialect of ["http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft/2019-09/schema"]) {
      const issues = validateMcpFnSchemaPortability({
        $schema: dialect, type: "object", properties: {
          tuple: { type: "array", items: [{ dependentSchemas: { flag: { type: "object" } } }] },
          encoded: { type: "string", contentSchema: { dependentSchemas: { flag: { type: "object" } } } },
        },
      }, "#");
      expect(issues.some(issue => issue.path.includes("/items/0/dependentSchemas"))).toBe(true);
      expect(issues.some(issue => issue.path.includes("/contentSchema/dependentSchemas"))).toBe(true);
      expect(issues.some(issue => issue.code === "schema-invalid")).toBe(false);
    }
  });

});


it("fails the catalog phase for duplicate tool names and produces no snapshot", async () => {
  const { McpFnTestClient } = await import("../src/client.js");
  const list = vi.spyOn(McpFnTestClient.prototype, "listTools").mockResolvedValue([projectedTool(), projectedTool()]);
  try {
    expect(() => createMcpFnClientProfileSnapshot({ id: "duplicate", version: "1" }, [projectedTool(), projectedTool()])).toThrow(/duplicate tool names/);
    const report = await runMcpFnClientProfileContracts({ profiles: [{ id: "duplicate", version: "1", target: targetFor({}).target }] });
    expect(report.ok).toBe(false);
    expect(report.profiles[0]).toMatchObject({ phase: "catalog", ok: false });
    expect(report.profiles[0].snapshot).toBeUndefined();
  } finally { list.mockRestore(); }
});

it("rejects contradictory aggregate snapshot hashes", () => {
  const snapshot = createMcpFnClientProfileSnapshot({ id: "test", version: "1" }, [projectedTool()]);
  expect(() => diffMcpFnClientProfileSnapshots(snapshot, { ...snapshot, catalogHash: "f".repeat(64) })).toThrow(/Inconsistent catalog hashes/);
});
it("flags dependentRequired portability", () => {
  expect(validateMcpFnSchemaPortability({ type: "object", dependentRequired: { a: ["b"] } }, "#").some(issue => issue.path.includes("dependentRequired"))).toBe(true);
});
it("does not copy opaque connection error values into reports", async () => {
  const report = await runMcpFnClientProfileContracts({ profiles: [{ id: "test", version: "1", target: customTarget({ kind: "test", open: async () => { throw new Error("customer-123"); } }) }] });
  expect(JSON.stringify(report)).not.toContain("customer-123");
  expect(report.profiles[0]).toMatchObject({ phase: "connect", ok: false });
});
it.each([undefined, { rejectedProperty: undefined }])("requires a defined discriminator for captured failures: %s", async validationIssue => {
  await expect(runMcpFnClientProfileContracts({ profiles: [{ id: "test", version: "1", target: targetFor({}).target,
    fixtures: [{ name: "weak", tool: "lookup", arguments: {}, sideEffect: "read-only", source: "captured-failure", expect: { isError: true, validationIssue } }],
  }] })).rejects.toThrow(/meaningful error expectations/);
});
it('rejects misspelled captured failure sources', async () => {
  await expect(runMcpFnClientProfileContracts({ profiles: [{ id: 'test', version: '1', target: targetFor({}).target, fixtures: [{ name: 'typo', tool: 'lookup', source: 'captured-failur' as any, sideEffect: 'read-only' }] }] })).rejects.toThrow(/fixture source/);
});

it.each(["minContains", "maxContains"])("flags %s portability", keyword => {
  expect(validateMcpFnSchemaPortability({ type: "array", contains: { type: "string" }, [keyword]: 2 }, "#").some(issue => issue.path.includes(keyword))).toBe(true);
});


it("warns for draft-2019 recursive reference keywords", () => {
  const issues = validateMcpFnSchemaPortability({ $schema: 'https://json-schema.org/draft/2019-09/schema', $recursiveAnchor: true, type: 'object', properties: { next: { $recursiveRef: '#' } } }, 'input');
  expect(issues.map(issue => issue.keyword)).toEqual(expect.arrayContaining(['$recursiveAnchor', '$recursiveRef']));
});

it.each([false, true])("rejects task-required fixtures before execution when cleanup fails: %s", async closeFails => {
  const { McpFnTestClient } = await import('../src/client.js');
  const callTool = vi.fn();
  const close = vi.fn(async () => { if (closeFails) throw new Error('private cleanup detail'); });
  const tool = { ...projectedTool(), name: 'task-lookup', execution: { taskSupport: 'required' as const } };
  const spy = vi.spyOn(McpFnTestClient, 'connectTarget').mockResolvedValue({ listTools: async () => [projectedTool(), tool], callTool, close } as any);
  try {
    await expect(runMcpFnClientProfileContracts({ profiles: [{ id: 'generic', version: '1', target: targetFor({}).target,
      fixtures: [
        { name: 'ordinary', tool: 'lookup', arguments: { query: 'x' }, sideEffect: 'read-only' },
        { name: 'task', tool: 'task-lookup', arguments: { query: 'x' }, sideEffect: 'read-only' },
      ] }] })).rejects.toThrow(closeFails
        ? /task-required fixtures are unsupported.*target cleanup failed/
        : /task-required fixtures are unsupported/);
    expect(callTool).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  } finally { spy.mockRestore(); }
});

it("warns for named schema anchors", () => {
  const issues = validateMcpFnSchemaPortability({ $schema: "https://json-schema.org/draft/2020-12/schema", $anchor: "node", type: "object", properties: { next: { $ref: "#node" } } }, "input");
  expect(issues.some(issue => issue.keyword === "$anchor")).toBe(true);
});

it("uses draft 7 for undeclared tuple schemas", () => {
  expect(validateMcpFnSchemaPortability({ type: "object", properties: { pair: { type: "array", items: [{ type: "string" }] } } }, "#").some(issue => issue.code === "schema-invalid")).toBe(false);
});

it.each([{}, { isError: true }])("rejects errors from minimal-valid fixtures even with expectations %j", async expectValue => {
  const target = targetFor({ subject: "trusted-client", tenantId: "trusted" }, vi.fn(async () => { throw new Error("broken handler"); }));
  const report = await runMcpFnClientProfileContracts({ profiles: [{ id: "test", version: "1", target: target.target, fixtures: [{ name: "valid", source: "minimal-valid", sideEffect: "read-only", tool: "lookup", arguments: { query: "ok" }, expect: expectValue }] }] });
  expect(report.profiles[0].fixtures[0]).toMatchObject({ status: "failed" });
});


it.each(["2019-09", "2020-12"])("flags %s ref assertion siblings and honors strict policy", dialect => {
  const schema = { $schema: `https://json-schema.org/draft/${dialect}/schema`, type: "object",
    $defs: { value: { type: "string" } }, properties: { value: { $ref: "#/$defs/value", maxLength: 3 } } };
  expect(validateMcpFnSchemaPortability(schema, "#")).toContainEqual(expect.objectContaining({ keyword: "$ref", severity: "warning", path: "#/properties/value/$ref" }));
  expect(validateMcpFnSchemaPortability(schema, "#", { warningsAsErrors: true })).toContainEqual(expect.objectContaining({ keyword: "$ref", severity: "error" }));
  expect(validateMcpFnSchemaPortability(schema, "#", { allowKeywords: ["$ref"] }).some(issue => issue.keyword === "$ref")).toBe(false);
  const metadataOnly = { ...schema, properties: { value: { $ref: "#/$defs/value", description: "Description" } } };
  expect(validateMcpFnSchemaPortability(metadataOnly, "#").some(issue => issue.keyword === "$ref")).toBe(false);
  expect(validateMcpFnSchemaPortability({ ...schema, $schema: "http://json-schema.org/draft-07/schema#" }, "#").some(issue => issue.keyword === "$ref")).toBe(false);
});

it("does not misclassify contentSchema annotations as ref assertions", async () => {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", $defs: { value: { type: "string" } },
    $ref: "#/$defs/value", contentMediaType: "application/json", contentSchema: { type: "number" } };
  const validate = new Ajv2020({ strict: false }).compile(schema);
  expect(validate("not JSON")).toBe(true);
  expect(validateMcpFnSchemaPortability(schema, "#", { warningsAsErrors: true }).some(issue => issue.keyword === "$ref")).toBe(false);
});


it.each(["root", "profile", "tool"])("rejects unsupported %s snapshot fields consistently before opening a target", async location => {
  const snapshot = createMcpFnClientProfileSnapshot({ id: "consumer/trusted", version: "1" }, [projectedTool()]);
  const extra = location === "root" ? snapshot : location === "profile" ? snapshot.profile : snapshot.tools[0];
  Object.assign(extra, { note: "reviewer annotation" });
  expect(() => validateMcpFnClientProfileSnapshot(snapshot)).toThrow(`unsupported fields at ${location === "tool" ? "tools[0]" : location}: "note"`);
  expect(() => diffMcpFnClientProfileSnapshots(snapshot, snapshot)).toThrow(/unsupported fields/);
  const fixture = targetFor({ subject: "trusted-client", tenantId: "tenant" });
  const open = vi.spyOn(fixture.target, "open");
  await expect(runMcpFnClientProfileContracts({ profiles: [{
    id: "consumer/trusted", version: "1", target: fixture.target, expectedSnapshot: snapshot,
  }] })).rejects.toThrow(/unsupported fields/);
  expect(open).not.toHaveBeenCalled();
});
