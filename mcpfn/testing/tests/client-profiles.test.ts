import { describe, expect, it } from "vitest";
import {
  McpFnRegistry,
  applyTrustedArguments,
  omitToolInputFields,
  structuredResult,
  type McpFnClientProfile,
} from "@mcpfn/core";

import {
  listEffectiveToolsFromReport,
  readToolError,
  runClientProfileCompatibilitySuite,
} from "../src/index.js";

describe("client profile compatibility suite", () => {
  const registry = () => new McpFnRegistry<{ workspaceId: string }>().register({
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
    annotations: { readOnlyHint: true, destructiveHint: false },
    handler: async (args) => structuredResult(args),
  });

  const hosted: McpFnClientProfile<{ workspaceId: string }> = {
    id: "hosted",
    version: "1",
    projectCatalog: async (tools) => tools.map((tool) => omitToolInputFields(tool, ["workspaceId"])),
    enrichCallArguments: async (_name, args, request) =>
      applyTrustedArguments(args, { workspaceId: request.context.workspaceId }, ["workspaceId"]),
  };

  it("enumerates generic and configured catalogs through the production lifecycle", async () => {
    const report = await runClientProfileCompatibilitySuite({
      registry: registry(),
      profiles: [hosted],
      genericContext: { workspaceId: "generic" },
      cases: [{
        name: "hosted-client",
        identity: { id: "hosted" },
        context: { workspaceId: "trusted-workspace" },
        expectedToolNames: ["search"],
        fixtures: [
          {
            name: "minimal valid search",
            tool: "search",
            kind: "minimal-valid",
            arguments: { query: "docs" },
            expect: { isError: false },
          },
          {
            name: "captured unknown property",
            tool: "search",
            kind: "captured-failure",
            arguments: { query: "docs", extra: true },
            expect: {
              isError: true,
              rejectedProperty: "extra",
              keyword: "additionalProperties",
              path: "/",
              schemaPath: "#/additionalProperties",
              lifecycleStage: "input_validation",
            },
          },
        ],
      }],
    });

    expect(report.ok).toBe(true);
    expect(listEffectiveToolsFromReport(report)).toEqual(["search"]);
    expect(listEffectiveToolsFromReport(report, "hosted")).toEqual(["search"]);
    const hostedCase = report.results.find((result) => result.profileId === "hosted");
    expect(hostedCase?.symmetry).toEqual([]);
    expect(hostedCase?.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("fails asymmetric projection and stale snapshots", async () => {
    const projectionOnly: McpFnClientProfile<{ workspaceId: string }> = {
      id: "hosted",
      version: "1",
      projectCatalog: async (tools) => tools.map((tool) => omitToolInputFields(tool, ["workspaceId"])),
    };
    const report = await runClientProfileCompatibilitySuite({
      registry: registry(),
      profiles: [projectionOnly],
      includeGeneric: false,
      cases: [{
        name: "asymmetric",
        identity: { id: "hosted" },
        context: { workspaceId: "trusted-workspace" },
        snapshot: registry().listTools(),
      }],
    });
    expect(report.ok).toBe(false);
    expect(report.results[0]?.symmetry.some((issue) => issue.code === "projection-without-enrichment")).toBe(true);
    expect(report.results[0]?.checks.some((check) => check.code === "stale-schema-snapshot")).toBe(true);
  });

  it("redacts captured argument fixtures in the report", async () => {
    const report = await runClientProfileCompatibilitySuite({
      registry: registry(),
      profiles: [hosted],
      includeGeneric: false,
      cases: [{
        name: "secret-fixture",
        identity: { id: "hosted" },
        context: { workspaceId: "trusted-workspace" },
        fixtures: [{
          name: "contains secrets",
          tool: "search",
          arguments: { query: "secret-query", authorization: "Bearer token" },
          expect: { isError: false },
        }],
      }],
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("secret-query");
    expect(serialized).not.toContain("Bearer token");
  });

  it("reads structured validator details from error results", () => {
    expect(readToolError({
      content: [{ type: "text", text: JSON.stringify({
        error: {
          code: "MCPFN_INVALID_ARGUMENTS",
          details: { issues: [{ path: "/", keyword: "additionalProperties", rejectedProperty: "extra" }] },
        },
      }) }],
      isError: true,
    })).toMatchObject({
      code: "MCPFN_INVALID_ARGUMENTS",
      details: { issues: [{ rejectedProperty: "extra" }] },
    });
  });
});
