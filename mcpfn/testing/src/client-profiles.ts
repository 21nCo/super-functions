import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  MCPFN_GENERIC_CLIENT_PROFILE_ID,
  analyzeProjectionEnrichmentSymmetry,
  assessSchemaPortability,
  createMcpFnServer,
  diffEffectiveCatalogs,
  redactClientProfileEvidence,
  type McpFnClientProfile,
  type McpFnClientProtocolCapabilities,
  type McpFnDiffResult,
  type McpFnListedTool,
  type McpFnPortabilityFinding,
  type McpFnRegistry,
  type McpFnServer,
  type McpFnServerInfo,
  type McpFnSymmetryIssue,
  type McpFnValidationIssue,
  type McpFnVerifiedClientIdentity,
} from "@mcpfn/core";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import { McpFnAssertionError, stableJson } from "./assertions.js";
import { McpFnTestClient } from "./client.js";

const UNKNOWN_PROPERTY = "__mcpfn_unknown_property";

export interface McpFnClientProfileCallFixture {
  name: string;
  tool: string;
  /** Model-visible arguments. Values are redacted in reports. */
  arguments?: Record<string, unknown>;
  kind?: "minimal-valid" | "negative" | "captured-failure";
  mutate?: boolean;
  expect?: {
    isError?: boolean;
    handlerReached?: boolean;
    rejectedProperty?: string;
    keyword?: string;
    path?: string;
    schemaPath?: string;
    errorCode?: string;
    lifecycleStage?: string;
  };
}

export interface McpFnClientProfileCase<TContext = undefined> {
  name: string;
  identity: McpFnVerifiedClientIdentity;
  protocolCapabilities?: McpFnClientProtocolCapabilities;
  context: TContext;
  expectedToolNames?: string[];
  snapshot?: McpFnListedTool[];
  fixtures?: McpFnClientProfileCallFixture[];
}

export interface RunClientProfileCompatibilitySuiteOptions<TContext = undefined> {
  registry: McpFnRegistry<TContext>;
  info?: McpFnServerInfo;
  profiles?: McpFnClientProfile<TContext>[];
  cases: McpFnClientProfileCase<TContext>[];
  includeGeneric?: boolean;
  genericContext?: TContext;
  createServer?: (input: {
    identity: McpFnVerifiedClientIdentity;
    protocolCapabilities?: McpFnClientProtocolCapabilities;
    context: TContext;
  }) => McpFnServer<TContext>;
  maxReportBytes?: number;
}

export interface McpFnClientProfileCheckResult {
  name: string;
  status: "passed" | "failed";
  code?: string;
  message?: string;
  arguments?: Record<string, unknown>;
}

export interface McpFnClientProfileCaseResult {
  name: string;
  profileId: string;
  profileVersion: string;
  identityId: string;
  status: "passed" | "failed";
  toolNames: string[];
  catalogDiff?: McpFnDiffResult;
  portability: McpFnPortabilityFinding[];
  symmetry: McpFnSymmetryIssue[];
  checks: McpFnClientProfileCheckResult[];
}

export interface McpFnClientProfileCompatibilityReport {
  formatVersion: 1;
  kind: "mcpfn.client-profile-report";
  status: "complete" | "incomplete";
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  droppedResults: number;
  incompleteReason?: string;
  profiles: Array<{ id: string; version: string }>;
  results: McpFnClientProfileCaseResult[];
}

/**
 * Enumerate effective catalogs and exercise call fixtures through the
 * production list/prepare/validate lifecycle for each configured profile.
 */
export async function runClientProfileCompatibilitySuite<TContext = undefined>(
  options: RunClientProfileCompatibilitySuiteOptions<TContext>,
): Promise<McpFnClientProfileCompatibilityReport> {
  const maxReportBytes = options.maxReportBytes ?? 1_048_576;
  if (!Number.isInteger(maxReportBytes) || maxReportBytes < 1_024) {
    throw new Error("maxReportBytes must be an integer of at least 1024");
  }
  const profiles = options.profiles ?? [];
  const cases = [...options.cases];
  if (options.includeGeneric !== false) {
    cases.unshift({
      name: "generic-client",
      identity: { id: MCPFN_GENERIC_CLIENT_PROFILE_ID },
      context: (options.genericContext ?? undefined) as TContext,
    });
  }

  const results: McpFnClientProfileCaseResult[] = [];
  for (const profileCase of cases) {
    results.push(await runProfileCase(options, profiles, profileCase));
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const report: McpFnClientProfileCompatibilityReport = redactReport({
    formatVersion: 1,
    kind: "mcpfn.client-profile-report",
    status: "complete",
    ok: failed === 0,
    total: results.length,
    passed: results.length - failed,
    failed,
    droppedResults: 0,
    profiles: [
      { id: MCPFN_GENERIC_CLIENT_PROFILE_ID, version: "1" },
      ...profiles.map((profile) => ({ id: profile.id, version: profile.version })),
    ],
    results,
  });
  return boundReport(report, maxReportBytes);
}

export function listEffectiveToolsFromReport(
  report: McpFnClientProfileCompatibilityReport,
  profileId = MCPFN_GENERIC_CLIENT_PROFILE_ID,
): string[] {
  const match = report.results.find((result) => result.profileId === profileId);
  return match?.toolNames ?? [];
}

export function readToolError(result: CallToolResult): {
  code?: string;
  message?: string;
  details?: {
    issues?: McpFnValidationIssue[];
    lifecycle?: { stage?: string; profileId?: string; tool?: string };
  };
} {
  const structured = result.structuredContent as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | undefined;
  if (structured?.error) {
    return {
      code: structured.error.code,
      message: structured.error.message,
      details: structured.error.details as {
        issues?: McpFnValidationIssue[];
        lifecycle?: { stage?: string; profileId?: string; tool?: string };
      },
    };
  }
  const text = result.content.find((entry) => entry.type === "text" && "text" in entry);
  if (!text || text.type !== "text") return {};
  try {
    const parsed = JSON.parse(text.text) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    return {
      code: parsed.error?.code,
      message: parsed.error?.message,
      details: parsed.error?.details as {
        issues?: McpFnValidationIssue[];
        lifecycle?: { stage?: string; profileId?: string; tool?: string };
      },
    };
  } catch {
    return {};
  }
}

async function runProfileCase<TContext>(
  options: RunClientProfileCompatibilitySuiteOptions<TContext>,
  profiles: McpFnClientProfile<TContext>[],
  profileCase: McpFnClientProfileCase<TContext>,
): Promise<McpFnClientProfileCaseResult> {
  const checks: McpFnClientProfileCheckResult[] = [];
  const canonical = options.registry.listTools();
  const server = (options.createServer ?? defaultCreateServer(options, profiles))({
    identity: profileCase.identity,
    protocolCapabilities: profileCase.protocolCapabilities,
    context: profileCase.context,
  });
  const client = await McpFnTestClient.connect(server);
  try {
    const listed = await client.listTools();
    const selected = profiles.find((profile) =>
      profile.matchesIdentity
        ? profile.matchesIdentity(profileCase.identity, profileCase.context)
        : profile.id === profileCase.identity.id,
    );
    const profileId = selected?.id ?? MCPFN_GENERIC_CLIENT_PROFILE_ID;
    const profileVersion = selected?.version ?? "1";
    const toolNames = listed.map((tool) => tool.name);
    const expectedNames = profileCase.expectedToolNames ?? (
      profileId === MCPFN_GENERIC_CLIENT_PROFILE_ID
        ? canonical.map((tool) => tool.name)
        : undefined
    );
    if (expectedNames) {
      checks.push(compareNames("effective-catalog", expectedNames, toolNames));
    }

    const portability = listed.flatMap((tool) =>
      assessSchemaPortability(tool.inputSchema, selected?.portabilityPolicy)
        .map((finding) => ({ ...finding, path: `tools.${tool.name}${finding.path === "/" ? "" : finding.path}` })),
    );
    for (const finding of portability.filter((entry) => entry.severity === "error")) {
      checks.push({
        name: `portability:${finding.path}`,
        status: "failed",
        code: finding.code,
        message: finding.message,
      });
    }

    const symmetry = analyzeProjectionEnrichmentSymmetry(
      canonical,
      listed,
      Boolean(selected?.enrichCallArguments),
    );
    for (const issue of symmetry) {
      checks.push({
        name: `symmetry:${issue.path}`,
        status: "failed",
        code: issue.code,
        message: issue.message,
      });
    }

    let catalogDiff: McpFnDiffResult | undefined;
    if (profileCase.snapshot) {
      catalogDiff = diffEffectiveCatalogs(profileCase.snapshot, listed);
      if (catalogDiff.changes.length) {
        checks.push({
          name: "catalog-snapshot",
          status: "failed",
          code: "stale-schema-snapshot",
          message: `Effective catalog for ${profileId} differs from the reviewed snapshot`,
        });
      } else {
        checks.push({ name: "catalog-snapshot", status: "passed" });
      }
    }

    const fixtures = [
      ...(profileCase.fixtures ?? []),
      ...autoNegativeFixtures(listed, profileCase.fixtures ?? []),
    ];
    for (const fixture of fixtures) {
      checks.push(await runCallFixture(client, fixture, listed));
    }

    const failed = checks.some((check) => check.status === "failed");
    return {
      name: profileCase.name,
      profileId,
      profileVersion,
      identityId: profileCase.identity.id,
      status: failed ? "failed" : "passed",
      toolNames,
      ...(catalogDiff ? { catalogDiff } : {}),
      portability,
      symmetry,
      checks,
    };
  } finally {
    await client.close();
  }
}

function defaultCreateServer<TContext>(
  options: RunClientProfileCompatibilitySuiteOptions<TContext>,
  profiles: McpFnClientProfile<TContext>[],
) {
  return (input: {
    identity: McpFnVerifiedClientIdentity;
    protocolCapabilities?: McpFnClientProtocolCapabilities;
    context: TContext;
  }) => createMcpFnServer({
    info: options.info ?? { name: "mcpfn-profile-suite", version: "0.0.1" },
    registry: options.registry,
    context: () => input.context,
    clientProfiles: profiles,
    resolveVerifiedIdentity: () => input.identity,
    resolveProtocolCapabilities: () => input.protocolCapabilities,
  });
}

function autoNegativeFixtures(
  listed: Tool[],
  fixtures: McpFnClientProfileCallFixture[],
): McpFnClientProfileCallFixture[] {
  const explicit = new Set(
    fixtures
      .filter((fixture) => fixture.expect?.rejectedProperty || fixture.kind === "negative")
      .map((fixture) => fixture.tool),
  );
  return listed
    .filter((tool) => !explicit.has(tool.name) && rejectsAdditionalProperties(tool))
    .map((tool) => {
      const valid = fixtures.find((fixture) =>
        fixture.tool === tool.name && fixture.kind !== "negative" && fixture.kind !== "captured-failure",
      );
      return {
        name: `${tool.name} rejects unknown root property`,
        tool: tool.name,
        kind: "negative" as const,
        arguments: { ...(valid?.arguments ?? {}), [UNKNOWN_PROPERTY]: true },
        expect: {
          isError: true,
          rejectedProperty: UNKNOWN_PROPERTY,
          keyword: "additionalProperties",
          path: "/",
        },
      };
    });
}

async function runCallFixture(
  client: McpFnTestClient<unknown>,
  fixture: McpFnClientProfileCallFixture,
  listed: Tool[],
): Promise<McpFnClientProfileCheckResult> {
  const tool = listed.find((entry) => entry.name === fixture.tool);
  if (!tool) {
    return {
      name: fixture.name,
      status: "failed",
      code: "tool-not-advertised",
      message: `Fixture ${fixture.name} targets ${fixture.tool}, which is absent from the effective catalog`,
    };
  }
  const mutating = fixture.mutate === true
    || (tool.annotations?.destructiveHint === true && fixture.kind === "minimal-valid");
  if (mutating && fixture.kind === "minimal-valid" && fixture.mutate !== true) {
    return {
      name: fixture.name,
      status: "failed",
      code: "mutating-fixture-required",
      message: `Refusing to auto-invoke mutating tool ${fixture.tool} without an explicit fixture`,
    };
  }
  try {
    const result = await client.callTool(fixture.tool, fixture.arguments ?? {});
    const error = readToolError(result);
    const issues = error.details?.issues ?? [];
    if (fixture.expect?.isError !== undefined && Boolean(result.isError) !== fixture.expect.isError) {
      throw new McpFnAssertionError(
        `Expected isError=${fixture.expect.isError} for ${fixture.name}`,
      );
    }
    if (fixture.expect?.errorCode && error.code !== fixture.expect.errorCode) {
      throw new McpFnAssertionError(
        `Expected error ${fixture.expect.errorCode}, received ${error.code ?? "none"}`,
      );
    }
    if (fixture.expect?.lifecycleStage && error.details?.lifecycle?.stage !== fixture.expect.lifecycleStage) {
      throw new McpFnAssertionError(
        `Expected lifecycle ${fixture.expect.lifecycleStage}, received ${error.details?.lifecycle?.stage ?? "none"}`,
      );
    }
    if (fixture.expect?.rejectedProperty) {
      const match = issues.find((issue) => issue.rejectedProperty === fixture.expect?.rejectedProperty);
      if (!match) {
        throw new McpFnAssertionError(
          `Expected rejected property ${fixture.expect.rejectedProperty}`,
        );
      }
      if (fixture.expect.keyword && match.keyword !== fixture.expect.keyword) {
        throw new McpFnAssertionError(`Expected keyword ${fixture.expect.keyword}`);
      }
      if (fixture.expect.path && match.path !== fixture.expect.path) {
        throw new McpFnAssertionError(`Expected instance path ${fixture.expect.path}`);
      }
      if (fixture.expect.schemaPath && match.schemaPath !== fixture.expect.schemaPath) {
        throw new McpFnAssertionError(`Expected schema path ${fixture.expect.schemaPath}`);
      }
    }
    if (fixture.expect?.handlerReached === false && !result.isError) {
      throw new McpFnAssertionError(`Expected ${fixture.tool} to fail before the handler`);
    }
    return { name: fixture.name, status: "passed", arguments: fixture.arguments };
  } catch (error) {
    if (error instanceof McpFnAssertionError) {
      return { name: fixture.name, status: "failed", message: error.message, arguments: fixture.arguments };
    }
    return {
      name: fixture.name,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      arguments: fixture.arguments,
    };
  }
}

function rejectsAdditionalProperties(tool: Tool): boolean {
  const schema = tool.inputSchema as { additionalProperties?: unknown } | undefined;
  return schema?.additionalProperties === false;
}

function compareNames(
  name: string,
  expected: string[],
  actual: string[],
): McpFnClientProfileCheckResult {
  const left = [...expected].sort();
  const right = [...actual].sort();
  if (stableJson(left) === stableJson(right)) return { name, status: "passed" };
  return {
    name,
    status: "failed",
    code: "catalog-mismatch",
    message: `expected ${stableJson(left)}, received ${stableJson(right)}`,
  };
}

function redactReport(
  report: McpFnClientProfileCompatibilityReport,
): McpFnClientProfileCompatibilityReport {
  return redactOAuthValue(
    redactClientProfileEvidence(report),
  ) as McpFnClientProfileCompatibilityReport;
}

function boundReport(
  report: McpFnClientProfileCompatibilityReport,
  maxBytes: number,
): McpFnClientProfileCompatibilityReport {
  const bounded = structuredClone(report);
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes(bounded) <= maxBytes) return bounded;
  bounded.ok = false;
  bounded.status = "incomplete";
  bounded.incompleteReason = "Report content exceeded maxReportBytes and was truncated";
  while (bytes(bounded) > maxBytes && bounded.results.length > 0) {
    bounded.results.pop();
    bounded.droppedResults += 1;
  }
  if (bytes(bounded) > maxBytes) {
    throw new Error("The minimum client-profile report exceeds maxReportBytes");
  }
  return bounded;
}
