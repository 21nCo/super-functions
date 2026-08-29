import type { McpFnObjectSchema, McpFnToolDefinition } from "@mcpfn/core";
import { AdminError } from "./errors.js";
import type { AdminDispatcher } from "./dispatcher.js";
import type { AdminCapabilityRegistry, AdminRegistryOperation } from "./registry.js";
import { adminOperationMinimumScope } from "./scope.js";
import type { AdminOperationContext, AdminResult } from "./types.js";

export interface AdminMcpProjectionOptions {
  registry: AdminCapabilityRegistry;
  dispatcher: AdminDispatcher;
}

export interface McpFnCompatibleRegistry<TContext> {
  register(definition: McpFnToolDefinition<TContext>): unknown;
}

function isMcpEnabled(value: unknown): boolean {
  return value !== false && !(value && typeof value === "object" && "enabled" in value && (value as { enabled?: boolean }).enabled === false);
}

function structuredResult(result: AdminResult): { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean } {
  if (result.ok === false) {
    return { content: [{ type: "text", text: JSON.stringify(result) }], isError: true };
  }
  const structuredContent = result as unknown as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
}

function mcpOutputSchema(entry: AdminRegistryOperation): McpFnObjectSchema | undefined {
  const output = entry.operation.outputSchema;
  if (!output) return undefined;
  // Admin manifests are validated against the supported JSON Schema subset
  // before registry construction. McpFn represents the same runtime shape
  // with a broad index-signature type, so make that projection boundary
  // explicit instead of weakening either package's public schema contract.
  return {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      data: output,
      page: {
        type: "object",
        properties: {
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" },
        },
        additionalProperties: false,
      },
      auditId: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
      requestId: { type: "string" },
      correlationId: { type: "string" },
      meta: { type: "object", additionalProperties: true },
    },
    required: ["ok", "data"],
    additionalProperties: false,
  } as unknown as McpFnObjectSchema;
}

function mcpInputSchema(entry: AdminRegistryOperation): McpFnObjectSchema {
  const input = entry.operation.inputSchema;
  if (!input || input.type !== "object") throw new AdminError("invalid_argument", `MCP operation ${entry.operation.id} requires an object input schema.`);
  if (entry.operation.safety.classification === "read") return input as McpFnObjectSchema;
  if (input.properties?._admin) throw new AdminError("conflict", `Operation ${entry.operation.id} uses the reserved MCP _admin input field.`);
  const required: string[] = [];
  const properties: Record<string, unknown> = {};
  if (entry.operation.safety.idempotent) {
    properties.idempotencyKey = { type: "string", minLength: 1, description: "Unique key for exactly-once administration execution." };
    required.push("idempotencyKey");
  }
  if (entry.operation.safety.requiresConfirmation) {
    properties.confirmationToken = { type: "string", minLength: 1, description: "Explicit confirmation token issued for this destructive operation." };
    required.push("confirmationToken");
  }
  return {
    ...input,
    properties: {
      ...(input.properties ?? {}),
      _admin: {
        type: "object",
        description: "Reserved Super Console mutation controls; removed before domain validation.",
        properties,
        required,
        additionalProperties: false,
      },
    },
    required: [...new Set([...(input.required ?? []), ...(required.length ? ["_admin"] : [])])],
  } as McpFnObjectSchema;
}

export function projectAdminMcpTools(
  options: AdminMcpProjectionOptions,
): McpFnToolDefinition<AdminOperationContext>[] {
  return options.registry.operations.filter((entry) => isMcpEnabled(entry.operation.mcp)).map((entry) => {
    const input = mcpInputSchema(entry);
    const output = mcpOutputSchema(entry);
    const configured = typeof entry.operation.mcp === "object" ? entry.operation.mcp : undefined;
    const readOnly = entry.operation.safety.classification === "read";
    return {
      name: entry.mcpToolName,
      title: entry.operation.title,
      description: configured?.description ?? `${entry.operation.description} Requires ${entry.operation.permission}; safety=${entry.operation.safety.classification}${entry.operation.safety.requiresConfirmation ? "; explicit confirmation required" : ""}.`,
      inputSchema: input,
      ...(output ? { outputSchema: output } : {}),
      annotations: {
        readOnlyHint: configured?.readOnlyHint ?? readOnly,
        destructiveHint: configured?.destructiveHint ?? entry.operation.safety.classification === "destructive",
        idempotentHint: configured?.idempotentHint ?? Boolean(entry.operation.safety.idempotent),
        openWorldHint: false,
      },
      metadata: {
        "mcpfn/superconsole": {
          moduleId: entry.moduleId,
          operationId: entry.operation.id,
          permission: entry.operation.permission,
          minimumScope: adminOperationMinimumScope(entry.manifest, entry.operation),
          safety: entry.operation.safety,
          capabilityVersion: entry.manifest.version,
          ...(entry.operation.pagination ? { pagination: entry.operation.pagination } : {}),
          ...(entry.operation.target ? { target: entry.operation.target } : {}),
          ...(entry.operation.redaction ? { redaction: {
            ...(entry.operation.redaction.inputFields ? { inputFields: entry.operation.redaction.inputFields } : {}),
            ...(entry.operation.redaction.outputFields ? { outputFields: entry.operation.redaction.outputFields } : {}),
            ...(entry.operation.redaction.allowOutputPaths ? { oneTimeOutputPaths: entry.operation.redaction.allowOutputPaths } : {}),
          } } : {}),
        },
      },
      handler: async (args, context) => {
        const { _admin, ...domainInput } = args;
        const controls = _admin && typeof _admin === "object" && !Array.isArray(_admin)
          ? _admin as { idempotencyKey?: unknown; confirmationToken?: unknown }
          : {};
        return structuredResult(await options.dispatcher.dispatch({
          operationId: entry.operation.id,
          input: domainInput,
          context: {
            ...context,
            source: "mcp",
            idempotencyKey: typeof controls.idempotencyKey === "string" ? controls.idempotencyKey : undefined,
            confirmationToken: typeof controls.confirmationToken === "string" ? controls.confirmationToken : undefined,
          },
        }));
      },
    };
  });
}

export function registerAdminMcpTools(
  target: McpFnCompatibleRegistry<AdminOperationContext>,
  options: AdminMcpProjectionOptions,
): McpFnToolDefinition<AdminOperationContext>[] {
  const tools = projectAdminMcpTools(options);
  tools.forEach((tool) => target.register(tool));
  return tools;
}
