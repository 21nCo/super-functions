import { LangFnError, ToolExecutionError, ToolSchemaError } from "../core/errors.js";
import { ToolPolicy } from "./policy.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export interface ToolSchema<TArgs = unknown> {
  parse(data: unknown): TArgs;
  jsonSchema?: Record<string, unknown>;
}

export interface ToolContext {
  metadata: Record<string, unknown>;
  policy: ToolPolicy;
}

export interface ToolConfig<TArgs, TResult> {
  name: string;
  description: string;
  schema: ToolSchema<TArgs>;
  annotations?: ToolAnnotations;
  execute: (args: TArgs, context: ToolContext) => Promise<TResult> | TResult;
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class Tool<TArgs = unknown, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: ToolSchema<TArgs>;
  readonly annotations?: ToolAnnotations;
  private readonly executeHandler: ToolConfig<TArgs, TResult>["execute"];

  constructor(config: ToolConfig<TArgs, TResult>) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.annotations = config.annotations;
    this.executeHandler = config.execute;
  }

  json_schema(): ProviderToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.schema.jsonSchema ?? { type: "object", properties: {} }
    };
  }

  async run(args: unknown, context: ToolContext = { metadata: {}, policy: new ToolPolicy() }): Promise<TResult> {
    let parsed: TArgs;
    try {
      parsed = this.schema.parse(args);
    } catch (error) {
      const metadata =
        typeof error === "object" && error && "issues" in error
          ? { tool: this.name, errors: (error as any).issues }
          : { tool: this.name, errors: [{ message: error instanceof Error ? error.message : String(error) }] };
      throw new ToolSchemaError("Tool args do not match schema", { metadata, cause: error });
    }

    try {
      const result = await this.executeHandler(parsed, context);
      return context.policy.redact(context.policy.sanitize(result)) as TResult;
    } catch (error) {
      if (error instanceof LangFnError) {
        throw error;
      }
      throw new ToolExecutionError(`Tool '${this.name}' failed: ${error instanceof Error ? error.message : String(error)}`, {
        metadata: { tool: this.name },
        cause: error
      });
    }
  }
}
