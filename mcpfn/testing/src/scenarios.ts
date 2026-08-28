import type {
  CallToolResult,
  CreateTaskResult,
  GetPromptResult,
  ListTasksResult,
  ReadResourceResult,
  Task,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpFnClientEvent, McpFnClientEventKind } from "@mcpfn/client";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import { McpFnAssertionError, assertStructuredTextParity, stableJson } from "./assertions.js";
import type { McpFnTestClient } from "./client.js";

export type McpFnScenarioSideEffect = "none" | "idempotent" | "non-idempotent";

export interface McpFnScenarioBase {
  formatVersion?: 1;
  name: string;
  /** Defaults to the runner timeout. */
  timeoutMs?: number;
  sideEffect?: McpFnScenarioSideEffect;
  status?: "complete" | "incomplete";
  incompleteReason?: string;
  /** Environment-backed placeholders used by this scenario, never their values. */
  variables?: string[];
}

export interface McpFnToolScenario extends McpFnScenarioBase {
  kind?: "tools.call";
  tool: string;
  arguments?: Record<string, unknown>;
  expect?: {
    isError?: boolean;
    structuredContent?: unknown;
    structuredTextParity?: boolean;
  };
  verify?(result: CallToolResult): void | Promise<void>;
}

export interface McpFnInventoryScenario extends McpFnScenarioBase {
  kind: "tools.list" | "resources.list" | "resources.templates.list" | "prompts.list";
  expectNames?: string[];
}

export interface McpFnResourceScenario extends McpFnScenarioBase {
  kind: "resources.read" | "resources.subscribe" | "resources.unsubscribe";
  uri: string;
  expect?: unknown;
}

export interface McpFnPromptScenario extends McpFnScenarioBase {
  kind: "prompts.get";
  prompt: string;
  arguments?: Record<string, string>;
  expect?: unknown;
}

export interface McpFnInitializeScenario extends McpFnScenarioBase {
  kind: "initialize";
  expectCapabilities?: Record<string, unknown>;
}

export interface McpFnCreateTaskScenario extends McpFnScenarioBase {
  kind: "tools.call:task";
  tool: string;
  arguments?: Record<string, unknown>;
  task?: { ttl?: number };
  expect?: unknown;
}

export interface McpFnTaskScenario extends McpFnScenarioBase {
  kind: "tasks.get" | "tasks.result" | "tasks.cancel" | "tasks.list";
  taskId?: string;
  cursor?: string;
  expect?: unknown;
}

export interface McpFnEventScenario extends McpFnScenarioBase {
  kind: "events.expect";
  event: McpFnClientEventKind;
  minimum?: number;
  expectPayload?: unknown;
}

export interface McpFnAuthScenario extends McpFnScenarioBase {
  kind: "auth.assert";
  phase: string;
  expect: {
    outcome: "allowed" | "denied";
    code?: string;
  };
  input?: Record<string, unknown>;
}

export type McpFnScenario =
  | McpFnToolScenario
  | McpFnInventoryScenario
  | McpFnResourceScenario
  | McpFnPromptScenario
  | McpFnInitializeScenario
  | McpFnCreateTaskScenario
  | McpFnTaskScenario
  | McpFnEventScenario
  | McpFnAuthScenario;

export interface McpFnScenarioArtifact {
  formatVersion: 1;
  kind: "mcpfn.scenarios";
  status: "complete" | "incomplete";
  scenarios: McpFnScenario[];
  variables?: string[];
  incompleteReason?: string;
}

export type McpFnRecordedOperation =
  | { kind: "tools.call"; name: string; arguments?: Record<string, unknown> }
  | { kind: "tools.call:task"; name: string; arguments?: Record<string, unknown>; task?: { ttl?: number } }
  | { kind: "resources.read"; uri: string }
  | { kind: "resources.subscribe"; uri: string }
  | { kind: "resources.unsubscribe"; uri: string }
  | { kind: "prompts.get"; name: string; arguments?: Record<string, string> }
  | { kind: "tasks.get"; taskId: string }
  | { kind: "tasks.result"; taskId: string }
  | { kind: "tasks.cancel"; taskId: string }
  | { kind: "tasks.list"; cursor?: string };

export type McpFnRecordedOperationResult =
  | CallToolResult
  | ReadResourceResult
  | GetPromptResult
  | CreateTaskResult
  | Task
  | ListTasksResult
  | void;

export interface McpFnScenarioResult {
  formatVersion: 1;
  name: string;
  operation: string;
  tool?: string;
  status: "passed" | "failed" | "incomplete";
  sideEffect: McpFnScenarioSideEffect;
  durationMs: number;
  error?: string;
  /** Observed client events discarded while this scenario was running. */
  droppedObservedEvents?: number;
}

export interface McpFnScenarioReport {
  formatVersion: 1;
  kind: "mcpfn.scenario-report";
  status: "complete" | "incomplete";
  manifestHash?: string;
  total: number;
  passed: number;
  failed: number;
  incomplete: number;
  droppedResults: number;
  droppedObservedEvents: number;
  incompleteReason?: string;
  results: McpFnScenarioResult[];
}

/** Convert an observed production-client operation into the shared runner contract. */
export function createMcpFnScenario(
  name: string,
  operation: McpFnRecordedOperation,
  result: McpFnRecordedOperationResult,
): McpFnScenario {
  switch (operation.kind) {
    case "tools.call":
      return createToolCallScenario(name, operation, result as CallToolResult);
    case "tools.call:task":
      return createToolTaskScenario(name, operation);
    case "resources.read":
      return createResourceReadScenario(name, operation, result);
    case "resources.subscribe":
    case "resources.unsubscribe":
      return createResourceLifecycleScenario(name, operation);
    case "tasks.get":
    case "tasks.cancel":
      return createTaskLifecycleScenario(name, operation);
    case "tasks.result":
      return createTaskResultScenario(name, operation, result);
    case "tasks.list":
      return createTaskListScenario(name, operation);
    case "prompts.get":
      return createPromptScenario(name, operation, result);
  }
}

function scenarioBase(name: string, sideEffect: McpFnScenarioSideEffect) {
  return { formatVersion: 1 as const, name, sideEffect };
}

function createToolCallScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "tools.call" }>,
  result: CallToolResult,
): McpFnToolScenario {
  return {
    ...scenarioBase(name, "non-idempotent"),
    kind: "tools.call",
    tool: operation.name,
    ...(operation.arguments ? { arguments: operation.arguments } : {}),
    expect: {
      isError: Boolean(result.isError),
      ...(result.structuredContent !== undefined
        ? { structuredContent: result.structuredContent }
        : {}),
    },
  };
}

function createToolTaskScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "tools.call:task" }>,
): McpFnCreateTaskScenario {
  return {
    ...scenarioBase(name, "non-idempotent"),
    kind: operation.kind,
    tool: operation.name,
    ...(operation.arguments ? { arguments: operation.arguments } : {}),
    ...(operation.task ? { task: operation.task } : {}),
  };
}

function createResourceReadScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "resources.read" }>,
  result: McpFnRecordedOperationResult,
): McpFnResourceScenario {
  return {
    ...scenarioBase(name, "none"),
    kind: operation.kind,
    uri: operation.uri,
    expect: result,
  };
}

function createResourceLifecycleScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "resources.subscribe" | "resources.unsubscribe" }>,
): McpFnResourceScenario {
  return {
    ...scenarioBase(name, "idempotent"),
    kind: operation.kind,
    uri: operation.uri,
  };
}

function createTaskLifecycleScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "tasks.get" | "tasks.cancel" }>,
): McpFnTaskScenario {
  return {
    ...scenarioBase(name, operation.kind === "tasks.cancel" ? "idempotent" : "none"),
    kind: operation.kind,
    taskId: operation.taskId,
  };
}

function createTaskResultScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "tasks.result" }>,
  result: McpFnRecordedOperationResult,
): McpFnTaskScenario {
  return {
    ...scenarioBase(name, "none"),
    kind: operation.kind,
    taskId: operation.taskId,
    expect: result,
  };
}

function createTaskListScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "tasks.list" }>,
): McpFnTaskScenario {
  return {
    ...scenarioBase(name, "none"),
    kind: operation.kind,
    ...(operation.cursor ? { cursor: operation.cursor } : {}),
  };
}

function createPromptScenario(
  name: string,
  operation: Extract<McpFnRecordedOperation, { kind: "prompts.get" }>,
  result: McpFnRecordedOperationResult,
): McpFnPromptScenario {
  return {
    ...scenarioBase(name, "none"),
    kind: operation.kind,
    prompt: operation.name,
    ...(operation.arguments ? { arguments: operation.arguments } : {}),
    expect: result,
  };
}

/** Validate an unknown scenario module before it reaches the shared runner. */
export function validateMcpFnScenarios(value: unknown): McpFnScenario[] {
  const artifact = isScenarioArtifact(value) ? value : undefined;
  if (artifact?.status === "incomplete") {
    throw new Error(`McpFn scenario artifact is incomplete: ${artifact.incompleteReason}`);
  }
  const scenarios = artifact?.scenarios ?? value;
  if (!Array.isArray(scenarios)) {
    throw new TypeError("Scenario module must export an array or mcpfn.scenarios artifact");
  }
  for (const [index, scenario] of scenarios.entries()) {
    validateScenarioCandidate(scenario, index);
  }
  return scenarios as McpFnScenario[];
}

const SCENARIO_KINDS_WITHOUT_REQUIRED_FIELDS = new Set([
  "initialize",
  "tools.list",
  "resources.list",
  "resources.templates.list",
  "prompts.list",
  "tasks.list",
  "auth.assert",
]);

function validateScenarioCandidate(scenario: unknown, index: number): void {
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    throw new TypeError(`Invalid scenario at index ${index}`);
  }
  const candidate = scenario as Record<string, unknown>;
  validateScenarioIdentity(candidate, index);
  const kind = scenarioKind(candidate, index);
  validateScenarioOperation(candidate, kind, index);
  validateScenarioLimits(candidate, index);
  validateScenarioMetadata(candidate, index);
  if (kind === "auth.assert") validateAuthScenario(candidate, index);
}

function validateScenarioIdentity(candidate: Record<string, unknown>, index: number): void {
  if (candidate.formatVersion !== undefined && candidate.formatVersion !== 1) {
    throw new TypeError(`Invalid scenario at index ${index}: unsupported formatVersion`);
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new TypeError(`Invalid scenario at index ${index}: name is required`);
  }
}

function scenarioKind(candidate: Record<string, unknown>, index: number): string {
  const kind = candidate.kind ?? "tools.call";
  if (typeof kind !== "string") {
    throw new TypeError(`Invalid scenario at index ${index}: kind must be a string`);
  }
  return kind;
}

function validateScenarioOperation(
  candidate: Record<string, unknown>,
  kind: string,
  index: number,
): void {
  const requiredField = requiredScenarioField(kind);
  if (requiredField && typeof candidate[requiredField] !== "string") {
    throw new TypeError(`Invalid scenario at index ${index}: ${kind} requires ${requiredField}`);
  }
  if (!requiredField && !SCENARIO_KINDS_WITHOUT_REQUIRED_FIELDS.has(kind)) {
    throw new TypeError(`Invalid scenario at index ${index}: unsupported kind ${kind}`);
  }
}

function validateScenarioLimits(candidate: Record<string, unknown>, index: number): void {
  if (
    candidate.timeoutMs !== undefined &&
    (!Number.isInteger(candidate.timeoutMs) || Number(candidate.timeoutMs) < 1 || Number(candidate.timeoutMs) > 300_000)
  ) {
    throw new TypeError(`Invalid scenario at index ${index}: timeoutMs must be 1..300000`);
  }
  if (
    candidate.variables !== undefined &&
    (
      !Array.isArray(candidate.variables) ||
      candidate.variables.some((entry) => typeof entry !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(entry))
    )
  ) {
    throw new TypeError(`Invalid scenario at index ${index}: variables must be environment names`);
  }
}

function validateScenarioMetadata(candidate: Record<string, unknown>, index: number): void {
  if (candidate.status === "incomplete" && typeof candidate.incompleteReason !== "string") {
    throw new TypeError(`Invalid scenario at index ${index}: incompleteReason is required`);
  }
  if (
    candidate.sideEffect !== undefined &&
    (typeof candidate.sideEffect !== "string" || !["none", "idempotent", "non-idempotent"].includes(candidate.sideEffect))
  ) {
    throw new TypeError(`Invalid scenario at index ${index}: sideEffect is unsupported`);
  }
}

function validateAuthScenario(candidate: Record<string, unknown>, index: number): void {
  const expectation = candidate.expect as Record<string, unknown> | undefined;
  if (
    typeof candidate.phase !== "string" ||
    !expectation ||
    typeof expectation.outcome !== "string" ||
    !["allowed", "denied"].includes(expectation.outcome)
  ) {
    throw new TypeError(`Invalid scenario at index ${index}: auth.assert expectation is required`);
  }
}

export function createMcpFnScenarioArtifact(
  scenarios: McpFnScenario[],
  options?: Omit<McpFnScenarioArtifact, "formatVersion" | "kind" | "scenarios">,
): McpFnScenarioArtifact {
  const artifactOptions = options ?? { status: "complete" as const };
  return {
    formatVersion: 1,
    kind: "mcpfn.scenarios",
    ...artifactOptions,
    scenarios: validateMcpFnScenarios(scenarios),
  };
}

function isScenarioArtifact(value: unknown): value is McpFnScenarioArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "mcpfn.scenarios") return false;
  if (candidate.formatVersion !== 1) {
    throw new Error("Unsupported McpFn scenario artifact formatVersion");
  }
  if (candidate.status !== "complete" && candidate.status !== "incomplete") {
    throw new Error("McpFn scenario artifact status must be complete or incomplete");
  }
  if (candidate.status === "incomplete" && typeof candidate.incompleteReason !== "string") {
    throw new Error("Incomplete McpFn scenario artifact requires incompleteReason");
  }
  return true;
}

export async function runScenarios(
  client: McpFnTestClient<unknown>,
  scenarios: McpFnScenario[],
  options: McpFnScenarioRunOptions = {},
): Promise<McpFnScenarioResult[]> {
  if (
    options.defaultTimeoutMs !== undefined &&
    (
      !Number.isInteger(options.defaultTimeoutMs) ||
      options.defaultTimeoutMs < 1 ||
      options.defaultTimeoutMs > 300_000
    )
  ) {
    throw new Error("defaultTimeoutMs must be an integer from 1 through 300000");
  }
  if (
    options.maxScenarios !== undefined &&
    (!Number.isInteger(options.maxScenarios) || options.maxScenarios < 1)
  ) {
    throw new Error("maxScenarios must be a positive integer");
  }
  if (
    options.maxErrorBytes !== undefined &&
    (!Number.isInteger(options.maxErrorBytes) || options.maxErrorBytes < 64)
  ) {
    throw new Error("maxErrorBytes must be an integer of at least 64");
  }
  if (
    options.maxObservedEvents !== undefined &&
    (!Number.isInteger(options.maxObservedEvents) || options.maxObservedEvents < 1)
  ) {
    throw new Error("maxObservedEvents must be a positive integer");
  }
  if (scenarios.length > (options.maxScenarios ?? 1_000)) {
    throw new Error(`Scenario count exceeds the configured cap of ${options.maxScenarios ?? 1_000}`);
  }
  const results: McpFnScenarioResult[] = [];
  const observedEvents: McpFnClientEvent[] = [];
  const maxObservedEvents = options.maxObservedEvents ?? 500;
  let droppedObservedEvents = 0;
  let attributedDroppedObservedEvents = 0;
  const pushResult = (result: McpFnScenarioResult): void => {
    const newlyDropped = droppedObservedEvents - attributedDroppedObservedEvents;
    results.push({
      ...result,
      ...(newlyDropped > 0
        ? { droppedObservedEvents: (result.droppedObservedEvents ?? 0) + newlyDropped }
        : {}),
    });
    attributedDroppedObservedEvents = droppedObservedEvents;
  };
  const unsubscribe = client.session.onEvent((event) => {
    observedEvents.push(event);
    if (observedEvents.length > maxObservedEvents) {
      observedEvents.shift();
      droppedObservedEvents += 1;
    }
  });
  let timedOutScenario: string | undefined;
  try {
    for (const scenario of scenarios) {
      const startedAt = performance.now();
      const operation = scenario.kind ?? "tools.call";
      const common = {
        formatVersion: 1 as const,
        name: scenario.name,
        operation,
        ...(isToolScenario(scenario) ? { tool: scenario.tool } : {}),
        sideEffect: scenario.sideEffect ?? defaultSideEffect(operation),
      };
      if (timedOutScenario) {
        pushResult({
          ...common,
          status: "incomplete",
          durationMs: 0,
          error: truncateError(`Skipped after timed-out scenario: ${timedOutScenario}`, options),
        });
        continue;
      }
      const resolved = resolveScenarioVariables(scenario, options.variables);
      if (resolved.missing.length > 0) {
        pushResult({
          ...common,
          status: "incomplete",
          durationMs: 0,
          error: truncateError(
            `Missing scenario variables: ${resolved.missing.join(", ")}`,
            options,
          ),
        });
        continue;
      }
      if (scenario.status === "incomplete") {
        pushResult({
          ...common,
          status: "incomplete",
          durationMs: 0,
          error: truncateError(scenario.incompleteReason ?? "Scenario is incomplete", options),
        });
        continue;
      }
      const timeoutMs = scenario.timeoutMs ?? options.defaultTimeoutMs ?? 30_000;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        await Promise.race([
          executeScenario(client, resolved.scenario, {
            signal: controller.signal,
            timeout: timeoutMs,
          }, observedEvents, options),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new McpFnAssertionError(`Scenario timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          }),
        ]);
        pushResult({
          ...common,
          status: "passed",
          durationMs: performance.now() - startedAt,
        });
      } catch (error) {
        pushResult({
          ...common,
          status: "failed",
          durationMs: performance.now() - startedAt,
          error: truncateError(error instanceof Error ? error.message : String(error), options),
        });
        if (timedOut) timedOutScenario = scenario.name;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  } finally {
    const unattributed = droppedObservedEvents - attributedDroppedObservedEvents;
    const lastResult = results.at(-1);
    if (lastResult && unattributed > 0) {
      lastResult.droppedObservedEvents =
        (lastResult.droppedObservedEvents ?? 0) + unattributed;
    }
    unsubscribe();
  }
  return results;
}

export interface McpFnScenarioRunOptions {
  defaultTimeoutMs?: number;
  maxScenarios?: number;
  maxErrorBytes?: number;
  /** Observed client-event count cap. Defaults to 500. */
  maxObservedEvents?: number;
  variables?: Record<string, string | undefined>;
  auth?(scenario: McpFnAuthScenario, signal: AbortSignal): Promise<{
    outcome: "allowed" | "denied";
    code?: string;
  }>;
}

function resolveScenarioVariables(
  scenario: McpFnScenario,
  supplied: Record<string, string | undefined> | undefined,
): { scenario: McpFnScenario; missing: string[] } {
  const values = { ...process.env, ...supplied };
  const required = new Set(scenario.variables ?? []);
  const marker = /\$\{([A-Z][A-Z0-9_]*)\}/g;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      for (const match of value.matchAll(marker)) required.add(match[1]);
      return value.replace(marker, (original, name: string) => values[name] ?? original);
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, visit(entry)]),
      );
    }
    return value;
  };
  const resolved = visit(scenario) as McpFnScenario;
  return {
    scenario: resolved,
    missing: [...required]
      .filter((name) => values[name] === undefined)
      .sort(compareCodeUnits),
  };
}

export function createMcpFnScenarioReport(
  results: McpFnScenarioResult[],
  options: { manifestHash?: string; maxBytes?: number } = {},
): McpFnScenarioReport {
  const failed = results.filter((result) => result.status === "failed").length;
  const incomplete = results.filter((result) => result.status === "incomplete").length;
  const droppedObservedEvents = results.reduce(
    (total, result) => total + (result.droppedObservedEvents ?? 0),
    0,
  );
  const report: McpFnScenarioReport = {
    formatVersion: 1,
    kind: "mcpfn.scenario-report",
    status: incomplete === 0 && droppedObservedEvents === 0 ? "complete" : "incomplete",
    ...(options.manifestHash ? { manifestHash: options.manifestHash } : {}),
    total: results.length,
    passed: results.length - failed - incomplete,
    failed,
    incomplete,
    droppedResults: 0,
    droppedObservedEvents,
    ...(droppedObservedEvents > 0
      ? { incompleteReason: "Observed client events exceeded maxObservedEvents" }
      : {}),
    results: structuredClone(results),
  };
  const maxBytes = options.maxBytes ?? 1_048_576;
  if (!Number.isInteger(maxBytes) || maxBytes < 1_024) {
    throw new Error("maxBytes must be an integer of at least 1024");
  }
  if (serializedBytes(report) > maxBytes) {
    report.status = "incomplete";
    report.incompleteReason = "Report content exceeded maxBytes and was truncated";
  }
  while (serializedBytes(report) > maxBytes && report.results.length > 0) {
    report.results.pop();
    report.droppedResults += 1;
  }
  if (report.droppedResults > 0) {
    report.status = "incomplete";
  }
  if (serializedBytes(report) > maxBytes) {
    throw new Error("The minimum scenario report exceeds maxBytes");
  }
  return report;
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function executeScenario(
  client: McpFnTestClient<unknown>,
  scenario: McpFnScenario,
  requestOptions: { signal: AbortSignal; timeout: number },
  observedEvents: McpFnClientEvent[],
  runOptions: McpFnScenarioRunOptions,
): Promise<void> {
  const kind = scenario.kind ?? "tools.call";
  if (isInventoryScenario(scenario)) {
    await executeInventoryScenario(client, scenario, requestOptions);
    return;
  }
  switch (scenario.kind) {
    case undefined:
    case "tools.call":
      return executeToolScenario(client, scenario, requestOptions);
    case "initialize":
      return executeInitializeScenario(client, scenario);
    case "resources.read":
      return assertExpectedAsync(client.readResource(scenario.uri, requestOptions), scenario.expect);
    case "resources.subscribe":
      return client.subscribeResource(scenario.uri, requestOptions);
    case "resources.unsubscribe":
      return client.unsubscribeResource(scenario.uri, requestOptions);
    case "prompts.get":
      return assertExpectedAsync(
        client.getPrompt(scenario.prompt, scenario.arguments, requestOptions),
        scenario.expect,
      );
    case "tools.call:task":
      return assertExpectedAsync(
        client.createToolTask(scenario.tool, scenario.arguments, scenario.task, requestOptions),
        scenario.expect,
      );
    case "tasks.get":
      return assertExpectedAsync(client.getTask(scenario.taskId!, requestOptions), scenario.expect);
    case "tasks.result":
      return assertExpectedAsync(client.getTaskResult(scenario.taskId!, requestOptions), scenario.expect);
    case "tasks.cancel":
      return assertExpectedAsync(client.cancelTask(scenario.taskId!, requestOptions), scenario.expect);
    case "tasks.list":
      return assertExpectedAsync(client.listTasks(scenario.cursor, requestOptions), scenario.expect);
    case "events.expect":
      return executeEventScenario(scenario, observedEvents);
    case "auth.assert":
      return executeAuthScenario(scenario, requestOptions.signal, runOptions);
  }
  throw new McpFnAssertionError(`Unsupported scenario operation ${kind}`);
}

async function executeToolScenario(
  client: McpFnTestClient<unknown>,
  scenario: McpFnToolScenario,
  requestOptions: { signal: AbortSignal; timeout: number },
): Promise<void> {
  const result = await client.callTool(
    scenario.tool,
    scenario.arguments,
    requestOptions,
  );
  assertToolResult(result, scenario);
  await scenario.verify?.(result);
}

function assertToolResult(result: CallToolResult, scenario: McpFnToolScenario): void {
  if (result.isError && scenario.expect?.isError === undefined) {
    throw new McpFnAssertionError(
      "Tool returned isError=true without an explicit expect.isError=true assertion",
    );
  }
  if (
    scenario.expect?.isError !== undefined &&
    Boolean(result.isError) !== scenario.expect.isError
  ) {
    throw new McpFnAssertionError(
      `Expected isError=${scenario.expect.isError}, received ${Boolean(result.isError)}`,
    );
  }
  if (
    scenario.expect &&
    Object.hasOwn(scenario.expect, "structuredContent") &&
    stableJson(result.structuredContent) !== stableJson(scenario.expect.structuredContent)
  ) {
    throw new McpFnAssertionError(
      `Structured result mismatch\nexpected: ${stableJson(scenario.expect.structuredContent)}\nactual:   ${stableJson(result.structuredContent)}`,
    );
  }
  if (scenario.expect?.structuredTextParity) assertStructuredTextParity(result);
}

function executeInitializeScenario(
  client: McpFnTestClient<unknown>,
  scenario: McpFnInitializeScenario,
): void {
  const actual = client.client.getServerCapabilities() ?? {};
  if (scenario.expectCapabilities && stableJson(actual) !== stableJson(scenario.expectCapabilities)) {
    throw new McpFnAssertionError(
      `Capability mismatch\nexpected: ${stableJson(scenario.expectCapabilities)}\nactual:   ${stableJson(actual)}`,
    );
  }
}

async function executeInventoryScenario(
  client: McpFnTestClient<unknown>,
  scenario: McpFnInventoryScenario,
  requestOptions: { signal: AbortSignal; timeout: number },
): Promise<void> {
  const values = await listScenarioInventory(client, scenario.kind, requestOptions);
  if (!scenario.expectNames) return;
  const actual = values.map((value) => value.name).sort(compareCodeUnits);
  const expected = [...scenario.expectNames].sort(compareCodeUnits);
  if (stableJson(actual) !== stableJson(expected)) {
    throw new McpFnAssertionError(
      `Inventory mismatch\nexpected: ${stableJson(expected)}\nactual:   ${stableJson(actual)}`,
    );
  }
}

async function assertExpectedAsync(actual: Promise<unknown>, expected: unknown): Promise<void> {
  assertExpected(await actual, expected);
}

function executeEventScenario(
  scenario: McpFnEventScenario,
  observedEvents: McpFnClientEvent[],
): void {
  const matching = observedEvents.filter((event) => event.kind === scenario.event);
  if (matching.length < (scenario.minimum ?? 1)) {
    throw new McpFnAssertionError(
      `Expected at least ${scenario.minimum ?? 1} ${scenario.event} event(s), received ${matching.length}`,
    );
  }
  if (scenario.expectPayload !== undefined) {
    assertExpected(matching.at(-1)?.payload, scenario.expectPayload);
  }
}

async function executeAuthScenario(
  scenario: McpFnAuthScenario,
  signal: AbortSignal,
  runOptions: McpFnScenarioRunOptions,
): Promise<void> {
  if (!runOptions.auth) {
    throw new McpFnAssertionError("auth.assert requires a scenario auth adapter");
  }
  assertExpected(await runOptions.auth(scenario, signal), scenario.expect);
}

function truncateError(value: string, options: McpFnScenarioRunOptions): string {
  const redacted = String(redactOAuthValue(value));
  const maxBytes = options.maxErrorBytes ?? 4_096;
  const bytes = new TextEncoder().encode(redacted);
  if (bytes.byteLength <= maxBytes) return redacted;
  return `${new TextDecoder().decode(bytes.slice(0, Math.max(0, maxBytes - 16)))}...[TRUNCATED]`;
}

function defaultSideEffect(operation: string): McpFnScenarioSideEffect {
  if (operation === "tools.call" || operation === "tools.call:task") {
    return "non-idempotent";
  }
  if (operation === "tasks.cancel") return "idempotent";
  return "none";
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertExpected(actual: unknown, expected: unknown): void {
  if (expected !== undefined && stableJson(actual) !== stableJson(expected)) {
    throw new McpFnAssertionError(
      `Scenario result mismatch\nexpected: ${stableJson(expected)}\nactual:   ${stableJson(actual)}`,
    );
  }
}

function isToolScenario(scenario: McpFnScenario): scenario is McpFnToolScenario {
  return "tool" in scenario;
}

function isInventoryScenario(scenario: McpFnScenario): scenario is McpFnInventoryScenario {
  return ["tools.list", "resources.list", "resources.templates.list", "prompts.list"]
    .includes(scenario.kind ?? "");
}

function requiredScenarioField(kind: string): string | undefined {
  switch (kind) {
    case "tools.call":
    case "tools.call:task":
      return "tool";
    case "resources.read":
    case "resources.subscribe":
    case "resources.unsubscribe":
      return "uri";
    case "prompts.get":
      return "prompt";
    case "tasks.get":
    case "tasks.result":
    case "tasks.cancel":
      return "taskId";
    case "events.expect":
      return "event";
    default:
      return undefined;
  }
}

async function listScenarioInventory(
  client: McpFnTestClient<unknown>,
  kind: McpFnInventoryScenario["kind"],
  requestOptions: { signal: AbortSignal; timeout: number },
) {
  switch (kind) {
    case "tools.list":
      return client.listTools(requestOptions);
    case "resources.list":
      return client.listResources(requestOptions);
    case "resources.templates.list":
      return client.listResourceTemplates(requestOptions);
    case "prompts.list":
      return client.listPrompts(requestOptions);
  }
}
