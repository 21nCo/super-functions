import {
  McpFnRedactionLimitError,
  McpFnStructuralCredentialCollisionError,
  beginTargetCredentialRedaction,
  redactTargetCredentials,
} from "./remote-target.js";
import type { Implementation, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import {
  McpFnClientError,
  type McpFnDiagnosticEvent,
  type McpFnTarget,
  type McpFnTargetDescriptor,
} from "@mcpfn/client";
import type { McpFnManifest } from "@mcpfn/core";

import { assertManifestContract, McpFnAssertionError, stableJson } from "./assertions.js";
import {
  McpFnTestClient,
  McpFnTestClientCleanupError,
  type McpFnTestClientOptions,
} from "./client.js";
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
  redactionOmittedObservedEvents?: number;
  incompleteReason?: string;
  failure?: McpFnReportFailure;
  timeline: McpFnDiagnosticEvent[];
  droppedTimelineEvents: number;
  results: McpFnScenarioResult[];
}

const suiteCleanupOwners = new WeakMap<Error, { close: () => Promise<void>; pending?: Promise<void> }>();

function retryTargetSuiteCleanup(error: Error): Promise<void> {
  const owner = suiteCleanupOwners.get(error);
  if (!owner) return Promise.resolve();
  if (owner.pending) return owner.pending;
  const pending = Promise.resolve().then(owner.close).then(
    () => { suiteCleanupOwners.delete(error); },
    () => { throw error; },
  ).finally(() => { owner.pending = undefined; });
  owner.pending = pending;
  return pending;
}

/** Final cleanup failed. The bounded report is a snapshot; retain this error to retry. */
export class McpFnTargetSuiteCleanupError extends Error {
  constructor(readonly report: McpFnTargetSuiteReport, close: () => Promise<void>) {
    super("Target suite cleanup failed; retain this error and retryCleanup()");
    this.name = "McpFnTargetSuiteCleanupError";
    suiteCleanupOwners.set(this, { close });
  }

  retryCleanup(): Promise<void> {
    return retryTargetSuiteCleanup(this);
  }
}

/** Report serialization failed after cleanup ownership had already transferred. */
export class McpFnTargetSuiteArtifactCleanupError extends Error {
  constructor(close: () => Promise<void>, cause: Error) {
    super(`${cause.message}; retain this error and retryCleanup()`, { cause });
    this.name = "McpFnTargetSuiteArtifactCleanupError";
    suiteCleanupOwners.set(this, { close });
  }

  retryCleanup(): Promise<void> {
    return retryTargetSuiteCleanup(this);
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
  const scrubbed = target.redact ? target.redact(value, options) : value;
  return redactTargetCredentials(target, scrubbed, options);
}

function compareInventoryNames(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function reportProjectionFailureReason(
  error: unknown,
  projectionFailure: "redaction" | "serialization" | undefined,
): string {
  if (error instanceof McpFnRedactionLimitError) {
    return "Credential redaction exceeded its traversal budget";
  }
  if (projectionFailure === "redaction") {
    return "Credential redaction failed; report content omitted because safe serialization failed";
  }
  return "Report content omitted because safe serialization failed";
}

class SuiteDiagnosticCollector {
  readonly timeline: McpFnDiagnosticEvent[] = [];
  private readonly timelineSizes: number[] = [];
  private timelineBytes = 0;
  private observedRedactionOmissions = 0;
  private initialRedactionOmissions = 0;
  dropped = 0;
  countExceeded = false;
  bytesExceeded = false;
  serializationFailed = false;
  redactionFailed = false;
  cleanupFailure: McpFnReportFailure | undefined;

  constructor(
    private readonly maxEvents: number,
    private readonly maxBytes: number,
    private readonly target: McpFnTarget,
    private readonly consumer?: (event: McpFnDiagnosticEvent) => void | Promise<void>,
  ) {}

  captureBaseline(client: McpFnTestClient): void {
    this.initialRedactionOmissions = client.session
      .getRedactionOmissionCounts().diagnostics;
  }

  captureUnobserved(client: McpFnTestClient | undefined): void {
    const total = client?.session.getRedactionOmissionCounts().diagnostics ??
      this.initialRedactionOmissions;
    const unobserved = Math.max(
      0,
      total - this.initialRedactionOmissions - this.observedRedactionOmissions,
    );
    if (unobserved > 0) {
      this.redactionFailed = true;
      this.dropped += unobserved;
    }
  }

  async record(client: McpFnTestClient | undefined, event: McpFnDiagnosticEvent): Promise<void> {
    if (client?.session.isRedactionOmission(event)) {
      this.observedRedactionOmissions += 1;
      this.redactionFailed = true;
      this.dropped += 1;
    }
    if (["token-revocation", "transport-close"].includes(event.phase) &&
        event.outcome === "failed") {
      this.cleanupFailure ??= normalizeMcpFnReportFailure({
        name: "CleanupError", message: "Target cleanup failed",
        code: event.code, phase: event.phase,
      });
    }
    const safeEvent = redactTargetCredentials(this.target, event, { preserveKeys: true });
    const bytes = this.serializedBytes(safeEvent);
    if (bytes === undefined) {
      await this.consumer?.(safeEvent);
      return;
    }
    if (bytes > this.maxBytes) {
      this.bytesExceeded = true;
      this.dropped += 1;
    } else {
      this.timeline.push(safeEvent);
      this.timelineSizes.push(bytes);
      this.timelineBytes += bytes;
      this.enforceBounds();
    }
    await this.consumer?.(safeEvent);
  }

  private serializedBytes(event: McpFnDiagnosticEvent): number | undefined {
    try {
      const json = JSON.stringify(event, (_key, value: unknown) => {
        if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
          throw new Error("Diagnostic contains a non-JSON value");
        }
        return value;
      });
      structuredClone(event);
      return Buffer.byteLength(json);
    } catch {
      this.serializationFailed = true;
      this.dropped += 1;
      return undefined;
    }
  }

  private enforceBounds(): void {
    while (this.timeline.length > this.maxEvents || this.timelineBytes > this.maxBytes) {
      this.countExceeded ||= this.timeline.length > this.maxEvents;
      this.bytesExceeded ||= this.timelineBytes > this.maxBytes;
      this.timeline.shift();
      this.timelineBytes -= this.timelineSizes.shift()!;
      this.dropped += 1;
    }
  }
}

interface SuiteExecution {
  results: McpFnScenarioResult[];
  server?: Implementation;
  capabilities?: ServerCapabilities;
}

interface SuiteProjection {
  target: McpFnTargetDescriptor;
  manifestHash?: string;
  execution: SuiteExecution;
  failure?: "redaction" | "serialization";
}

async function executeConnectedSuite(
  client: McpFnTestClient,
  options: RunMcpFnTargetSuiteOptions,
): Promise<{ execution: SuiteExecution; manifestChecked: boolean }> {
  let manifestChecked = false;
  if (options.manifest) {
    manifestChecked = true;
    await assertManifestContract(client, options.manifest, {
      expectedToolNames: options.expectedToolNames,
    });
  } else if (options.expectedToolNames) {
    const actual = (await client.listTools()).map((tool) => tool.name).sort(compareInventoryNames);
    const expected = [...options.expectedToolNames].sort(compareInventoryNames);
    if (stableJson(actual) !== stableJson(expected)) {
      throw new McpFnAssertionError(
        `Tool inventory mismatch: expected ${stableJson(expected)}, actual ${stableJson(actual)}`,
      );
    }
  }
  const results = await runScenarios(client, options.scenarios ?? [], options.scenarioRun);
  return {
    manifestChecked,
    execution: {
      results,
      server: client.session.getServerVersion(),
      capabilities: client.session.getServerCapabilities(),
    },
  };
}

function safeTargetFailure(target: McpFnTarget, error: unknown): McpFnReportFailure {
  try {
    return normalizeMcpFnReportFailure(redactSuiteArtifact(target, error, { preserveKeys: true }));
  } catch {
    // Arbitrary error properties/proxies can throw, including secret-bearing errors.
    return normalizeMcpFnReportFailure({
      name: "RedactionError",
      code: "MCPFN_REDACTION_FAILED",
      message: "Target failure omitted because credential redaction failed",
    });
  }
}

function initialTargetDescriptor(target: McpFnTarget): McpFnTargetDescriptor {
  const kind = target.kind;
  return ["stdio", "streamable-http", "authenticated-streamable-http", "in-memory", "custom"]
    .includes(kind)
    ? { kind }
    : { kind: "custom" };
}

function safeInitialTargetDescriptor(target: McpFnTarget): McpFnTargetDescriptor {
  try { return initialTargetDescriptor(target); }
  catch { return { kind: "custom" }; }
}

function projectSuiteArtifacts(
  options: RunMcpFnTargetSuiteOptions,
  client: McpFnTestClient | undefined,
  execution: SuiteExecution,
): SuiteProjection {
  const fallback: SuiteProjection = {
    target: safeInitialTargetDescriptor(options.target), execution,
  };
  try {
    if (client?.session.state !== "connected") {
      return execution.results.length || execution.server || execution.capabilities
        ? { ...fallback, failure: "serialization" }
        : fallback;
    }
    let described: McpFnTargetDescriptor;
    try { described = options.target.describe(); }
    catch { return { ...fallback, failure: "serialization" }; }
    try {
      const { kind, ...descriptor } = described;
      return {
        target: {
          ...redactSuiteArtifact(options.target, descriptor, { preserveKeys: false }),
          kind: client.session.preserveArtifactStructure(kind),
        },
        manifestHash: options.manifest
          ? redactSuiteArtifact(options.target, options.manifest.hash, { preserveKeys: false })
          : undefined,
        execution: {
          server: execution.server === undefined
            ? undefined
            : redactSuiteArtifact(options.target, execution.server, { preserveKeys: false }),
          capabilities: execution.capabilities === undefined
            ? undefined
            : redactSuiteArtifact(options.target, execution.capabilities, { preserveKeys: false }),
          results: execution.results.map(result => ({
            ...result,
            name: redactSuiteArtifact(options.target, result.name, { preserveKeys: false }),
            operation: redactSuiteArtifact(options.target, result.operation, { preserveKeys: false }),
            ...(result.tool === undefined ? {} : {
              tool: redactSuiteArtifact(options.target, result.tool, { preserveKeys: false }),
            }),
          })),
        },
      };
    } catch {
      return { ...fallback, failure: "redaction" };
    }
  } catch {
    return { ...fallback, failure: "serialization" };
  }
}

const suiteStructureKeys = [
  "formatVersion", "kind", "status", "runtime", "ok", "target", "server",
  "capabilities", "manifestChecked", "manifestHash", "total", "passed", "failed",
  "incomplete", "droppedResults", "droppedObservedEvents",
  "redactionOmittedObservedEvents", "incompleteReason", "failure", "timeline",
  "droppedTimelineEvents", "results", "node", "scenarioFormatVersion",
  "reportSchemaVersion", "packages", "testing", "name", "message", "layer", "code",
  "phase", "details", "outcome", "requestId", "at", "sideEffect", "durationMs",
  "error", "operation", "tool",
] as const;

const suiteStructureValues = [
  "mcpfn.target-suite-report", "complete", "incomplete", "passed", "failed",
  "started", "succeeded", "none", "idempotent", "non-idempotent",
  "mcpfn-preflight", "authorization-server", "resource-server", "mcp-initialization",
  "scenario", "upstream-conformance", "resource-discovery",
  "authorization-server-discovery", "client-registration", "authorization-request",
  "authorization-callback", "token-exchange", "token-refresh", "token-revocation",
  "transport-connect", "mcp-initialize", "capability-operation", "transport-close",
  "authenticated-streamable-http", "streamable-http", "stdio", "in-memory", "custom",
] as const;

interface SuiteStructureGuard {
  assert(value: string): void;
}

function captureSuiteStructureGuard(
  target: McpFnTarget,
  projection: SuiteProjection,
  diagnostics: SuiteDiagnosticCollector,
  failure: McpFnReportFailure | undefined,
): SuiteStructureGuard {
  const candidates = new Set<string>([
    ...suiteStructureKeys,
    ...suiteStructureValues,
    process.version,
    MCPFN_REPORT_SCHEMA_VERSION,
    MCPFN_TESTING_VERSION,
    projection.target.kind,
  ]);
  if (failure?.phase) candidates.add(failure.phase);
  for (const result of projection.execution.results) {
    candidates.add(result.status);
    if (result.sideEffect) candidates.add(result.sideEffect);
  }
  for (const event of diagnostics.timeline) {
    candidates.add(event.phase);
    candidates.add(event.outcome);
    if (event.target?.kind) candidates.add(event.target.kind);
  }
  const safe = new Set<string>();
  for (const candidate of candidates) {
    try {
      if (redactSuiteArtifact(target, candidate, { preserveKeys: false }) === candidate) {
        safe.add(candidate);
      }
    } catch {
      // If the live custom scrubber cannot classify a string, fail closed only
      // when the final report actually needs that unproven structure.
    }
  }
  return {
    assert(value: string): void {
      if (!safe.has(value)) throw new McpFnStructuralCredentialCollisionError();
    },
  };
}

function assertStructureKeys(value: object, guard: SuiteStructureGuard): void {
  for (const key of Object.keys(value)) guard.assert(key);
}

function assertTargetStructure(
  target: McpFnTargetDescriptor,
  guard: SuiteStructureGuard,
): void {
  guard.assert("kind");
  guard.assert(target.kind);
}

function assertSuiteReportStructure(
  report: McpFnTargetSuiteReport,
  guard: SuiteStructureGuard,
): void {
  assertStructureKeys(report, guard);
  guard.assert(report.kind);
  guard.assert(report.status);
  assertStructureKeys(report.runtime, guard);
  guard.assert(report.runtime.node);
  guard.assert(report.runtime.reportSchemaVersion);
  assertStructureKeys(report.runtime.packages, guard);
  guard.assert(report.runtime.packages.testing);
  assertTargetStructure(report.target, guard);
  if (report.failure) {
    assertStructureKeys(report.failure, guard);
    guard.assert(report.failure.layer);
    if (report.failure.phase) guard.assert(report.failure.phase);
  }
  for (const event of report.timeline) {
    assertStructureKeys(event, guard);
    guard.assert(event.phase);
    guard.assert(event.outcome);
    if (event.target) assertTargetStructure(event.target, guard);
  }
  for (const result of report.results) {
    assertStructureKeys(result, guard);
    guard.assert(result.status);
    if (result.sideEffect) guard.assert(result.sideEffect);
  }
}

async function closeSuiteClient(client: McpFnTestClient | undefined): Promise<{
  cleanupFailure?: McpFnReportFailure;
  retainedCleanup?: () => Promise<void>;
}> {
  try {
    await client?.close();
    return {};
  } catch (error) {
    let retainedCleanup: (() => Promise<void>) | undefined;
    if (error instanceof McpFnTestClientCleanupError) {
      retainedCleanup = () => error.retryCleanup();
    } else if (client) {
      retainedCleanup = () => client.close();
    }
    const terminal = error instanceof McpFnTestClientCleanupError && error.cause !== undefined
      ? error.cause
      : error;
    const phase = terminal && typeof terminal === "object" &&
        (terminal as { phase?: unknown }).phase === "token-revocation"
      ? "token-revocation"
      : "transport-close";
    return {
      retainedCleanup,
      cleanupFailure: normalizeMcpFnReportFailure({
        name: "CleanupError",
        message: "Target cleanup failed",
        code: "MCPFN_TARGET_CLEANUP_FAILED",
        phase,
      }),
    };
  }
}

interface SuiteConnection {
  client?: McpFnTestClient;
  manifestChecked: boolean;
  failure?: McpFnReportFailure;
  execution: SuiteExecution;
}

async function connectSuite(
  options: RunMcpFnTargetSuiteOptions,
  diagnostics: SuiteDiagnosticCollector,
): Promise<SuiteConnection> {
  let client: McpFnTestClient | undefined;
  let manifestChecked = false;
  let failure: McpFnReportFailure | undefined;
  let execution: SuiteExecution = { results: [] };
  try {
    client = McpFnTestClient.createTarget(
      options.target,
      options.clientInfo ?? { name: "mcpfn-suite", version: "0.0.1" },
      {
        ...options.client,
        diagnostics: event => diagnostics.record(client, event),
      },
    );
    diagnostics.captureBaseline(client);
    await client.session.connect();
    ({ execution, manifestChecked } = await executeConnectedSuite(client, options));
  } catch (error) {
    failure = safeTargetFailure(options.target, error);
  }
  return { client, manifestChecked, failure, execution };
}

async function projectAndCloseSuite(
  options: RunMcpFnTargetSuiteOptions,
  diagnostics: SuiteDiagnosticCollector,
  connection: SuiteConnection,
): Promise<{
  projection: SuiteProjection;
  structureGuard: SuiteStructureGuard;
  closeResult: Awaited<ReturnType<typeof closeSuiteClient>>;
}> {
  let projection: SuiteProjection;
  let structureGuard: SuiteStructureGuard;
  let closeResult: Awaited<ReturnType<typeof closeSuiteClient>> = {};
  try {
    projection = projectSuiteArtifacts(options, connection.client, connection.execution);
    structureGuard = captureSuiteStructureGuard(
      options.target,
      projection,
      diagnostics,
      connection.failure,
    );
  } finally {
    closeResult = await closeSuiteClient(connection.client);
  }
  return { projection, structureGuard, closeResult };
}

function suiteIncompleteReasons(
  failure: McpFnReportFailure | undefined,
  cleanupFailure: McpFnReportFailure | undefined,
  diagnostics: SuiteDiagnosticCollector,
  redactionOmittedObservedEvents: number,
  overflowedObservedEvents: number,
): string | undefined {
  const reasons = [
    ...(failure ? [`${failure.layer}: ${failure.message}`] : []),
    ...(cleanupFailure ? [`Cleanup: ${cleanupFailure.message}`] : []),
    ...(diagnostics.serializationFailed ? ["Diagnostic timeline contained non-JSON data"] : []),
    ...(diagnostics.redactionFailed ? ["Diagnostic timeline redaction failed; original events omitted"] : []),
    ...(diagnostics.countExceeded ? ["Diagnostic timeline exceeded maxTimelineEvents"] : []),
    ...(diagnostics.bytesExceeded ? ["Diagnostic timeline exceeded maxReportBytes"] : []),
    ...(redactionOmittedObservedEvents > 0
      ? ["Observed client events were omitted because credential redaction failed"]
      : []),
    ...(overflowedObservedEvents > 0
      ? ["Observed client events exceeded maxObservedEvents"]
      : []),
  ];
  return reasons.length ? reasons.join("; ") : undefined;
}

function buildSuiteReport(
  projection: SuiteProjection,
  manifestChecked: boolean,
  failure: McpFnReportFailure | undefined,
  cleanupFailure: McpFnReportFailure | undefined,
  diagnostics: SuiteDiagnosticCollector,
): McpFnTargetSuiteReport {
  const results = projection.execution.results;
  const failed = results.filter((result) => result.status === "failed").length;
  const incomplete = results.filter((result) => result.status === "incomplete").length;
  const droppedObservedEvents = results.reduce(
    (total, result) => total + (result.droppedObservedEvents ?? 0),
    0,
  );
  const redactionOmittedObservedEvents = results.reduce(
    (total, result) => total + (result.redactionOmittedObservedEvents ?? 0),
    0,
  );
  const overflowedObservedEvents = droppedObservedEvents - redactionOmittedObservedEvents;
  const artifactIncomplete = Boolean(failure) || incomplete > 0 ||
    diagnostics.dropped > 0 || droppedObservedEvents > 0;
  const incompleteReason = suiteIncompleteReasons(
    failure,
    cleanupFailure,
    diagnostics,
    redactionOmittedObservedEvents,
    overflowedObservedEvents,
  );
  return {
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
    target: projection.target,
    server: projection.execution.server,
    capabilities: projection.execution.capabilities,
    manifestChecked,
    ...(projection.manifestHash === undefined ? {} : { manifestHash: projection.manifestHash }),
    total: results.length,
    passed: results.length - failed - incomplete,
    failed,
    incomplete,
    droppedResults: 0,
    droppedObservedEvents,
    ...(redactionOmittedObservedEvents > 0 ? { redactionOmittedObservedEvents } : {}),
    ...(incompleteReason ? { incompleteReason } : {}),
    ...(failure ? { failure } : {}),
    timeline: diagnostics.timeline,
    droppedTimelineEvents: diagnostics.dropped,
    results,
  };
}

function structuralReportFailure(retainedCleanup: (() => Promise<void>) | undefined): never {
  const failure = new McpFnClientError(
    "MCPFN_OPERATION_FAILED",
    "Target report cannot be serialized because a credential conflicts with required artifact structure",
    { phase: "capability-operation" },
  );
  if (retainedCleanup) {
    throw new McpFnTargetSuiteArtifactCleanupError(retainedCleanup, failure);
  }
  throw failure;
}

function boundedSuiteReport(
  report: McpFnTargetSuiteReport,
  guard: SuiteStructureGuard,
  maxReportBytes: number,
): McpFnTargetSuiteReport {
  const bounded = enforceReportCap(report, maxReportBytes);
  assertSuiteReportStructure(bounded, guard);
  return bounded;
}

function finalizeSuiteReport(
  options: RunMcpFnTargetSuiteOptions,
  projection: SuiteProjection,
  report: McpFnTargetSuiteReport,
  guard: SuiteStructureGuard,
  maxReportBytes: number,
  retainedCleanup: (() => Promise<void>) | undefined,
): McpFnTargetSuiteReport {
  let finalized: McpFnTargetSuiteReport;
  try {
    if (projection.failure) throw new Error("Report payload projection failed");
    assertSuiteReportStructure(report, guard);
    // Custom redaction already completed before cleanup. Built-in report scopes
    // remain active here for bounded final serialization.
    finalized = boundedSuiteReport(
      redactTargetCredentials(options.target, report, { preserveKeys: true }),
      guard,
      maxReportBytes,
    );
  } catch (error) {
    if (error instanceof McpFnStructuralCredentialCollisionError) {
      return structuralReportFailure(retainedCleanup);
    }
    const fallback = {
      ...report,
      ok: false,
      status: "incomplete" as const,
      incompleteReason: reportProjectionFailureReason(error, projection.failure),
      target: { kind: "custom" as const },
      server: undefined,
      capabilities: undefined,
      manifestHash: undefined,
      failure: undefined,
      results: [],
      timeline: [],
      droppedResults: report.results.length,
      droppedTimelineEvents: report.droppedTimelineEvents + report.timeline.length,
    };
    try {
      finalized = boundedSuiteReport(fallback, guard, maxReportBytes);
    } catch (fallbackError) {
      if (fallbackError instanceof McpFnStructuralCredentialCollisionError) {
        return structuralReportFailure(retainedCleanup);
      }
      throw fallbackError;
    }
  }
  if (retainedCleanup) throw new McpFnTargetSuiteCleanupError(finalized, retainedCleanup);
  return finalized;
}

async function runTargetSuite(options: RunMcpFnTargetSuiteOptions): Promise<McpFnTargetSuiteReport> {
  const maxTimelineEvents = options.maxTimelineEvents ?? 500;
  if (!Number.isInteger(maxTimelineEvents) || maxTimelineEvents < 1) {
    throw new Error("maxTimelineEvents must be a positive integer");
  }
  const maxReportBytes = options.maxReportBytes ?? 1_048_576;
  validateReportCap(maxReportBytes);
  const consumerDiagnostic = options.client?.diagnostics;
  const diagnostics = new SuiteDiagnosticCollector(
    maxTimelineEvents,
    maxReportBytes,
    options.target,
    consumerDiagnostic,
  );
  const connection = await connectSuite(options, diagnostics);
  // Custom hooks may depend on credentials cleared by close. Capture payload
  // projection and structural safety while the session still owns that state,
  // but never let either operation bypass the sole cleanup boundary.
  const { projection, structureGuard, closeResult } = await projectAndCloseSuite(
    options,
    diagnostics,
    connection,
  );
  const { cleanupFailure: closeFailure, retainedCleanup } = closeResult;
  diagnostics.captureUnobserved(connection.client);
  let cleanupFailure = closeFailure;
  cleanupFailure ??= diagnostics.cleanupFailure;
  const failure = connection.failure ?? cleanupFailure;
  const report = buildSuiteReport(
    projection,
    connection.manifestChecked,
    failure,
    cleanupFailure,
    diagnostics,
  );
  return finalizeSuiteReport(
    options,
    projection,
    report,
    structureGuard,
    maxReportBytes,
    retainedCleanup,
  );
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
