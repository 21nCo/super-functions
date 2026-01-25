/**
 * DataFn Schema Types
 */

export type DatafnSchema = {
  resources: DatafnResourceSchema[];
  relations?: DatafnRelationSchema[];
};

export type DatafnResourceSchema = {
  name: string;
  version: number;
  idPrefix?: string;
  isRemoteOnly?: boolean;
  fields: DatafnFieldSchema[];
  indices?:
    | {
        base?: string[];
        search?: string[];
        vector?: string[];
      }
    | string[];
  permissions?: unknown;
};

export type DatafnFieldSchema = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "date" | "file";
  required: boolean;
  nullable?: boolean;
  readonly?: boolean;
  default?: unknown;
  enum?: unknown[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean | string;
  encrypt?: boolean;
  volatile?: boolean;
};

export type DatafnRelationSchema = {
  from: string | string[];
  to: string | string[];
  type: "one-many" | "many-one" | "many-many" | "htree";
  relation?: string;
  inverse?: string;
  cache?: boolean;
  metadata?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "date" | "object";
  }>;
  fkField?: string;
  pathField?: string;
};

/**
 * Event Types
 */

export interface DatafnEvent {
  type:
    | "mutation_applied"
    | "mutation_rejected"
    | "sync_applied"
    | "sync_failed";
  resource?: string;
  ids?: string[];
  mutationId?: string;
  clientId?: string;
  timestampMs: number;
  context?: unknown;
  action?: string;
  fields?: string[];
}

export type DatafnEventFilter = Partial<{
  type: DatafnEvent["type"] | Array<DatafnEvent["type"]>;
  resource: string | string[];
  ids: string | string[];
  mutationId: string | string[];
  action: string | string[];
  fields: string | string[];
  contextKeys: string[];
}>;

/**
 * Signal Type
 */

export interface DatafnSignal<T> {
  get(): T;
  subscribe(handler: (value: T) => void): () => void;
}

/**
 * Plugin Types
 */

export type DatafnHookContext = {
  env: "client" | "server";
  schema: DatafnSchema;
  context?: unknown;
};

export interface DatafnPlugin {
  name: string;
  runsOn: Array<"client" | "server">;
  beforeQuery?: (
    ctx: DatafnHookContext,
    q: unknown,
  ) => Promise<unknown> | unknown;
  afterQuery?: (
    ctx: DatafnHookContext,
    q: unknown,
    result: unknown,
  ) => Promise<unknown> | unknown;
  beforeMutation?: (
    ctx: DatafnHookContext,
    m: unknown | unknown[],
  ) => Promise<unknown> | unknown;
  afterMutation?: (
    ctx: DatafnHookContext,
    m: unknown | unknown[],
    result: unknown,
  ) => Promise<void> | void;
  beforeSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push",
    payload: unknown,
  ) => Promise<unknown> | unknown;
  afterSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push",
    payload: unknown,
    result: unknown,
  ) => Promise<void> | void;
}
