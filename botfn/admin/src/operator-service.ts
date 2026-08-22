import { AdminError, adminScopeRootId, type AdminOperationContext } from "@superfunctions/admin";

export type BotFnPlatform = "discord" | "slack" | "github" | "linear";

export interface BotFnOperatorScope {
  installationId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string | null;
}

export interface BotFnPageInput {
  cursor?: string;
  limit?: number;
}

export interface BotFnBotRecord {
  id: string;
  scope: BotFnOperatorScope;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotFnChannelRecord {
  id: string;
  scope: BotFnOperatorScope;
  botId: string;
  platform: BotFnPlatform;
  externalId: string;
  credentialRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotFnChannelView extends Omit<BotFnChannelRecord, "credentialRef"> {
  credentialConfigured: true;
}

/** Durable persistence boundary owned by BotFn. All methods are project-scoped. */
export interface BotFnOperatorStore {
  listBots(scope: BotFnOperatorScope): Promise<BotFnBotRecord[]>;
  getBot(scope: BotFnOperatorScope, id: string): Promise<BotFnBotRecord | null>;
  putBot(value: BotFnBotRecord): Promise<void>;
  deleteBot(scope: BotFnOperatorScope, id: string): Promise<boolean>;
  deleteBotIfNoChannels(scope: BotFnOperatorScope, id: string): Promise<"deleted" | "not_found" | "channels_exist">;
  listChannels(scope: BotFnOperatorScope, botId?: string): Promise<BotFnChannelRecord[]>;
  getChannel(scope: BotFnOperatorScope, id: string): Promise<BotFnChannelRecord | null>;
  putChannel(value: BotFnChannelRecord): Promise<void>;
  putChannelIfBotExists(value: BotFnChannelRecord): Promise<boolean>;
  deleteChannel(scope: BotFnOperatorScope, id: string): Promise<boolean>;
}

/** Explicit in-memory implementation for tests and local development. */
export class MemoryBotFnOperatorStore implements BotFnOperatorStore {
  private readonly bots = new Map<string, BotFnBotRecord>();
  private readonly channels = new Map<string, BotFnChannelRecord>();

  private key(scope: BotFnOperatorScope, id: string): string {
    return `${scope.installationId}\0${scope.workspaceId}\0${scope.projectId}\0${scope.environmentId ?? ""}\0${id}`;
  }

  async listBots(scope: BotFnOperatorScope): Promise<BotFnBotRecord[]> {
    const prefix = this.key(scope, "");
    return [...this.bots.values()]
      .filter((value) => this.key(value.scope, "") === prefix)
      .map((value) => structuredClone(value));
  }

  async getBot(scope: BotFnOperatorScope, id: string): Promise<BotFnBotRecord | null> {
    const value = this.bots.get(this.key(scope, id));
    return value ? structuredClone(value) : null;
  }

  async putBot(value: BotFnBotRecord): Promise<void> {
    this.bots.set(this.key(value.scope, value.id), structuredClone(value));
  }

  async deleteBot(scope: BotFnOperatorScope, id: string): Promise<boolean> {
    return this.bots.delete(this.key(scope, id));
  }

  async deleteBotIfNoChannels(
    scope: BotFnOperatorScope,
    id: string,
  ): Promise<"deleted" | "not_found" | "channels_exist"> {
    const botKey = this.key(scope, id);
    if (!this.bots.has(botKey)) return "not_found";
    const prefix = this.key(scope, "");
    if ([...this.channels.values()].some((value) => this.key(value.scope, "") === prefix && value.botId === id)) {
      return "channels_exist";
    }
    this.bots.delete(botKey);
    return "deleted";
  }

  async listChannels(scope: BotFnOperatorScope, botId?: string): Promise<BotFnChannelRecord[]> {
    const prefix = this.key(scope, "");
    return [...this.channels.values()]
      .filter((value) => this.key(value.scope, "") === prefix && (!botId || value.botId === botId))
      .map((value) => structuredClone(value));
  }

  async getChannel(scope: BotFnOperatorScope, id: string): Promise<BotFnChannelRecord | null> {
    const value = this.channels.get(this.key(scope, id));
    return value ? structuredClone(value) : null;
  }

  async putChannel(value: BotFnChannelRecord): Promise<void> {
    this.channels.set(this.key(value.scope, value.id), structuredClone(value));
  }

  async putChannelIfBotExists(value: BotFnChannelRecord): Promise<boolean> {
    if (!this.bots.has(this.key(value.scope, value.botId))) return false;
    this.channels.set(this.key(value.scope, value.id), structuredClone(value));
    return true;
  }

  async deleteChannel(scope: BotFnOperatorScope, id: string): Promise<boolean> {
    return this.channels.delete(this.key(scope, id));
  }
}

export interface BotFnOperatorServiceOptions {
  store: BotFnOperatorStore;
  /** Verify the referenced credential against the platform before persistence. */
  verifyChannel(
    input: { platform: BotFnPlatform; externalId: string; credentialRef: string },
    context: AdminOperationContext,
  ): Promise<{ accountLabel?: string }>;
  now?: () => Date;
}

function requireScope(context: AdminOperationContext): BotFnOperatorScope {
  const { workspaceId, projectId, environmentId } = context.scope;
  const installationId = adminScopeRootId(context.scope);
  if (!installationId || !workspaceId || !projectId) {
    throw new AdminError(
      "invalid_argument",
      "BotFn administration requires installation, workspace, and project scope identifiers.",
    );
  }
  return { installationId, workspaceId, projectId, environmentId: environmentId ?? null };
}

function page<T extends { id: string }>(items: T[], input: BotFnPageInput): {
  items: T[];
  nextCursor: string | null;
} {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new AdminError("invalid_argument", "BotFn cursor is invalid.");
  }
  const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
  const values = ordered.slice(offset, offset + limit);
  const next = offset + values.length;
  return { items: values, nextCursor: next < ordered.length ? String(next) : null };
}

function channelView(value: BotFnChannelRecord): BotFnChannelView {
  const { credentialRef: _credentialRef, ...record } = value;
  return { ...record, credentialConfigured: true };
}

export function createBotFnOperatorService(options: BotFnOperatorServiceOptions) {
  const now = () => (options.now?.() ?? new Date()).toISOString();

  return {
    async listBots(input: BotFnPageInput, context: AdminOperationContext) {
      return page(await options.store.listBots(requireScope(context)), input);
    },

    async getBot(input: { id: string }, context: AdminOperationContext) {
      const value = await options.store.getBot(requireScope(context), input.id);
      if (!value) throw new AdminError("not_found", "BotFn bot was not found.");
      return { item: value };
    },

    async upsertBot(
      input: { id: string; name: string; enabled?: boolean },
      context: AdminOperationContext,
    ) {
      const scope = requireScope(context);
      if (!input.id.trim() || !input.name.trim()) {
        throw new AdminError("invalid_argument", "Bot id and name are required.");
      }
      const previous = await options.store.getBot(scope, input.id);
      const updatedAt = now();
      const value: BotFnBotRecord = {
        id: input.id,
        scope,
        name: input.name,
        enabled: input.enabled ?? true,
        createdAt: previous?.createdAt ?? updatedAt,
        updatedAt,
      };
      await options.store.putBot(value);
      return { accepted: true as const, item: value };
    },

    async deleteBot(input: { id: string }, context: AdminOperationContext) {
      const scope = requireScope(context);
      const outcome = await options.store.deleteBotIfNoChannels(scope, input.id);
      if (outcome === "channels_exist") {
        throw new AdminError("precondition_failed", "Disconnect bot channels before deleting the bot.");
      }
      if (outcome === "not_found") {
        throw new AdminError("not_found", "BotFn bot was not found.");
      }
      return { accepted: true as const };
    },

    async listChannels(input: BotFnPageInput & { botId?: string }, context: AdminOperationContext) {
      const values = await options.store.listChannels(requireScope(context), input.botId);
      return page(values.map(channelView), input);
    },

    async getChannel(input: { id: string }, context: AdminOperationContext) {
      const value = await options.store.getChannel(requireScope(context), input.id);
      if (!value) throw new AdminError("not_found", "BotFn channel was not found.");
      return { item: channelView(value) };
    },

    async connectChannel(
      input: {
        id: string;
        botId: string;
        platform: BotFnPlatform;
        externalId: string;
        credentialRef: string;
        enabled?: boolean;
      },
      context: AdminOperationContext,
    ) {
      const scope = requireScope(context);
      if (!await options.store.getBot(scope, input.botId)) {
        throw new AdminError("not_found", "BotFn bot was not found.");
      }
      await options.verifyChannel({
        platform: input.platform,
        externalId: input.externalId,
        credentialRef: input.credentialRef,
      }, context);
      const previous = await options.store.getChannel(scope, input.id);
      const updatedAt = now();
      const value: BotFnChannelRecord = {
        id: input.id,
        scope,
        botId: input.botId,
        platform: input.platform,
        externalId: input.externalId,
        credentialRef: input.credentialRef,
        enabled: input.enabled ?? true,
        createdAt: previous?.createdAt ?? updatedAt,
        updatedAt,
      };
      if (!await options.store.putChannelIfBotExists(value)) {
        throw new AdminError("not_found", "BotFn bot was not found.");
      }
      return { accepted: true as const, item: channelView(value) };
    },

    async disconnectChannel(input: { id: string }, context: AdminOperationContext) {
      if (!await options.store.deleteChannel(requireScope(context), input.id)) {
        throw new AdminError("not_found", "BotFn channel was not found.");
      }
      return { accepted: true as const };
    },
  };
}

export type BotFnOperatorService = ReturnType<typeof createBotFnOperatorService>;
