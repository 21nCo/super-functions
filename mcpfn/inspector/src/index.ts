import type {
  CallToolResult,
  CreateTaskResult,
  GetPromptResult,
  Implementation,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
  Task,
  ListTasksResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  McpFnClient,
  type McpFnClientOptions,
  type McpFnClientEvent,
  type McpFnDiagnosticEvent,
  type McpFnTargetDescriptor,
} from "@mcpfn/client";
import {
  createMcpFnScenario,
  type McpFnScenario,
} from "@mcpfn/testing";

const SCENARIO_REDACTION_LIMITS = {
  maxDepth: 8,
  maxArrayEntries: 100,
  maxObjectEntries: 100,
  maxStringLength: 2_048,
} as const;
const SCENARIO_SECRET_MARKER = "${MCPFN_SECRET}";
const SCENARIO_SECRET_MARKERS = [
  SCENARIO_SECRET_MARKER,
  "${SECRET}",
  "${CREDENTIAL}",
  ...Array.from({ length: 26 }, (_, index) => `\${${String.fromCodePoint(65 + index)}}`),
];

export interface McpFnInspectorSnapshot {
  formatVersion: 2;
  kind: "mcpfn.inspector-snapshot";
  target: McpFnTargetDescriptor;
  clientState: string;
  server?: Implementation;
  capabilities?: ServerCapabilities;
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  prompts: Prompt[];
  timeline: McpFnInspectorTimelineEvent[];
  droppedEvents: number;
  timelineComplete: boolean;
  droppedInventoryEntries: McpFnInspectorDroppedInventoryEntries;
  inventoryComplete: boolean;
}

export interface McpFnInspectorDroppedInventoryEntries {
  tools: number;
  resources: number;
  resourceTemplates: number;
  prompts: number;
}

export interface McpFnInspectorTimelineEvent {
  formatVersion: 1;
  source: "diagnostic" | "client";
  kind: string;
  at: string;
  event: McpFnDiagnosticEvent | McpFnClientEvent | Record<string, unknown>;
}

export interface McpFnInspectorLimits {
  /** Defaults to 500 events. */
  maxEvents?: number;
  /** Defaults to 512 KiB across the retained timeline. */
  maxTimelineBytes?: number;
  /** Defaults to 500 retained entries for each inventory surface. */
  maxInventoryEntries?: number;
}

export type McpFnInspectorOperation =
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

export type McpFnInspectorOperationResult =
  | CallToolResult
  | CreateTaskResult
  | ReadResourceResult
  | GetPromptResult
  | Task
  | ListTasksResult
  | void;

export type McpFnExportedScenario = McpFnScenario;

/** Headless inspector; graphical shells and the CLI consume this same engine. */
export class McpFnInspector {
  private readonly events: McpFnInspectorTimelineEvent[] = [];
  private readonly unsubscribes: Array<() => void>;
  private readonly maxEvents: number;
  private readonly maxTimelineBytes: number;
  private readonly maxInventoryEntries: number;
  private readonly initialRedactionOmissions: number;
  private observedRedactionOmissions = 0;
  private timelineBytes = 0;
  private droppedEvents = 0;

  constructor(readonly client: McpFnClient, limits: McpFnInspectorLimits = {}) {
    this.maxEvents = validateLimit(limits.maxEvents ?? 500, "maxEvents");
    this.maxTimelineBytes = validateLimit(
      limits.maxTimelineBytes ?? 524_288,
      "maxTimelineBytes",
    );
    this.maxInventoryEntries = validateLimit(
      limits.maxInventoryEntries ?? 500,
      "maxInventoryEntries",
    );
    const omissions = client.getRedactionOmissionCounts();
    this.initialRedactionOmissions = omissions.clientEvents + omissions.diagnostics;
    this.unsubscribes = [
      client.onDiagnostic((event) => this.record("diagnostic", event.phase, event.at, event)),
      client.onEvent((event) => this.record("client", event.kind, event.at, event)),
    ];
  }

  static create(
    options: McpFnClientOptions & { inspector?: McpFnInspectorLimits },
  ): McpFnInspector {
    const { inspector, ...clientOptions } = options;
    return new McpFnInspector(new McpFnClient(clientOptions), inspector);
  }

  async connect(): Promise<this> {
    await this.client.connect();
    return this;
  }

  async snapshot(): Promise<McpFnInspectorSnapshot> {
    const capabilities = this.client.getServerCapabilities();
    const emptyInventory = { items: [], droppedItems: 0, complete: true };
    const [tools, resources, resourceTemplates, prompts] = await Promise.all([
      capabilities?.tools
        ? this.client.tools.listBounded(this.maxInventoryEntries)
        : Promise.resolve(emptyInventory),
      capabilities?.resources
        ? this.client.resources.listBounded(this.maxInventoryEntries)
        : Promise.resolve(emptyInventory),
      capabilities?.resources
        ? this.client.resources.listTemplatesBounded(this.maxInventoryEntries)
        : Promise.resolve(emptyInventory),
      capabilities?.prompts
        ? this.client.prompts.listBounded(this.maxInventoryEntries)
        : Promise.resolve(emptyInventory),
    ]);
    const droppedInventoryEntries = {
      tools: this.client.preserveArtifactStructure(tools.droppedItems),
      resources: this.client.preserveArtifactStructure(resources.droppedItems),
      resourceTemplates: this.client.preserveArtifactStructure(resourceTemplates.droppedItems),
      prompts: this.client.preserveArtifactStructure(prompts.droppedItems),
    };
    const inventoryComplete = Object.values(droppedInventoryEntries)
      .every((count) => count === 0);
    const omissions = this.client.getRedactionOmissionCounts();
    const unobservedRedactionOmissions = Math.max(
      0,
      omissions.clientEvents + omissions.diagnostics -
        this.initialRedactionOmissions - this.observedRedactionOmissions,
    );
    const droppedEvents = this.droppedEvents + unobservedRedactionOmissions;
    const redaction = {
      maxArrayEntries: Math.max(this.maxEvents, this.maxInventoryEntries, 1),
      preserveKeys: false,
    } as const;
    const { kind, ...descriptor } = this.client.getTargetDescriptor();
    const server = this.client.getServerVersion();
    const snapshotKind = this.client.preserveArtifactStructure("mcpfn.inspector-snapshot");
    const targetKind = this.client.preserveArtifactStructure(kind);
    const clientState = this.client.preserveArtifactStructure(this.client.state);
    const timeline = structuredClone(this.events);
    const snapshotKeys = [
      "formatVersion", "kind", "target", "clientState", "server", "capabilities",
      "tools", "resources", "resourceTemplates", "prompts", "timeline",
      "droppedEvents", "timelineComplete", "droppedInventoryEntries", "inventoryComplete",
    ] as const;
    for (const key of snapshotKeys) this.client.preserveArtifactStructure(key);
    if (timeline.length > 0) {
      for (const key of ["source", "at", "event"] as const) {
        this.client.preserveArtifactStructure(key);
      }
      this.client.preserveArtifactStructure(1);
    }
    // Custom hooks receive payloads only; reconstruct authored discriminators.
    return {
      formatVersion: this.client.preserveArtifactStructure(2),
      kind: snapshotKind,
      target: { ...this.client.redact(descriptor, redaction), kind: targetKind },
      clientState,
      server: server === undefined ? undefined : this.client.redact(server, redaction),
      capabilities: capabilities === undefined ? undefined : this.client.redact(capabilities, redaction),
      tools: this.client.redact(tools.items, redaction),
      resources: this.client.redact(resources.items, redaction),
      resourceTemplates: this.client.redact(resourceTemplates.items, redaction),
      prompts: this.client.redact(prompts.items, redaction),
      // Stored events already passed through the client hook; never reapply it.
      timeline,
      droppedEvents: this.client.preserveArtifactStructure(droppedEvents),
      timelineComplete: this.client.preserveArtifactStructure(droppedEvents === 0),
      droppedInventoryEntries,
      inventoryComplete: this.client.preserveArtifactStructure(inventoryComplete),
    };
  }

  async run(operation: McpFnInspectorOperation): Promise<McpFnInspectorOperationResult> {
    if (operation.kind === "tools.call") {
      return this.client.tools.call(operation.name, operation.arguments);
    }
    if (operation.kind === "tools.call:task") {
      return this.client.tools.createTask(operation.name, operation.arguments, operation.task);
    }
    if (operation.kind === "resources.read") {
      return this.client.resources.read(operation.uri);
    }
    if (operation.kind === "resources.subscribe") {
      return this.client.resources.subscribe(operation.uri);
    }
    if (operation.kind === "resources.unsubscribe") {
      return this.client.resources.unsubscribe(operation.uri);
    }
    if (operation.kind === "prompts.get") {
      return this.client.prompts.get(operation.name, operation.arguments);
    }
    if (operation.kind === "tasks.get") return this.client.tasks.get(operation.taskId);
    if (operation.kind === "tasks.result") return this.client.tasks.result(operation.taskId);
    if (operation.kind === "tasks.cancel") return this.client.tasks.cancel(operation.taskId);
    return this.client.tasks.list(operation.cursor);
  }

  exportScenario(
    name: string,
    operation: McpFnInspectorOperation,
    result: McpFnInspectorOperationResult,
  ): McpFnExportedScenario {
    const scenario = createMcpFnScenario(name, operation, result);
    // Top-level scenario keys are authored schema, not payload. If a credential
    // collides with one of them, no replayable typed artifact can be emitted.
    for (const key of Object.keys(scenario)) {
      this.client.preserveArtifactStructure(key);
    }
    const { formatVersion, kind, sideEffect, ...payload } = scenario;
    if (formatVersion === undefined || kind === undefined || sideEffect === undefined) {
      throw new Error("Inspector scenario export requires normalized structure");
    }
    const safeKind = this.client.preserveArtifactStructure(kind);
    const safeSideEffect = this.client.preserveArtifactStructure(sideEffect);
    const safeFormatVersion = this.client.preserveArtifactStructure(formatVersion);
    const secretMarker = selectScenarioSecretMarker(this.client);
    let redacted: Record<string, unknown>;
    try {
      redacted = {
        ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, this.client.redact(value, {
          ...SCENARIO_REDACTION_LIMITS,
          // These are user payloads, even when their keys resemble an envelope.
          preserveKeys: false,
          redactionMarker: secretMarker ?? "",
        })])),
        formatVersion: safeFormatVersion, kind: safeKind, sideEffect: safeSideEffect,
      };
    } catch {
      this.client.preserveArtifactStructure("status");
      this.client.preserveArtifactStructure("incompleteReason");
      return {
        formatVersion: safeFormatVersion,
        kind: safeKind,
        sideEffect: safeSideEffect,
        name: "",
        status: this.client.preserveArtifactStructure("incomplete"),
        incompleteReason: this.client.redact(
          "Inspector export omitted payload because credential redaction failed",
          { preserveKeys: false, redactionMarker: "" },
        ),
      } as McpFnExportedScenario;
    }
    const replaced = redacted as unknown as McpFnExportedScenario;
    let incompleteReason: string | undefined;
    if (secretMarker === undefined) {
      incompleteReason = "Inspector export could not select a replayable redaction placeholder";
    } else if (exceedsRedactionBounds(scenario, redacted, SCENARIO_REDACTION_LIMITS)) {
      incompleteReason = "Inspector export exceeded redaction bounds and was truncated";
    }
    if (incompleteReason) {
      this.client.preserveArtifactStructure("status");
      this.client.preserveArtifactStructure("incompleteReason");
    }
    const exported = incompleteReason
      ? {
        ...replaced,
        status: this.client.preserveArtifactStructure("incomplete"),
        incompleteReason: this.client.redact(incompleteReason, {
          preserveKeys: false,
          redactionMarker: "",
        }),
      }
      : replaced;
    const variables = collectVariables(exported);
    if (!variables.length) return exported;
    this.client.preserveArtifactStructure("variables");
    return { ...exported, variables };
  }

  timeline(): McpFnInspectorTimelineEvent[] {
    return [...this.events];
  }

  private record(
    source: McpFnInspectorTimelineEvent["source"],
    kind: string,
    at: string,
    raw: McpFnDiagnosticEvent | McpFnClientEvent,
  ): void {
    if (this.client.isRedactionOmission(raw)) {
      this.observedRedactionOmissions += 1;
      this.droppedEvents += 1;
    }
    let safeSource: McpFnInspectorTimelineEvent["source"];
    let safeKind: string;
    let safeFormatVersion: 1;
    try {
      for (const key of ["formatVersion", "source", "kind", "at", "event"] as const) {
        this.client.preserveArtifactStructure(key);
      }
      safeFormatVersion = this.client.preserveArtifactStructure(1);
      safeSource = this.client.preserveArtifactStructure(source);
      safeKind = this.client.preserveArtifactStructure(kind);
    } catch {
      this.droppedEvents += 1;
      return;
    }
    let event: McpFnInspectorTimelineEvent = {
      formatVersion: safeFormatVersion,
      source: safeSource,
      kind: safeKind,
      at,
      event: raw,
    };
    let bytes: number;
    try { event = structuredClone(event); bytes = encodedBytes(event); }
    catch { this.droppedEvents += 1; return; }
    if (bytes > this.maxTimelineBytes) {
      this.droppedEvents += 1;
      let truncatedKey: "truncated";
      let truncatedValue: true;
      try {
        truncatedKey = this.client.preserveArtifactStructure("truncated");
        truncatedValue = this.client.preserveArtifactStructure(true);
      } catch {
        return;
      }
      event = {
        formatVersion: safeFormatVersion,
        source: safeSource,
        kind: safeKind,
        at,
        event: { [truncatedKey]: truncatedValue },
      };
      bytes = encodedBytes(event);
      if (bytes > this.maxTimelineBytes) return;
    }
    this.events.push(event);
    this.timelineBytes += bytes;
    while (
      this.events.length > this.maxEvents ||
      this.timelineBytes > this.maxTimelineBytes
    ) {
      const removed = this.events.shift();
      if (removed) this.timelineBytes -= encodedBytes(removed);
      this.droppedEvents += 1;
    }
  }

  async close(): Promise<void> {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    await this.client.close();
  }
}

function selectScenarioSecretMarker(client: McpFnClient): string | undefined {
  return SCENARIO_SECRET_MARKERS.find((marker) => {
    try {
      return client.redact(marker, {
        ...SCENARIO_REDACTION_LIMITS,
        preserveKeys: false,
        redactionMarker: "",
      }) === marker;
    } catch {
      return false;
    }
  });
}

function validateLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function exceedsRedactionBounds(
  value: unknown,
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth = 0,
  ancestors = new WeakSet<object>(),
): boolean {
  if (
    typeof redacted === "string" &&
    /^\$\{[A-Z][A-Z0-9_]*\}$/.test(redacted)
  ) return false;
  if (depth > limits.maxDepth) return true;
  if (typeof value === "string") return isTruncatedString(redacted, limits.maxStringLength);
  if (!value || typeof value !== "object" || value instanceof Date) return false;
  if (value instanceof URL) return isTruncatedString(redacted, limits.maxStringLength);
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    return exceedsObjectRedactionBounds(
      value,
      redacted,
      limits,
      depth,
      ancestors,
    );
  } finally {
    ancestors.delete(value);
  }
}

function exceedsObjectRedactionBounds(
  value: object,
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth: number,
  ancestors: WeakSet<object>,
): boolean {
  if (Array.isArray(value)) {
    return exceedsArrayRedactionBounds(value, redacted, limits, depth, ancestors);
  }
  if (value instanceof Map) {
    return exceedsMapRedactionBounds(value, redacted, limits, depth, ancestors);
  }
  if (value instanceof Set) {
    return exceedsSetRedactionBounds(value, redacted, limits, depth, ancestors);
  }
  return exceedsRecordRedactionBounds(value, redacted, limits, depth, ancestors);
}

function exceedsArrayRedactionBounds(
  value: unknown[],
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth: number,
  ancestors: WeakSet<object>,
): boolean {
  if (value.length > limits.maxArrayEntries) return true;
  const redactedArray = Array.isArray(redacted) ? redacted : [];
  return value.some((entry, index) =>
    exceedsRedactionBounds(entry, redactedArray[index], limits, depth + 1, ancestors)
  );
}

function exceedsMapRedactionBounds(
  value: Map<unknown, unknown>,
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth: number,
  ancestors: WeakSet<object>,
): boolean {
  if (value.size > limits.maxArrayEntries) return true;
  const redactedEntries = readRedactedCollection(redacted, "entries");
  let index = 0;
  for (const [key, entry] of value) {
    const pair = Array.isArray(redactedEntries[index])
      ? redactedEntries[index] as unknown[]
      : [];
    if (
      exceedsRedactionBounds(key, pair[0], limits, depth + 1, ancestors) ||
      exceedsRedactionBounds(entry, pair[1], limits, depth + 1, ancestors)
    ) return true;
    index += 1;
  }
  return false;
}

function exceedsSetRedactionBounds(
  value: Set<unknown>,
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth: number,
  ancestors: WeakSet<object>,
): boolean {
  if (value.size > limits.maxArrayEntries) return true;
  const redactedValues = readRedactedCollection(redacted, "values");
  let index = 0;
  for (const entry of value) {
    if (
      exceedsRedactionBounds(
        entry,
        redactedValues[index],
        limits,
        depth + 1,
        ancestors,
      )
    ) return true;
    index += 1;
  }
  return false;
}

function exceedsRecordRedactionBounds(
  value: object,
  redacted: unknown,
  limits: typeof SCENARIO_REDACTION_LIMITS,
  depth: number,
  ancestors: WeakSet<object>,
): boolean {
  const record = value as Record<string, unknown>;
  const redactedRecord = redacted && typeof redacted === "object"
    ? redacted as Record<string, unknown>
    : {};
  if (value instanceof Error && errorWasTruncated(record, redactedRecord, limits)) {
    return true;
  }
  const keys = Object.keys(record);
  if (keys.length > limits.maxObjectEntries) return true;
  return keys.some((key) =>
    exceedsRedactionBounds(
      record[key],
      redactedRecord[key],
      limits,
      depth + 1,
      ancestors,
    )
  );
}

function errorWasTruncated(
  value: Record<string, unknown>,
  redacted: Record<string, unknown>,
  limits: typeof SCENARIO_REDACTION_LIMITS,
): boolean {
  return ["name", "message", "stack"].some((key) =>
    typeof value[key] === "string" &&
    isTruncatedString(redacted[key], limits.maxStringLength)
  );
}

function isTruncatedString(value: unknown, maxLength: number): boolean {
  return typeof value === "string" && value.length === maxLength + 1 && value.endsWith("…");
}

function readRedactedCollection(
  value: unknown,
  key: "entries" | "values",
): unknown[] {
  if (!value || typeof value !== "object") return [];
  const collection = (value as Record<string, unknown>)[key];
  return Array.isArray(collection) ? collection : [];
}

function collectVariables(value: unknown): string[] {
  const variables = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      for (const match of entry.matchAll(
        /\$\{([A-Z][A-Z0-9_]*)\}|%24%7[Bb]([A-Z][A-Z0-9_]*)%7[Dd]/g,
      )) {
        variables.add(match[1] ?? match[2]);
      }
    } else if (Array.isArray(entry)) {
      entry.forEach(visit);
    } else if (entry && typeof entry === "object") {
      for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
        visit(key);
        visit(value);
      }
    }
  };
  visit(value);
  return [...variables].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
