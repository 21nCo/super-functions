import type { Implementation, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type {
  McpFnDiagnosticEvent,
  McpFnTarget,
  McpFnTargetDescriptor,
} from "@mcpfn/client";
import type { McpFnManifest } from "@mcpfn/core";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import { assertManifestContract } from "./assertions.js";
import { McpFnTestClient, type McpFnTestClientOptions } from "./client.js";
import {
  runScenarios,
  type McpFnScenario,
  type McpFnScenarioResult,
} from "./scenarios.js";

export interface RunMcpFnTargetSuiteOptions {
  target: McpFnTarget;
  scenarios?: McpFnScenario[];
  manifest?: McpFnManifest;
  expectedToolNames?: readonly string[];
  clientInfo?: Implementation;
  client?: McpFnTestClientOptions;
  scenarioRun?: NonNullable<Parameters<typeof runScenarios>[2]>;
  /** Aggregate JSON size cap. Defaults to 1 MiB. */
  maxReportBytes?: number;
  /** Diagnostic timeline count cap. Defaults to 500. */
  maxTimelineEvents?: number;
}

export interface McpFnTargetSuiteReport {
  formatVersion: 1;
  kind: "mcpfn.target-suite-report";
  status: "complete" | "incomplete";
  runtime: { node: string; scenarioFormatVersion: 1 };
  ok: boolean;
  target: McpFnTargetDescriptor;
  server?: Implementation;
  capabilities?: ServerCapabilities;
  manifestChecked: boolean;
  manifestHash?: string;
  total: number;
  passed: number;
  failed: number;
  incomplete: number;
  droppedResults: number;
  droppedObservedEvents: number;
  incompleteReason?: string;
  timeline: McpFnDiagnosticEvent[];
  droppedTimelineEvents: number;
  results: McpFnScenarioResult[];
}

/** Runs local, stdio, HTTP, or custom targets through the production session engine. */
export async function runMcpFnTargetSuite(
  options: RunMcpFnTargetSuiteOptions,
): Promise<McpFnTargetSuiteReport> {
  const timeline: McpFnDiagnosticEvent[] = [];
  let droppedTimelineEvents = 0;
  const maxTimelineEvents = options.maxTimelineEvents ?? 500;
  if (!Number.isInteger(maxTimelineEvents) || maxTimelineEvents < 1) {
    throw new Error("maxTimelineEvents must be a positive integer");
  }
  const consumerDiagnostic = options.client?.diagnostics;
  const client = await McpFnTestClient.connectTarget(
    options.target,
    options.clientInfo ?? { name: "mcpfn-suite", version: "0.0.1" },
    {
      ...options.client,
      diagnostics: async (event) => {
        timeline.push(redactOAuthValue(event));
        if (timeline.length > maxTimelineEvents) {
          timeline.shift();
          droppedTimelineEvents += 1;
        }
        await consumerDiagnostic?.(event);
      },
    },
  );
  try {
    if (options.manifest) {
      await assertManifestContract(client, options.manifest, {
        expectedToolNames: options.expectedToolNames,
      });
    }
    const results = await runScenarios(client, options.scenarios ?? [], options.scenarioRun);
    const failed = results.filter((result) => result.status === "failed").length;
    const incomplete = results.filter((result) => result.status === "incomplete").length;
    const droppedObservedEvents = results.reduce(
      (total, result) => total + (result.droppedObservedEvents ?? 0),
      0,
    );
    const artifactIncomplete = incomplete > 0 ||
      droppedTimelineEvents > 0 ||
      droppedObservedEvents > 0;
    const report: McpFnTargetSuiteReport = {
      formatVersion: 1,
      kind: "mcpfn.target-suite-report",
      status: artifactIncomplete ? "incomplete" : "complete",
      runtime: { node: process.version, scenarioFormatVersion: 1 },
      ok: failed === 0 && !artifactIncomplete,
      target: redactOAuthValue(options.target.describe()),
      server: client.session.getServerVersion(),
      capabilities: client.session.getServerCapabilities(),
      manifestChecked: Boolean(options.manifest),
      ...(options.manifest ? { manifestHash: options.manifest.hash } : {}),
      total: results.length,
      passed: results.length - failed - incomplete,
      failed,
      incomplete,
      droppedResults: 0,
      droppedObservedEvents,
      ...(droppedTimelineEvents > 0 || droppedObservedEvents > 0
        ? {
          incompleteReason: [
            ...(droppedTimelineEvents > 0
              ? ["Diagnostic timeline exceeded maxTimelineEvents"]
              : []),
            ...(droppedObservedEvents > 0
              ? ["Observed client events exceeded maxObservedEvents"]
              : []),
          ].join("; "),
        }
        : {}),
      timeline,
      droppedTimelineEvents,
      results,
    };
    return enforceReportCap(report, options.maxReportBytes ?? 1_048_576);
  } finally {
    await client.close();
  }
}

function enforceReportCap(
  report: McpFnTargetSuiteReport,
  maxBytes: number,
): McpFnTargetSuiteReport {
  if (!Number.isInteger(maxBytes) || maxBytes < 1_024) {
    throw new Error("maxReportBytes must be an integer of at least 1024");
  }
  const bounded = structuredClone(report);
  if (jsonBytes(bounded) > maxBytes) {
    bounded.ok = false;
    bounded.status = "incomplete";
    bounded.incompleteReason = "Report content exceeded maxReportBytes and was truncated";
  }
  while (jsonBytes(bounded) > maxBytes && bounded.results.length > 0) {
    bounded.results.pop();
    bounded.droppedResults += 1;
  }
  if (jsonBytes(bounded) > maxBytes) {
    bounded.target = { kind: report.target.kind };
    bounded.server = undefined;
    bounded.capabilities = undefined;
    bounded.timeline = [];
    bounded.droppedTimelineEvents += report.timeline.length;
  }
  if (bounded.droppedResults > 0 || jsonBytes(bounded) > maxBytes) {
    bounded.ok = false;
    bounded.status = "incomplete";
    bounded.incompleteReason = "Report content exceeded maxReportBytes and was truncated";
  }
  if (jsonBytes(bounded) > maxBytes) {
    throw new Error("The minimum target suite report exceeds maxReportBytes");
  }
  return bounded;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
