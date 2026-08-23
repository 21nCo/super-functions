import type { DatafnSchema } from "@datafn/core";
import type { DatafnExecutor } from "@datafn/server";
import type { McpFnRegistry } from "@mcpfn/core";

export interface DatafnReadToolOptions {
  name?: string;
  description?: string;
}

export interface DatafnListToolOptions extends DatafnReadToolOptions {
  filterFields?: string[];
  sortFields?: string[];
  defaultLimit?: number;
  maxLimit?: number;
}

export interface DatafnWriteToolOptions {
  name?: string;
  description?: string;
  fields: string[];
}

export interface DatafnResourceExposure {
  /** Fields returned by list/get. Explicit projection prevents schema expansion from leaking fields. */
  fields: string[];
  /** List and get default to enabled for an explicitly listed resource. */
  list?: boolean | DatafnListToolOptions;
  get?: boolean | DatafnReadToolOptions;
  /** Mutations are always disabled unless configured with an explicit field allowlist. */
  create?: false | DatafnWriteToolOptions;
  update?: false | DatafnWriteToolOptions;
  delete?: false | Omit<DatafnWriteToolOptions, "fields">;
}

export interface CreateDatafnMcpRegistryOptions<TMcpContext, TDatafnContext> {
  /** @deprecated The executor's normalized schema is authoritative. */
  schema: DatafnSchema;
  executor: DatafnExecutor<TDatafnContext>;
  expose: Record<string, DatafnResourceExposure>;
  /** Resolve trusted DataFn context from server-derived MCP context. */
  context: (context: TMcpContext) => TDatafnContext | Promise<TDatafnContext>;
  /** Stable client ID used with DataFn idempotency records. */
  clientId: string | ((context: TMcpContext) => string | Promise<string>);
  registry?: McpFnRegistry<TMcpContext>;
  toolPrefix?: string;
}
