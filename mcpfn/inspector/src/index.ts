import type {
  CallToolResult,
  GetPromptResult,
  Implementation,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  McpFnClient,
  type McpFnClientOptions,
  type McpFnDiagnosticEvent,
  type McpFnTargetDescriptor,
} from "@mcpfn/client";
import { redactOAuthValue } from "@superfunctions/oauth-core";

export interface McpFnInspectorSnapshot {
  target: McpFnTargetDescriptor;
  state: string;
  server?: Implementation;
  capabilities?: ServerCapabilities;
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  prompts: Prompt[];
  timeline: McpFnDiagnosticEvent[];
}

export type McpFnInspectorOperation =
  | { kind: "tools.call"; name: string; arguments?: Record<string, unknown> }
  | { kind: "resources.read"; uri: string }
  | { kind: "prompts.get"; name: string; arguments?: Record<string, string> };

export type McpFnInspectorOperationResult =
  | CallToolResult
  | ReadResourceResult
  | GetPromptResult;

export interface McpFnExportedScenario {
  name: string;
  operation: McpFnInspectorOperation;
  expect: unknown;
}

/** Headless inspector; graphical shells and the CLI consume this same engine. */
export class McpFnInspector {
  private readonly events: McpFnDiagnosticEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(readonly client: McpFnClient) {
    this.unsubscribe = client.onDiagnostic((event) => {
      this.events.push(redactOAuthValue(event) as McpFnDiagnosticEvent);
    });
  }

  static create(options: McpFnClientOptions): McpFnInspector {
    return new McpFnInspector(new McpFnClient(options));
  }

  async connect(): Promise<this> {
    await this.client.connect();
    return this;
  }

  async snapshot(): Promise<McpFnInspectorSnapshot> {
    const capabilities = this.client.getServerCapabilities();
    const [tools, resources, resourceTemplates, prompts] = await Promise.all([
      capabilities?.tools ? this.client.tools.listAll() : Promise.resolve([]),
      capabilities?.resources ? this.client.resources.listAll() : Promise.resolve([]),
      capabilities?.resources ? this.client.resources.listTemplatesAll() : Promise.resolve([]),
      capabilities?.prompts ? this.client.prompts.listAll() : Promise.resolve([]),
    ]);
    return redactOAuthValue({
      target: this.client.getTargetDescriptor(),
      state: this.client.state,
      server: this.client.getServerVersion(),
      capabilities,
      tools,
      resources,
      resourceTemplates,
      prompts,
      timeline: [...this.events],
    }) as McpFnInspectorSnapshot;
  }

  async run(operation: McpFnInspectorOperation): Promise<McpFnInspectorOperationResult> {
    if (operation.kind === "tools.call") {
      return this.client.tools.call(operation.name, operation.arguments);
    }
    if (operation.kind === "resources.read") {
      return this.client.resources.read(operation.uri);
    }
    return this.client.prompts.get(operation.name, operation.arguments);
  }

  exportScenario(
    name: string,
    operation: McpFnInspectorOperation,
    result: McpFnInspectorOperationResult,
  ): McpFnExportedScenario {
    const redacted = redactOAuthValue({ name, operation, expect: result });
    return replaceSecretMarkers(redacted) as McpFnExportedScenario;
  }

  timeline(): McpFnDiagnosticEvent[] {
    return [...this.events];
  }

  async close(): Promise<void> {
    this.unsubscribe();
    await this.client.close();
  }
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
