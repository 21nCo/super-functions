import {
  createAdminCapabilityAdapter,
  createCapabilityAdminClient,
  defineAdminCapability,
  type AdminCapabilityAdapter,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import type {
  BotFnBotRecord,
  BotFnChannelView,
  BotFnOperatorService,
  BotFnPageInput,
  BotFnPlatform,
} from "./operator-service.js";

export * from "./operator-service.js";

type IdInput = { id: string };
type BotUpsertInput = { id: string; name: string; enabled?: boolean };
type ChannelListInput = BotFnPageInput & { botId?: string };
type ChannelConnectInput = {
  id: string;
  botId: string;
  platform: BotFnPlatform;
  externalId: string;
  credentialRef: string;
  enabled?: boolean;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type Item<T> = { item: T };
type Accepted = { accepted: true };
type AcceptedItem<T> = Accepted & { item: T };

const pageInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    cursor: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
};
const idSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};
const botRecordSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    scope: {
      type: "object",
      properties: {
        installationId: { type: "string" },
        workspaceId: { type: "string" },
        projectId: { type: "string" },
        environmentId: { type: ["string", "null"] },
      },
      required: ["installationId", "workspaceId", "projectId", "environmentId"],
      additionalProperties: false,
    },
    name: { type: "string" },
    enabled: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "scope", "name", "enabled", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const channelViewSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    scope: botRecordSchema.properties!.scope!,
    botId: { type: "string" },
    platform: { type: "string", enum: ["discord", "slack", "github", "linear"] },
    externalId: { type: "string" },
    credentialConfigured: { type: "boolean", const: true },
    enabled: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "id", "scope", "botId", "platform", "externalId", "credentialConfigured",
    "enabled", "createdAt", "updatedAt",
  ],
  additionalProperties: false,
};
const botUpsertSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
  },
  required: ["id", "name"],
  additionalProperties: false,
};
const channelListSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    ...pageInputSchema.properties,
    botId: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
};
const channelConnectSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    botId: { type: "string", minLength: 1 },
    platform: { type: "string", enum: ["discord", "slack", "github", "linear"] },
    externalId: { type: "string", minLength: 1 },
    credentialRef: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
  },
  required: ["id", "botId", "platform", "externalId", "credentialRef"],
  additionalProperties: false,
};

function pageSchema(item: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: item },
      nextCursor: { type: ["string", "null"] },
    },
    required: ["items", "nextCursor"],
    additionalProperties: false,
  };
}

function itemSchema(item: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: { item },
    required: ["item"],
    additionalProperties: false,
  };
}

function acceptedSchema(item?: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: {
      accepted: { type: "boolean", const: true },
      ...(item ? { item } : {}),
    },
    required: item ? ["accepted", "item"] : ["accepted"],
    additionalProperties: false,
  };
}

function operation<TInput, TOutput>() {
  return <const TId extends string>(
    value: AdminOperationDefinition<TInput, TOutput> & { readonly id: TId },
  ): AdminOperationDefinition<TInput, TOutput> & { readonly id: TId } => value;
}

const readSafety = {
  classification: "read",
  idempotent: true,
  requiresConfirmation: false,
  audit: "optional",
} as const;
const writeSafety = {
  classification: "write",
  idempotent: true,
  requiresConfirmation: false,
  audit: "required",
} as const;
const destructiveSafety = (reason: string) => ({
  classification: "destructive",
  idempotent: true,
  requiresConfirmation: true,
  confirmation: { risk: "high", method: "recent-auth", reason, maxAgeSeconds: 300 },
  audit: "required",
} as const);

const operations = [
  operation<BotFnPageInput, Page<BotFnBotRecord>>()({
    id: "botfn.bots.list",
    title: "List bots",
    description: "List project bots.",
    inputSchema: pageInputSchema,
    outputSchema: pageSchema(botRecordSchema),
    route: { method: "GET", path: "/resources/bots" },
    permission: "botfn.bots.read",
    minimumScope: "project",
    safety: readSafety,
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 },
    target: { resource: "bots", collection: true },
  }),
  operation<IdInput, Item<BotFnBotRecord>>()({
    id: "botfn.bots.get",
    title: "Get bot",
    description: "Get one project bot.",
    inputSchema: idSchema,
    outputSchema: itemSchema(botRecordSchema),
    route: { method: "GET", path: "/resources/bots/:id" },
    permission: "botfn.bots.read",
    minimumScope: "project",
    safety: readSafety,
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    target: { resource: "bots", idInput: "id" },
  }),
  operation<BotUpsertInput, AcceptedItem<BotFnBotRecord>>()({
    id: "botfn.bots.upsert",
    title: "Upsert bot",
    description: "Create or update a bot identity.",
    inputSchema: botUpsertSchema,
    outputSchema: acceptedSchema(botRecordSchema),
    route: { method: "POST", path: "/resources/bots/actions/upsert" },
    permission: "botfn.bots.write",
    minimumScope: "project",
    safety: writeSafety,
    mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    target: { resource: "bots", idInput: "id" },
  }),
  operation<IdInput, Accepted>()({
    id: "botfn.bots.delete",
    title: "Delete bot",
    description: "Delete a bot after channels are disconnected.",
    inputSchema: idSchema,
    outputSchema: acceptedSchema(),
    route: { method: "POST", path: "/resources/bots/actions/delete" },
    permission: "botfn.bots.delete",
    minimumScope: "project",
    safety: destructiveSafety("Deleting a bot removes its operator identity."),
    mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    target: { resource: "bots", idInput: "id" },
  }),
  operation<ChannelListInput, Page<BotFnChannelView>>()({
    id: "botfn.channels.list",
    title: "List channels",
    description: "List redacted bot channel bindings.",
    inputSchema: channelListSchema,
    outputSchema: pageSchema(channelViewSchema),
    route: { method: "GET", path: "/resources/channels" },
    permission: "botfn.channels.read",
    minimumScope: "project",
    safety: { ...readSafety, audit: "required" },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 },
    target: { resource: "channels", collection: true },
  }),
  operation<IdInput, Item<BotFnChannelView>>()({
    id: "botfn.channels.get",
    title: "Get channel",
    description: "Get one redacted channel binding.",
    inputSchema: idSchema,
    outputSchema: itemSchema(channelViewSchema),
    route: { method: "GET", path: "/resources/channels/:id" },
    permission: "botfn.channels.read",
    minimumScope: "project",
    safety: { ...readSafety, audit: "required" },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    target: { resource: "channels", idInput: "id" },
  }),
  operation<ChannelConnectInput, AcceptedItem<BotFnChannelView>>()({
    id: "botfn.channels.connect",
    title: "Connect channel",
    description: "Verify and persist a platform channel binding.",
    inputSchema: channelConnectSchema,
    outputSchema: acceptedSchema(channelViewSchema),
    route: { method: "POST", path: "/resources/channels/actions/connect" },
    permission: "botfn.channels.write",
    minimumScope: "project",
    safety: {
      ...writeSafety,
      requiresConfirmation: true,
      confirmation: {
        risk: "high",
        method: "recent-auth",
        reason: "Connecting a channel authorizes external bot activity.",
        maxAgeSeconds: 300,
      },
    },
    mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    redaction: { inputFields: ["credentialRef"] },
    target: { resource: "channels", idInput: "id" },
  }),
  operation<IdInput, Accepted>()({
    id: "botfn.channels.disconnect",
    title: "Disconnect channel",
    description: "Remove a platform channel binding.",
    inputSchema: idSchema,
    outputSchema: acceptedSchema(),
    route: { method: "POST", path: "/resources/channels/actions/disconnect" },
    permission: "botfn.channels.delete",
    minimumScope: "project",
    safety: destructiveSafety("Disconnecting stops external bot activity for this binding."),
    mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    target: { resource: "channels", idInput: "id" },
  }),
] as const;

export type BotFnAdminOperationId = (typeof operations)[number]["id"];
export type BotFnAdminOperation = (typeof operations)[number];
export type BotFnAdminOperationInputMap = {
  "botfn.bots.list": BotFnPageInput;
  "botfn.bots.get": IdInput;
  "botfn.bots.upsert": BotUpsertInput;
  "botfn.bots.delete": IdInput;
  "botfn.channels.list": ChannelListInput;
  "botfn.channels.get": IdInput;
  "botfn.channels.connect": ChannelConnectInput;
  "botfn.channels.disconnect": IdInput;
};

export const botFnAdminResources = [
  {
    id: "bots",
    label: "Bots",
    description: "Configured BotFn identities in the active project.",
    icon: "botfn:bots",
    risk: "standard",
    minimumScope: "project",
    idField: "id",
    displayFields: ["id", "name", "enabled", "updatedAt"],
    searchableFields: ["id", "name"],
    filterableFields: ["enabled"],
    sortableFields: ["name", "updatedAt"],
    sensitiveFields: [],
  },
  {
    id: "channels",
    label: "Bot Channels",
    description: "Verified platform bindings without credential disclosure.",
    icon: "botfn:channels",
    risk: "sensitive",
    minimumScope: "project",
    idField: "id",
    displayFields: ["id", "botId", "platform", "externalId", "enabled"],
    searchableFields: ["id", "botId", "externalId"],
    filterableFields: ["botId", "platform", "enabled"],
    sortableFields: ["updatedAt"],
    sensitiveFields: ["credentialRef", "token", "secret"],
  },
] as const;

export const botFnAdminActions = operations;
export const botFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "botfn",
  displayName: "BotFn",
  version: "1.1.0",
  description: "Project-owned bot identities and verified platform bindings.",
  category: "communication",
  availability: "optional-product",
  scopeLevels: ["installation", "workspace", "project", "environment"],
  dependencies: [],
  resources: botFnAdminResources,
  navigation: [{
    id: "botfn",
    label: "BotFn",
    path: "/modules/botfn",
    icon: "botfn",
    description: "Operate bots and platform channels.",
    order: 100,
  }],
  operations,
});

type BotFnCapabilityClient = ReturnType<typeof createCapabilityAdminClient<typeof botFnAdminCapability>>;
export interface BotFnAdminClient extends BotFnCapabilityClient {
  readonly bots: {
    list(input?: BotFnPageInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.bots.list"]>;
    get(input: IdInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.bots.get"]>;
    upsert(input: BotUpsertInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.bots.upsert"]>;
    delete(input: IdInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.bots.delete"]>;
  };
  readonly channels: {
    list(input?: ChannelListInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.channels.list"]>;
    get(input: IdInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.channels.get"]>;
    connect(input: ChannelConnectInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.channels.connect"]>;
    disconnect(input: IdInput, options?: AdminClientRequestOptions): ReturnType<BotFnCapabilityClient["operations"]["botfn.channels.disconnect"]>;
  };
}

export function createBotFnAdminClient(adminClient: AdminClient): BotFnAdminClient {
  const client = createCapabilityAdminClient(botFnAdminCapability, adminClient);
  return Object.assign(client, {
    bots: {
      list: (input: BotFnPageInput = {}, options?: AdminClientRequestOptions) => client.invoke("botfn.bots.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("botfn.bots.get", input, options),
      upsert: (input: BotUpsertInput, options?: AdminClientRequestOptions) => client.invoke("botfn.bots.upsert", input, options),
      delete: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("botfn.bots.delete", input, options),
    },
    channels: {
      list: (input: ChannelListInput = {}, options?: AdminClientRequestOptions) => client.invoke("botfn.channels.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("botfn.channels.get", input, options),
      connect: (input: ChannelConnectInput, options?: AdminClientRequestOptions) => client.invoke("botfn.channels.connect", input, options),
      disconnect: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("botfn.channels.disconnect", input, options),
    },
  });
}

type ServiceMethod<TInput> = (
  input: TInput,
  context: AdminOperationContext,
) => Promise<unknown>;

function bind<TInput>(handler: ServiceMethod<TInput>) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

export function createBotFnAdminAdapter(
  service: BotFnOperatorService,
): AdminCapabilityAdapter<typeof botFnAdminCapability> {
  return createAdminCapabilityAdapter(botFnAdminCapability, {
    "botfn.bots.list": bind(service.listBots),
    "botfn.bots.get": bind(service.getBot),
    "botfn.bots.upsert": bind(service.upsertBot),
    "botfn.bots.delete": bind(service.deleteBot),
    "botfn.channels.list": bind(service.listChannels),
    "botfn.channels.get": bind(service.getChannel),
    "botfn.channels.connect": bind(service.connectChannel),
    "botfn.channels.disconnect": bind(service.disconnectChannel),
  });
}

export const adminCapability = botFnAdminCapability;
export const createAdminAdapter = createBotFnAdminAdapter;
