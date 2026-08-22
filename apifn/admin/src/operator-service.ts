import {
  diffOpenAPI,
  parseOpenAPI,
  validateOpenAPI,
  type OpenAPIDocument,
} from "@apifn/core";
import { AdminError, adminScopeRootId, type AdminOperationContext } from "@superfunctions/admin";

export interface ApiFnOperatorScope {
  installationId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string | null;
}
export interface ApiFnPageInput { cursor?: string; limit?: number }

export interface ApiFnSpecRecord {
  id: string;
  scope: ApiFnOperatorScope;
  name: string;
  version: string;
  document: OpenAPIDocument;
  createdAt: string;
  updatedAt: string;
}
export interface ApiFnSpecView {
  id: string;
  scope: ApiFnOperatorScope;
  name: string;
  version: string;
  title: string;
  endpointCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface ApiFnEnvironmentRecord {
  id: string;
  scope: ApiFnOperatorScope;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ApiFnDiffEntryView {
  type: "added" | "removed" | "modified";
  breaking: boolean;
  path: string;
  description: string;
}
export interface ApiFnDiffView {
  breaking: ApiFnDiffEntryView[];
  nonBreaking: ApiFnDiffEntryView[];
  hasBreakingChanges: boolean;
  summary: { added: number; removed: number; modified: number; breaking: number; nonBreaking: number };
}

/** Durable persistence boundary owned by ApiFn. */
export interface ApiFnOperatorStore {
  listSpecs(scope: ApiFnOperatorScope): Promise<ApiFnSpecRecord[]>;
  getSpec(scope: ApiFnOperatorScope, id: string): Promise<ApiFnSpecRecord | null>;
  putSpec(record: ApiFnSpecRecord): Promise<void>;
  deleteSpec(scope: ApiFnOperatorScope, id: string): Promise<boolean>;
  listEnvironments(scope: ApiFnOperatorScope): Promise<ApiFnEnvironmentRecord[]>;
  getEnvironment(scope: ApiFnOperatorScope, id: string): Promise<ApiFnEnvironmentRecord | null>;
  putEnvironment(record: ApiFnEnvironmentRecord): Promise<void>;
  deleteEnvironment(scope: ApiFnOperatorScope, id: string): Promise<boolean>;
}

/** Explicit in-memory implementation for tests and local development. */
export class MemoryApiFnOperatorStore implements ApiFnOperatorStore {
  private readonly specs = new Map<string, ApiFnSpecRecord>();
  private readonly environments = new Map<string, ApiFnEnvironmentRecord>();

  private key(scope: ApiFnOperatorScope, id: string): string {
    return `${scope.installationId}\0${scope.workspaceId}\0${scope.projectId}\0${scope.environmentId ?? ""}\0${id}`;
  }

  async listSpecs(scope: ApiFnOperatorScope): Promise<ApiFnSpecRecord[]> {
    const prefix = this.key(scope, "");
    return [...this.specs.values()]
      .filter((value) => this.key(value.scope, "") === prefix)
      .map((value) => structuredClone(value));
  }

  async getSpec(scope: ApiFnOperatorScope, id: string): Promise<ApiFnSpecRecord | null> {
    const value = this.specs.get(this.key(scope, id));
    return value ? structuredClone(value) : null;
  }

  async putSpec(record: ApiFnSpecRecord): Promise<void> {
    this.specs.set(this.key(record.scope, record.id), structuredClone(record));
  }

  async deleteSpec(scope: ApiFnOperatorScope, id: string): Promise<boolean> {
    return this.specs.delete(this.key(scope, id));
  }

  async listEnvironments(scope: ApiFnOperatorScope): Promise<ApiFnEnvironmentRecord[]> {
    const prefix = this.key(scope, "");
    return [...this.environments.values()]
      .filter((value) => this.key(value.scope, "") === prefix)
      .map((value) => structuredClone(value));
  }

  async getEnvironment(scope: ApiFnOperatorScope, id: string): Promise<ApiFnEnvironmentRecord | null> {
    const value = this.environments.get(this.key(scope, id));
    return value ? structuredClone(value) : null;
  }

  async putEnvironment(record: ApiFnEnvironmentRecord): Promise<void> {
    this.environments.set(this.key(record.scope, record.id), structuredClone(record));
  }

  async deleteEnvironment(scope: ApiFnOperatorScope, id: string): Promise<boolean> {
    return this.environments.delete(this.key(scope, id));
  }
}

export interface ApiFnOperatorServiceOptions { store: ApiFnOperatorStore; now?: () => Date }
export interface ApiFnRegisterSpecInput { id: string; name: string; document: string | Record<string, unknown> }
export interface ApiFnCompareSpecInput { id: string; candidate: string | Record<string, unknown> }
export interface ApiFnUpsertEnvironmentInput { id: string; name: string; baseUrl: string; enabled?: boolean }

function requireScope(context: AdminOperationContext): ApiFnOperatorScope {
  const { workspaceId, projectId, environmentId } = context.scope;
  const installationId = adminScopeRootId(context.scope);
  if (!installationId || !workspaceId || !projectId) {
    throw new AdminError(
      "invalid_argument",
      "ApiFn administration requires installation, workspace, and project scope identifiers.",
    );
  }
  return { installationId, workspaceId, projectId, environmentId: environmentId ?? null };
}

function specView(record: ApiFnSpecRecord): ApiFnSpecView {
  const endpointCount = Object.values(record.document.paths ?? {}).reduce(
    (count, item) => count + Object.keys(item ?? {}).filter((key) =>
      ["get", "put", "post", "delete", "patch", "options", "head", "trace"].includes(key),
    ).length,
    0,
  );
  return {
    id: record.id,
    scope: record.scope,
    name: record.name,
    version: record.version,
    title: record.document.info.title,
    endpointCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function page<T extends { id: string }>(items: T[], input: ApiFnPageInput) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new AdminError("invalid_argument", "ApiFn cursor is invalid.");
  }
  const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
  const values = ordered.slice(offset, offset + limit);
  const next = offset + values.length;
  return { items: values, nextCursor: next < ordered.length ? String(next) : null };
}

function required(value: string, label: string): string {
  if (!value.trim()) throw new AdminError("invalid_argument", `${label} is required.`);
  return value;
}

export function createApiFnOperatorService(options: ApiFnOperatorServiceOptions) {
  const now = () => (options.now?.() ?? new Date()).toISOString();
  return {
    async listSpecs(input: ApiFnPageInput, context: AdminOperationContext) {
      const values = await options.store.listSpecs(requireScope(context));
      return page(values.map(specView), input);
    },

    async getSpec(input: { id: string }, context: AdminOperationContext) {
      const value = await options.store.getSpec(requireScope(context), input.id);
      if (!value) throw new AdminError("not_found", "ApiFn spec was not found.");
      return { item: specView(value) };
    },

    async registerSpec(input: ApiFnRegisterSpecInput, context: AdminOperationContext) {
      const scope = requireScope(context);
      const document = parseOpenAPI(input.document);
      const errors = await validateOpenAPI(document);
      if (errors.length > 0) {
        throw new AdminError("invalid_argument", "OpenAPI validation failed.", { details: { errors } });
      }
      const existing = await options.store.getSpec(scope, input.id);
      const timestamp = now();
      const record: ApiFnSpecRecord = {
        id: required(input.id, "id"),
        scope,
        name: required(input.name, "name"),
        version: document.info.version,
        document,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await options.store.putSpec(record);
      return { accepted: true as const, item: specView(record) };
    },

    async compareSpec(
      input: ApiFnCompareSpecInput,
      context: AdminOperationContext,
    ): Promise<{ item: ApiFnDiffView }> {
      const value = await options.store.getSpec(requireScope(context), input.id);
      if (!value) throw new AdminError("not_found", "ApiFn baseline spec was not found.");
      const candidate = parseOpenAPI(input.candidate);
      const errors = await validateOpenAPI(candidate);
      if (errors.length > 0) {
        throw new AdminError("invalid_argument", "Candidate OpenAPI validation failed.", { details: { errors } });
      }
      const result = diffOpenAPI(value.document, candidate);
      const safeEntry = ({ type, breaking, path, description }: ApiFnDiffEntryView) => ({
        type, breaking, path, description,
      });
      return {
        item: {
          breaking: result.breaking.map(safeEntry),
          nonBreaking: result.nonBreaking.map(safeEntry),
          hasBreakingChanges: result.hasBreakingChanges,
          summary: result.summary,
        },
      };
    },

    async deleteSpec(input: { id: string }, context: AdminOperationContext) {
      if (!await options.store.deleteSpec(requireScope(context), input.id)) {
        throw new AdminError("not_found", "ApiFn spec was not found.");
      }
      return { accepted: true as const };
    },

    async listEnvironments(input: ApiFnPageInput, context: AdminOperationContext) {
      return page(await options.store.listEnvironments(requireScope(context)), input);
    },

    async getEnvironment(input: { id: string }, context: AdminOperationContext) {
      const value = await options.store.getEnvironment(requireScope(context), input.id);
      if (!value) throw new AdminError("not_found", "ApiFn environment was not found.");
      return { item: value };
    },

    async upsertEnvironment(input: ApiFnUpsertEnvironmentInput, context: AdminOperationContext) {
      const scope = requireScope(context);
      let parsed: URL;
      try {
        parsed = new URL(input.baseUrl);
      } catch {
        throw new AdminError("invalid_argument", "baseUrl must be an absolute URL.");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new AdminError("invalid_argument", "baseUrl must use HTTP or HTTPS.");
      }
      if (parsed.username || parsed.password) {
        throw new AdminError("invalid_argument", "baseUrl must not include credentials.");
      }
      const existing = await options.store.getEnvironment(scope, input.id);
      const timestamp = now();
      const record: ApiFnEnvironmentRecord = {
        id: required(input.id, "id"),
        scope,
        name: required(input.name, "name"),
        baseUrl: parsed.toString(),
        enabled: input.enabled ?? true,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await options.store.putEnvironment(record);
      return { accepted: true as const, item: record };
    },

    async deleteEnvironment(input: { id: string }, context: AdminOperationContext) {
      if (!await options.store.deleteEnvironment(requireScope(context), input.id)) {
        throw new AdminError("not_found", "ApiFn environment was not found.");
      }
      return { accepted: true as const };
    },
  };
}

export type ApiFnOperatorService = ReturnType<typeof createApiFnOperatorService>;
