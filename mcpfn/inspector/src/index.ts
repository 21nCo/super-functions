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
import { redactOAuthValue } from "@superfunctions/oauth-core";

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
      tools: tools.droppedItems,
      resources: resources.droppedItems,
      resourceTemplates: resourceTemplates.droppedItems,
      prompts: prompts.droppedItems,
    };
    const inventoryComplete = Object.values(droppedInventoryEntries)
      .every((count) => count === 0);
    return redactOAuthValue({
      formatVersion: 2,
      kind: "mcpfn.inspector-snapshot",
      target: this.client.getTargetDescriptor(),
      clientState: this.client.state,
      server: this.client.getServerVersion(),
      capabilities,
      tools: tools.items,
      resources: resources.items,
      resourceTemplates: resourceTemplates.items,
      prompts: prompts.items,
      timeline: [...this.events],
      droppedEvents: this.droppedEvents,
      timelineComplete: this.droppedEvents === 0,
      droppedInventoryEntries,
      inventoryComplete,
    }, {
      maxArrayEntries: Math.max(
        this.maxEvents,
        this.maxInventoryEntries,
        1,
      ),
    }) as McpFnInspectorSnapshot;
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
    const redacted = redactOAuthValue(scenario);
    const exported = replaceSecretMarkers(redacted) as McpFnExportedScenario;
    const variables = collectVariables(exported);
    return variables.length ? { ...exported, variables } : exported;
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
    let event: McpFnInspectorTimelineEvent = redactOAuthValue({
      formatVersion: 1,
      source,
      kind,
      at,
      event: raw,
    }) as McpFnInspectorTimelineEvent;
    let bytes = encodedBytes(event);
    if (bytes > this.maxTimelineBytes) {
      event = {
        formatVersion: 1,
        source,
        kind,
        at,
        event: { truncated: true },
      };
      bytes = encodedBytes(event);
      this.droppedEvents += 1;
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

function validateLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function replaceSecretMarkers(value: unknown): unknown {
  if (value === "[REDACTED]") return "${MCPFN_SECRET}";
  if (Array.isArray(value)) return value.map(replaceSecretMarkers);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, replaceSecretMarkers(entry)]),
    );
  }
  return value;
}

function collectVariables(value: unknown): string[] {
  const variables = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      for (const match of entry.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
        variables.add(match[1]);
      }
    } else if (Array.isArray(entry)) {
      entry.forEach(visit);
    } else if (entry && typeof entry === "object") {
      Object.values(entry as Record<string, unknown>).forEach(visit);
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
