import {
  MAILFN_SCOPES,
  type Actor,
  type MailFn,
  MailFnError,
  type MailFnStore,
  type MailFnStorePageInput,
  type MailFnStoreSort,
} from "@mailfn/core";
import {
  AdminError,
  decodeAdminCursor,
  encodeAdminCursor,
  normalizeAdminPageLimit,
  type AdminOperationContext,
  type AdminOperationResult,
} from "@superfunctions/admin";
import type {
  MailFnAdminRecord,
  MailFnAdminService,
  MailFnItemOutput,
  MailFnListOutput,
  MailFnMutationOutput,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

export interface MailFnDomainAdminServiceOptions {
  mailfn: MailFn;
  store: MailFnStore;
}

interface ListInput {
  cursor?: string;
  limit?: number;
  search?: string;
  filter?: JsonRecord;
  sort?: readonly JsonRecord[];
}

interface ResolvedListPage extends MailFnStorePageInput {
  identity: string;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminError("invalid_argument", `${label} must be an object.`);
  }
  return value as JsonRecord;
}

function optionalRecord(value: unknown, label: string): JsonRecord | undefined {
  return value === undefined ? undefined : record(value, label);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminError("invalid_argument", `${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : string(value, label);
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new AdminError("invalid_argument", `${label} must be an array of non-empty strings.`);
  }
  return value;
}

function projectId(context: AdminOperationContext): string {
  const id = context.scope.projectId;
  if (!id) throw new AdminError("invalid_argument", "MailFn administration requires project scope.");
  return id;
}

function actor(context: AdminOperationContext): Actor {
  return {
    actorType: "admin",
    actorId: context.actor.id,
    projectId: projectId(context),
    scopes: [...MAILFN_SCOPES],
  };
}

function safeCredential(value: JsonRecord): JsonRecord {
  const { tokenHash: _tokenHash, ...safe } = value;
  return withoutUndefined(safe);
}

function safeWebhook(value: JsonRecord): JsonRecord {
  const { secretHash: _secretHash, secretCiphertext: _secretCiphertext, ...safe } = value;
  return withoutUndefined(safe);
}

function withoutUndefined(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function safeDomain(value: JsonRecord): JsonRecord {
  const { verificationToken: _verificationToken, ...safe } = value;
  return safe;
}

function safeAttachment(value: JsonRecord): JsonRecord {
  const { objectKey: _objectKey, projectId: _projectId, ...safe } = value;
  return safe;
}

function asJson(value: object): JsonRecord {
  return { ...value };
}

function compareAdminValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function resolveListPage(
  input: ListInput,
  context: AdminOperationContext,
  operationId: string,
): ResolvedListPage {
  const search = optionalString(input.search, "search")?.trim().toLowerCase();
  const filter = optionalRecord(input.filter, "filter");
  if (input.sort !== undefined && !Array.isArray(input.sort)) {
    throw new AdminError("invalid_argument", "sort must be an array.");
  }
  const sort: MailFnStoreSort[] = (input.sort ?? []).map((value, index) => {
    const descriptor = record(value, `sort[${index}]`);
    const field = string(descriptor.field, `sort[${index}].field`);
    const direction = descriptor.direction ?? "asc";
    if (direction !== "asc" && direction !== "desc") {
      throw new AdminError("invalid_argument", `sort[${index}].direction must be asc or desc.`);
    }
    return { field, direction };
  });
  const identity = JSON.stringify([
    operationId,
    search ?? null,
    Object.entries(filter ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    sort.map((descriptor) => [descriptor.field, descriptor.direction]),
  ]);
  const decoded = input.cursor
    ? decodeAdminCursor<{ identity?: unknown; offset?: unknown }>(input.cursor, context.scope)
    : { identity, offset: 0 };
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || decoded.identity !== identity) {
    throw new AdminError("invalid_argument", "The pagination cursor does not belong to this collection query.");
  }
  const offset = decoded.offset ?? 0;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new AdminError("invalid_argument", "The pagination cursor is invalid.");
  }
  return {
    identity,
    offset: offset as number,
    limit: normalizeAdminPageLimit(input.limit),
    ...(search ? { search } : {}),
    ...(filter ? { filter } : {}),
    ...(sort.length ? { sort } : {}),
  };
}

function pageResult<T extends object>(
  items: T[],
  hasMore: boolean,
  resolved: ResolvedListPage,
  context: AdminOperationContext,
): AdminOperationResult<MailFnListOutput> {
  const nextOffset = resolved.offset + items.length;
  const nextCursor = hasMore
    ? encodeAdminCursor(context.scope, { identity: resolved.identity, offset: nextOffset })
    : null;
  return {
    ok: true,
    data: {
      items: items.map(asJson) as MailFnAdminRecord[],
      nextCursor,
    },
    page: {
      nextCursor,
      hasMore,
    },
  };
}

function page<T extends object>(
  items: T[],
  input: ListInput,
  context: AdminOperationContext,
  operationId: string,
): AdminOperationResult<MailFnListOutput> {
  const resolved = resolveListPage(input, context, operationId);
  let records = items.map(asJson);
  if (resolved.search) {
    records = records.filter((value) => JSON.stringify(value).toLowerCase().includes(resolved.search!));
  }
  if (resolved.filter) {
    records = records.filter((value) => Object.entries(resolved.filter!).every(
      ([field, expected]) => JSON.stringify(value[field]) === JSON.stringify(expected),
    ));
  }
  records.sort((left, right) => {
    for (const descriptor of resolved.sort ?? []) {
      const compared = compareAdminValues(left[descriptor.field], right[descriptor.field]);
      if (compared !== 0) return compared * (descriptor.direction === "desc" ? -1 : 1);
    }
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const selected = records.slice(resolved.offset, resolved.offset + resolved.limit);
  return pageResult(selected, resolved.offset + selected.length < records.length, resolved, context);
}

function item(value: object): AdminOperationResult<MailFnItemOutput> {
  return { ok: true, data: { item: asJson(value) } };
}

function accepted(value?: object): AdminOperationResult<MailFnMutationOutput> {
  return {
    ok: true,
    data: { accepted: true, ...(value ? { item: asJson(value) } : {}) },
  };
}

function notFound(label: string): never {
  throw new AdminError("not_found", `${label} was not found in the active MailFn project.`);
}

function assertProject(value: { projectId: string }, expected: string, label: string): void {
  if (value.projectId !== expected) notFound(label);
}

async function readableProjectInboxes(mailfn: MailFn, adminActor: Actor) {
  return (await mailfn.listInboxes(adminActor)).filter((inbox) => inbox.status !== "deleted");
}

function mapMailFnError(error: unknown): never {
  if (error instanceof AdminError) throw error;
  if (!(error instanceof MailFnError)) throw error;
  const code = error.status === 401
    ? "unauthenticated"
    : error.status === 403
      ? "forbidden"
      : error.status === 404
        ? "not_found"
        : error.status === 409
          ? "conflict"
          : error.status === 429
            ? "rate_limited"
            : error.status === 410 || error.status === 412 || error.status === 499
              ? "precondition_failed"
              : error.status >= 500 || error.status === 408
                ? "dependency_unavailable"
                : "invalid_argument";
  throw new AdminError(code, error.message, {
    status: error.status,
    details: error.details,
    retryable: error.retryable,
    cause: error,
  });
}

function translateMailFnErrors(service: MailFnAdminService): MailFnAdminService {
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          return mapMailFnError(error);
        }
      };
    },
  });
}

/**
 * Binds the public MailFn domain service and store to the shared administration
 * contract. Reads remain project-scoped and mutations delegate to MailFn so its
 * authorization, retention, quota, audit, and provider invariants stay active.
 */
export function createMailFnDomainAdminService(
  options: MailFnDomainAdminServiceOptions,
): MailFnAdminService {
  const { mailfn, store } = options;

  const state = (context: AdminOperationContext) => ({
    activeProjectId: projectId(context),
    adminActor: actor(context),
  });

  return translateMailFnErrors({
    async listProjects(input, context) {
      const { activeProjectId } = state(context);
      const project = await store.getProject(activeProjectId);
      return page(project ? [project] : [], input, context, "mailfn.projects.list");
    },
    async getProject(input, context) {
      const { activeProjectId } = state(context);
      if (string(input.id, "id") !== activeProjectId) notFound("Project");
      const project = await store.getProject(activeProjectId);
      return project ? item(project) : notFound("Project");
    },
    async listInboxes(input, context) {
      const { adminActor } = state(context);
      return page(await mailfn.listInboxes(adminActor), input, context, "mailfn.inboxes.list");
    },
    async getInbox(input, context) {
      const { adminActor } = state(context);
      return item(await mailfn.getInbox(adminActor, string(input.id, "id")));
    },
    async listMessages(input, context) {
      const { activeProjectId } = state(context);
      const filter = optionalRecord(input.filter, "filter");
      const filterAllowed = new Set([
        "id", "projectId", "inboxId", "providerDeliveryId", "envelopeFrom", "envelopeTo",
        "subject", "receivedAt", "parsedAt", "threadId", "sizeBytes", "status", "readAt",
        "createdAt", "updatedAt", "sender", "senderDomain", "recipient", "text",
        "receivedAfter", "receivedBefore", "unreadOnly", "labels",
      ]);
      const sortAllowed = new Set([
        "id", "projectId", "inboxId", "providerDeliveryId", "envelopeFrom", "envelopeTo",
        "subject", "receivedAt", "parsedAt", "threadId", "sizeBytes", "status", "readAt",
        "createdAt", "updatedAt",
      ]);
      for (const key of Object.keys(filter ?? {})) {
        if (!filterAllowed.has(key)) throw new AdminError("invalid_argument", `Unsupported MailFn message filter: ${key}.`);
      }
      const resolved = resolveListPage(input, context, "mailfn.messages.list");
      for (const descriptor of resolved.sort ?? []) {
        if (!sortAllowed.has(descriptor.field)) throw new AdminError("invalid_argument", `Unsupported MailFn message sort: ${descriptor.field}.`);
      }
      const result = await store.listProjectMessagesPage(activeProjectId, resolved);
      return pageResult(result.items, result.hasMore, resolved, context);
    },
    async getMessage(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const message = await store.getMessage(string(input.id, "id"));
      if (!message) notFound("Message");
      assertProject(message, activeProjectId, "Message");
      return item(await mailfn.getMessage(adminActor, message.inboxId, message.id, false));
    },
    async listThreads(input, context) {
      const { adminActor } = state(context);
      const threads = [];
      for (const inbox of await readableProjectInboxes(mailfn, adminActor)) {
        threads.push(...await mailfn.listThreads(adminActor, inbox.id));
      }
      return page(threads, input, context, "mailfn.threads.list");
    },
    async getThread(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const thread = await store.getThread(string(input.id, "id"));
      if (!thread) notFound("Thread");
      assertProject(thread, activeProjectId, "Thread");
      const permitted = await mailfn.listThreads(adminActor, thread.inboxId);
      return item(permitted.find((entry) => entry.id === thread.id) ?? notFound("Thread"));
    },
    async listDrafts(input, context) {
      const { adminActor } = state(context);
      const drafts = [];
      for (const inbox of await readableProjectInboxes(mailfn, adminActor)) {
        drafts.push(...await mailfn.listDrafts(adminActor, inbox.id));
      }
      return page(drafts, input, context, "mailfn.drafts.list");
    },
    async getDraft(input, context) {
      const { adminActor } = state(context);
      return item(await mailfn.getDraft(adminActor, string(input.id, "id")));
    },
    async listAttachments(input, context) {
      const { activeProjectId } = state(context);
      const filter = optionalRecord(input.filter, "filter");
      const allowed = new Set([
        "id", "projectId", "inboxId", "messageId", "filename", "contentType", "sizeBytes",
        "sha256", "contentId", "disposition", "createdAt",
      ]);
      for (const key of Object.keys(filter ?? {})) {
        if (!allowed.has(key)) throw new AdminError("invalid_argument", `Unsupported MailFn attachment filter: ${key}.`);
      }
      const resolved = resolveListPage(input, context, "mailfn.attachments.list");
      for (const descriptor of resolved.sort ?? []) {
        if (!allowed.has(descriptor.field)) throw new AdminError("invalid_argument", `Unsupported MailFn attachment sort: ${descriptor.field}.`);
      }
      const result = await store.listProjectAttachmentsPage(activeProjectId, resolved);
      return pageResult(result.items.map((entry) => safeAttachment(asJson(entry))), result.hasMore, resolved, context);
    },
    async getAttachment(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const attachment = await store.getAttachment(string(input.id, "id"));
      if (!attachment) notFound("Attachment");
      assertProject(attachment, activeProjectId, "Attachment");
      const result = await mailfn.getAttachment(adminActor, attachment.inboxId, attachment.messageId, attachment.id);
      const { objectKey: _objectKey, ...metadata } = result.attachment;
      return item(metadata);
    },
    async listCredentials(input, context) {
      const { activeProjectId } = state(context);
      return page((await store.listCredentials(activeProjectId)).map((entry) => safeCredential(asJson(entry))), input, context, "mailfn.credentials.list");
    },
    async getCredential(input, context) {
      const { activeProjectId } = state(context);
      const credential = await store.getCredential(string(input.id, "id"));
      if (!credential) notFound("Credential");
      assertProject(credential, activeProjectId, "Credential");
      return item(safeCredential(asJson(credential)));
    },
    async listDomains(input, context) {
      const { activeProjectId } = state(context);
      return page((await store.listDomains(activeProjectId)).map((entry) => safeDomain(asJson(entry))), input, context, "mailfn.domains-routes.list");
    },
    async getDomain(input, context) {
      const { activeProjectId } = state(context);
      const domain = await store.getDomain(string(input.id, "id"));
      if (!domain) notFound("Domain");
      assertProject(domain, activeProjectId, "Domain");
      return item(safeDomain(asJson(domain)));
    },
    async listWebhooks(input, context) {
      const { activeProjectId } = state(context);
      return page((await store.listWebhooks(activeProjectId)).map((entry) => safeWebhook(asJson(entry))), input, context, "mailfn.webhooks.list");
    },
    async getWebhook(input, context) {
      const { activeProjectId } = state(context);
      const webhook = await store.getWebhook(string(input.id, "id"));
      if (!webhook) notFound("Webhook");
      assertProject(webhook, activeProjectId, "Webhook");
      return item(safeWebhook(asJson(webhook)));
    },
    async listRetention(input, context) {
      const { activeProjectId } = state(context);
      const project = await store.getProject(activeProjectId);
      if (!project) notFound("Project");
      return page([{ id: project.id, ...project.defaultRetentionPolicy }], input, context, "mailfn.retention.list");
    },
    async getRetention(input, context) {
      const { activeProjectId } = state(context);
      if (string(input.id, "id") !== activeProjectId) notFound("Retention policy");
      const project = await store.getProject(activeProjectId);
      if (!project) notFound("Project");
      return item({ id: project.id, ...project.defaultRetentionPolicy });
    },
    async listQuotas(input, context) {
      const { activeProjectId } = state(context);
      const project = await store.getProject(activeProjectId);
      if (!project) notFound("Project");
      return page([{ id: project.id, ...project.quota }], input, context, "mailfn.quotas.list");
    },
    async getQuota(input, context) {
      const { activeProjectId } = state(context);
      if (string(input.id, "id") !== activeProjectId) notFound("Quota");
      const project = await store.getProject(activeProjectId);
      if (!project) notFound("Project");
      return item({ id: project.id, ...project.quota });
    },
    async listAuditEvents(input, context) {
      const { adminActor } = state(context);
      return page(await mailfn.getAuditEvents(adminActor), input, context, "mailfn.compliance-audit.list");
    },
    async getAuditEvent(input, context) {
      const { adminActor } = state(context);
      const audit = (await mailfn.getAuditEvents(adminActor)).find((entry) => entry.id === string(input.id, "id"));
      return audit ? item(audit) : notFound("Audit event");
    },
    async createInbox(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const payload = record(input.payload, "payload");
      const kind = string(payload.kind, "payload.kind");
      if (kind !== "stable" && kind !== "expiring") {
        throw new AdminError("invalid_argument", "payload.kind must be stable or expiring.");
      }
      const created = await mailfn.createInbox(adminActor, {
        projectId: activeProjectId,
        kind,
        requestedLocalPart: optionalString(payload.requestedLocalPart, "payload.requestedLocalPart"),
        domain: optionalString(payload.domain, "payload.domain"),
        displayName: optionalString(payload.displayName, "payload.displayName"),
        expirySeconds: typeof payload.expirySeconds === "number" ? payload.expirySeconds : undefined,
        metadata: optionalRecord(payload.metadata, "payload.metadata") as Record<string, string> | undefined,
        idempotencyKey: context.idempotencyKey,
      });
      return accepted({
        ...created.inbox,
        credentialId: created.credential.credential.id,
        tokenPrefix: created.credential.credential.tokenPrefix,
        permissions: created.credential.credential.permissions,
        token: created.credential.token,
      });
    },
    async expireInbox(input, context) {
      const { adminActor } = state(context);
      return accepted(await mailfn.deleteInbox(adminActor, string(input.id, "id")));
    },
    async labelMessage(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const message = await store.getMessage(string(input.id, "id"));
      if (!message) notFound("Message");
      assertProject(message, activeProjectId, "Message");
      return accepted(await mailfn.labelMessage(adminActor, message.inboxId, message.id, strings(input.payload.labels, "payload.labels")));
    },
    async sendDraft(input, context) {
      const { adminActor } = state(context);
      return accepted(await mailfn.sendDraft(adminActor, string(input.id, "id")));
    },
    async createReplyDraft(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const message = await store.getMessage(string(input.id, "id"));
      if (!message) notFound("Message");
      assertProject(message, activeProjectId, "Message");
      return accepted(await mailfn.createReplyDraft(adminActor, message.inboxId, message.id, input.payload ?? {}));
    },
    async manageDomain(input, context) {
      const { adminActor } = state(context);
      const id = string(input.id, "id");
      const mode = string(record(input.payload, "payload").mode, "payload.mode");
      if (mode === "verify") return accepted(await mailfn.verifyDomain(adminActor, id));
      if (mode === "disable") return accepted(await mailfn.disableDomain(adminActor, id));
      throw new AdminError("invalid_argument", "payload.mode must be verify or disable.");
    },
    async createWebhook(input, context) {
      const { adminActor } = state(context);
      const payload = record(input.payload, "payload");
      const created = await mailfn.createWebhook(adminActor, {
        inboxId: optionalString(payload.inboxId, "payload.inboxId"),
        url: string(payload.url, "payload.url"),
        eventTypes: strings(payload.eventTypes, "payload.eventTypes") as Parameters<MailFn["createWebhook"]>[1]["eventTypes"],
      });
      return accepted({ ...safeWebhook(asJson(created.webhook)), secret: created.secret });
    },
    async rotateCredential(input, context) {
      const { activeProjectId, adminActor } = state(context);
      const credentialId = string(input.id, "id");
      if (!context.idempotencyKey) throw new AdminError("precondition_failed", "Credential rotation requires an idempotency key.");
      const credential = await store.getCredential(credentialId);
      if (!credential) notFound("Credential");
      assertProject(credential, activeProjectId, "Credential");
      const replacement = await mailfn.rotateCredential(adminActor, credentialId, context.idempotencyKey);
      return accepted({ ...safeCredential(asJson(replacement.credential)), token: replacement.token });
    },
    async purgeRetention(_input, context) {
      return accepted(await mailfn.runRetention(state(context).activeProjectId));
    },
  });
}
