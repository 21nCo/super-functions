import { McpFnRedactionLimitError, beginTargetCredentialRedaction, redactTargetCredentials } from "./remote-target.js";
import type { Implementation, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type {
  McpFnDiagnosticEvent,
  McpFnTarget,
  McpFnTargetDescriptor,
} from "@mcpfn/client";
import type { McpFnManifest } from "@mcpfn/core";

import { assertManifestContract, McpFnAssertionError, stableJson } from "./assertions.js";
import { McpFnTestClient, type McpFnTestClientOptions } from "./client.js";
import {
  MCPFN_REPORT_SCHEMA_VERSION,
  MCPFN_TESTING_VERSION,
  normalizeMcpFnReportFailure,
  type McpFnReportFailure,
} from "./reports.js";
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
  runtime: {
    node: string;
    scenarioFormatVersion: 1;
    reportSchemaVersion: string;
    packages: { testing: string };
  };
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
  failure?: McpFnReportFailure;
  timeline: McpFnDiagnosticEvent[];
  droppedTimelineEvents: number;
  results: McpFnScenarioResult[];
}

const suiteCleanupOwners = new WeakMap<McpFnTargetSuiteCleanupError, { close: () => Promise<void>; pending?: Promise<void> }>();

/** Final cleanup failed. The bounded report is a snapshot; retain this error to retry. */
export class McpFnTargetSuiteCleanupError extends Error {
  constructor(readonly report: McpFnTargetSuiteReport, close: () => Promise<void>) {
    super("Target suite cleanup failed; retain this error and retryCleanup()");
    this.name = "McpFnTargetSuiteCleanupError";
    suiteCleanupOwners.set(this, { close });
  }

  retryCleanup(): Promise<void> {
    const owner = suiteCleanupOwners.get(this);
    if (!owner) return Promise.resolve();
    if (owner.pending) return owner.pending;
    const pending = Promise.resolve().then(owner.close).then(
      () => { suiteCleanupOwners.delete(this); },
      () => { throw this; },
    ).finally(() => { owner.pending = undefined; });
    owner.pending = pending;
    return pending;
  }
}

/** Runs local, stdio, HTTP, or custom targets through the production session engine. */
export async function runMcpFnTargetSuite(
  options: RunMcpFnTargetSuiteOptions,
): Promise<McpFnTargetSuiteReport> {
  const finishRedaction = beginTargetCredentialRedaction(options.target);
  try { return await runTargetSuite(options); }
  finally { finishRedaction(); }
}

/** Apply the target-owned scrubber before the bounded generic artifact pass. */
function redactSuiteArtifact<T>(target: McpFnTarget, value: T, options: { preserveKeys?: boolean } = {}): T {
  const scrubbed = target.redact ? target.redact(value) : value;
  return redactTargetCredentials(target, scrubbed, options);
}

async function runTargetSuite(options: RunMcpFnTargetSuiteOptions): Promise<McpFnTargetSuiteReport> {
  const timeline: McpFnDiagnosticEvent[] = [];
  let droppedTimelineEvents = 0;
  let timelineBytes = 0;
  let timelineCountExceeded = false;
  let timelineBytesExceeded = false;
  let timelineSerializationFailed = false;
  const timelineSizes: number[] = [];
  const maxTimelineEvents = options.maxTimelineEvents ?? 500;
  if (!Number.isInteger(maxTimelineEvents) || maxTimelineEvents < 1) {
    throw new Error("maxTimelineEvents must be a positive integer");
  }
  const maxReportBytes = options.maxReportBytes ?? 1_048_576;
  validateReportCap(maxReportBytes);
  const consumerDiagnostic = options.client?.diagnostics;
  let client: McpFnTestClient | undefined;
  let manifestChecked = false;
  let failure: McpFnReportFailure | undefined;
  let cleanupFailure: McpFnReportFailure | undefined;
  let retainedCleanup: (() => Promise<void>) | undefined;
  let execution: {
    results: McpFnScenarioResult[];
    server?: Implementation;
    capabilities?: ServerCapabilities;
  } = { results: [] };
  try {
    client = McpFnTestClient.createTarget(
      options.target,
      options.clientInfo ?? { name: "mcpfn-suite", version: "0.0.1" },
      {
        ...options.client,
        diagnostics: async (event) => {
          if (event.phase === "transport-close" && event.outcome === "failed") {
            cleanupFailure = normalizeMcpFnReportFailure({
              name: "CleanupError", message: "Target cleanup failed",
              code: event.code, phase: event.phase,
            });
          }
          // Production-client dispatch already applied the custom target hook.
          const safeEvent = redactTargetCredentials(options.target, event, { preserveKeys: true });
          let bytes: number;
          try { bytes = jsonBytes(safeEvent); }
          catch {
            timelineSerializationFailed = true;
            droppedTimelineEvents += 1;
            await consumerDiagnostic?.(safeEvent);
            return;
          }
          if (bytes > maxReportBytes) {
            timelineBytesExceeded = true;
            droppedTimelineEvents += 1;
          } else {
            timeline.push(safeEvent);
            timelineSizes.push(bytes);
            timelineBytes += bytes;
            while (timeline.length > maxTimelineEvents || timelineBytes > maxReportBytes) {
              timelineCountExceeded ||= timeline.length > maxTimelineEvents;
              timelineBytesExceeded ||= timelineBytes > maxReportBytes;
              timeline.shift();
              timelineBytes -= timelineSizes.shift()!;
              droppedTimelineEvents += 1;
            }
          }
          await consumerDiagnostic?.(safeEvent);
        },
      },
    );
    await client.session.connect();
    if (options.manifest) {
      manifestChecked = true;
      await assertManifestContract(client, options.manifest, {
        expectedToolNames: options.expectedToolNames,
      });
    }
    if (!options.manifest && options.expectedToolNames) {
      const actual = (await client.listTools()).map((tool) => tool.name).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
      const expected = [...options.expectedToolNames].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
      if (stableJson(actual) !== stableJson(expected)) {
        throw new McpFnAssertionError(`Tool inventory mismatch: expected ${stableJson(expected)}, actual ${stableJson(actual)}`);
      }
    }
    execution = {
      results: await runScenarios(
        client,
        options.scenarios ?? [],
        options.scenarioRun,
      ),
      server: client.session.getServerVersion(),
      capabilities: client.session.getServerCapabilities(),
    };
  } catch (error) {
    try {
      failure = normalizeMcpFnReportFailure(redactSuiteArtifact(options.target, error, { preserveKeys: true }));
    } catch {
      // Arbitrary error properties/proxies can throw, including secret-bearing errors.
      failure = normalizeMcpFnReportFailure({ name: "RedactionError", code: "MCPFN_REDACTION_FAILED", message: "Target failure omitted because credential redaction failed" });
    }
  } finally {
    try {
      await client?.close();
    } catch (error) {
      const owner = client;
      if (owner) retainedCleanup = () => owner.close();
      cleanupFailure = normalizeMcpFnReportFailure({ name: "CleanupError", message: "Target cleanup failed", code: "MCPFN_TARGET_CLEANUP_FAILED", phase: "transport-close" });
      if (!failure) failure = cleanupFailure;
    }
  }
  failure ??= cleanupFailure;
  const results = execution.results;
  const failed = results.filter((result) => result.status === "failed").length;
  const incomplete = results.filter((result) => result.status === "incomplete").length;
  const droppedObservedEvents = results.reduce(
    (total, result) => total + (result.droppedObservedEvents ?? 0),
    0,
  );
  const artifactIncomplete = Boolean(failure) || incomplete > 0 ||
    droppedTimelineEvents > 0 ||
    droppedObservedEvents > 0;
  const report: McpFnTargetSuiteReport = {
    formatVersion: 1,
    kind: "mcpfn.target-suite-report",
    status: artifactIncomplete ? "incomplete" : "complete",
    runtime: {
      node: process.version,
      scenarioFormatVersion: 1,
      reportSchemaVersion: MCPFN_REPORT_SCHEMA_VERSION,
      packages: { testing: MCPFN_TESTING_VERSION },
    },
    ok: failed === 0 && !artifactIncomplete,
    target: { kind: "custom" },
    server: execution.server,
    capabilities: execution.capabilities,
    manifestChecked,
    ...(options.manifest ? { manifestHash: options.manifest.hash } : {}),
    total: results.length,
    passed: results.length - failed - incomplete,
    failed,
    incomplete,
    droppedResults: 0,
    droppedObservedEvents,
    ...(failure || droppedTimelineEvents > 0 || droppedObservedEvents > 0
      ? {
        incompleteReason: [
          ...(failure ? [`${failure.layer}: ${failure.message}`] : []),
          ...(cleanupFailure ? [`Cleanup: ${cleanupFailure.message}`] : []),
          ...(timelineSerializationFailed ? ["Diagnostic timeline contained non-JSON data"] : []),
          ...(timelineCountExceeded ? ["Diagnostic timeline exceeded maxTimelineEvents"] : []),
          ...(timelineBytesExceeded ? ["Diagnostic timeline exceeded maxReportBytes"] : []),
          ...(droppedObservedEvents > 0
            ? ["Observed client events exceeded maxObservedEvents"]
            : []),
        ].join("; "),
      }
      : {}),
    ...(failure ? { failure } : {}),
    timeline,
    droppedTimelineEvents,
    results,
  };
  let finalized: McpFnTargetSuiteReport;
  try {
    // Descriptors and final serialization share the same fail-closed boundary.
    // Scrub opaque credentials before generic redaction can truncate a match.
    const { kind, ...descriptor } = options.target.describe();
    // Rebuild the authored envelope. Custom hooks only see target payloads,
    // never report discriminators, counters, or already-redacted diagnostics.
    const projected: McpFnTargetSuiteReport = {
      ...report,
      target: { ...redactSuiteArtifact(options.target, descriptor), kind },
      server: report.server === undefined ? undefined : redactSuiteArtifact(options.target, report.server),
      capabilities: report.capabilities === undefined ? undefined : redactSuiteArtifact(options.target, report.capabilities),
      ...(report.manifestHash === undefined ? {} : { manifestHash: redactSuiteArtifact(options.target, report.manifestHash) }),
      results: report.results.map(result => ({
        ...result,
        name: redactSuiteArtifact(options.target, result.name),
        operation: redactSuiteArtifact(options.target, result.operation),
        ...(result.tool === undefined ? {} : { tool: redactSuiteArtifact(options.target, result.tool) }),
        // Scenario errors have already passed through client.session.redact.
      })),
    };
    finalized = enforceReportCap(redactTargetCredentials(options.target, projected, { preserveKeys: true }), maxReportBytes);
  } catch (error) {
    finalized = enforceReportCap({ ...report, ok: false, status: "incomplete",
      incompleteReason: error instanceof McpFnRedactionLimitError
        ? "Credential redaction exceeded its traversal budget"
        : "Report content omitted because safe serialization failed",
      target: { kind: "custom" }, server: undefined, capabilities: undefined, manifestHash: undefined,
      failure: undefined, results: [], timeline: [],
      droppedResults: report.results.length, droppedTimelineEvents: report.droppedTimelineEvents + report.timeline.length,
    }, maxReportBytes);
  }
  if (retainedCleanup) throw new McpFnTargetSuiteCleanupError(finalized, retainedCleanup);
  return finalized;
}

function enforceReportCap(
  report: McpFnTargetSuiteReport,
  maxBytes: number,
): McpFnTargetSuiteReport {
  validateReportCap(maxBytes);
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
    if (bounded.failure) {
      bounded.failure.details = undefined;
      bounded.failure.message = "Target operation failed; details omitted to fit report budget";
    }
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

function validateReportCap(maxBytes: number): void {
  if (!Number.isInteger(maxBytes) || maxBytes < 1_024) {
    throw new Error("maxReportBytes must be an integer of at least 1024");
  }
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
