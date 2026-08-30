import {
  createCommentThread,
  createEditor,
  createSuggestion,
  decideSuggestion,
  hashString,
  mapSidecar,
  replyToComment,
  resolveExtensions,
  setCommentResolved,
  transitionReview,
  validateMdfnSidecar,
  type MdfnExtension,
  type MdfnSidecar,
  type ReviewState,
  type SidecarAnchor,
} from "@mdfn/core";
import { createMarkdownProjector, parseMarkdown, type MarkdownOptions } from "@mdfn/markdown";
import { wrapWithSchema, type Adapter, type TableSchema } from "@superfunctions/db";
import { createRouter, type Router } from "@superfunctions/http";

const DOCUMENTS = "mdfnDocuments";
const VERSIONS = "mdfnVersions";
const RECEIPTS = "mdfnReceipts";
const COLLAB_UPDATES = "mdfnCollaborationUpdates";
export const MDFN_SERVER_SCHEMA_VERSION = 1;

export interface MdfnPrincipal { readonly id: string; readonly tenantId?: string; readonly roles?: readonly string[]; }
export type MdfnServerAction = "create" | "read" | "update" | "delete" | "history" | "collaborate" | "compact-collaboration";

export interface MdfnDocumentRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly tenantId?: string;
  readonly title?: string;
  readonly markdown: string;
  readonly sourceHash: string;
  readonly schemaHash: string;
  readonly sidecar?: MdfnSidecar;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MdfnVersionRecord extends MdfnDocumentRecord { readonly documentId: string; readonly authorId: string; readonly changeSource: string; }

export interface MdfnCollaborationUpdateBatch {
  readonly updates: readonly string[];
  /** Exact persisted update ids represented by `updates` and therefore safe to compact. */
  readonly includedUpdateIds: readonly string[];
}

export interface MdfnServerConfig {
  readonly database: Adapter;
  readonly authorize: (action: MdfnServerAction, principal: MdfnPrincipal, document?: MdfnDocumentRecord) => boolean | Promise<boolean>;
  readonly resolvePrincipal?: (request: Request) => MdfnPrincipal | Promise<MdfnPrincipal>;
  readonly extensions?: readonly MdfnExtension[];
  readonly markdown?: MarkdownOptions;
  readonly basePath?: string;
  readonly createId?: () => string;
  readonly maxCollaborationUpdateBytes?: number;
  /** Durable storage requires adapter transactions. Ephemeral is intended only for in-memory/test hosts. */
  readonly durability?: "required" | "ephemeral";
}

export class MdfnServerError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) { super(message); this.name = "MdfnServerError"; }
}

export function getSchema(): { version: number; schemas: TableSchema[] } {
  const date = { type: "date" as const, required: true, dateValueType: "date" as const };
  return { version: MDFN_SERVER_SCHEMA_VERSION, schemas: [
    { modelName: DOCUMENTS, fields: { id: { type: "string", required: true }, ownerId: { type: "string", required: true }, tenantId: { type: "string" }, title: { type: "string" }, markdown: { type: "string", required: true }, sourceHash: { type: "string", required: true }, schemaHash: { type: "string", required: true }, sidecar: { type: "json" }, version: { type: "number", required: true }, createdAt: date, updatedAt: date }, indexes: [{ name: "idx_mdfn_documents_owner", fields: ["ownerId"] }, { name: "idx_mdfn_documents_tenant", fields: ["tenantId"] }] },
    { modelName: VERSIONS, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true }, ownerId: { type: "string", required: true }, tenantId: { type: "string" }, title: { type: "string" }, markdown: { type: "string", required: true }, sourceHash: { type: "string", required: true }, schemaHash: { type: "string", required: true }, sidecar: { type: "json" }, version: { type: "number", required: true }, authorId: { type: "string", required: true }, changeSource: { type: "string", required: true }, createdAt: date, updatedAt: date }, indexes: [{ name: "idx_mdfn_versions_document_version", fields: ["documentId", "version"], unique: true }] },
    { modelName: RECEIPTS, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true }, idempotencyKey: { type: "string", required: true }, operation: { type: "string", required: true }, payloadHash: { type: "string", required: true }, result: { type: "json", required: true }, createdAt: date }, indexes: [{ name: "idx_mdfn_receipts_key", fields: ["documentId", "idempotencyKey"], unique: true }] },
    { modelName: COLLAB_UPDATES, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true }, authorId: { type: "string", required: true }, update: { type: "string", required: true }, createdAt: date }, indexes: [{ name: "idx_mdfn_collab_document", fields: ["documentId", "createdAt"] }] },
  ] };
}

export interface MdfnService {
  create(principal: MdfnPrincipal, input: { readonly id?: string; readonly title?: string; readonly markdown: string; readonly sidecar?: MdfnSidecar }): Promise<MdfnDocumentRecord>;
  read(principal: MdfnPrincipal, id: string): Promise<MdfnDocumentRecord>;
  list(principal: MdfnPrincipal, options?: { readonly limit?: number; readonly offset?: number }): Promise<readonly MdfnDocumentRecord[]>;
  update(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly markdown?: string; readonly title?: string; readonly sidecar?: MdfnSidecar; readonly changeSource?: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  delete(principal: MdfnPrincipal, id: string): Promise<void>;
  versions(principal: MdfnPrincipal, id: string): Promise<readonly MdfnVersionRecord[]>;
  version(principal: MdfnPrincipal, id: string, version: number): Promise<MdfnVersionRecord>;
  restoreVersion(principal: MdfnPrincipal, id: string, input: { readonly version: number; readonly expectedVersion: number; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  createComment(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly anchor: SidecarAnchor; readonly body: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  replyComment(principal: MdfnPrincipal, id: string, threadId: string, input: { readonly expectedVersion: number; readonly body: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  resolveComment(principal: MdfnPrincipal, id: string, threadId: string, input: { readonly expectedVersion: number; readonly resolved: boolean; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  createSuggestion(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly anchor: SidecarAnchor; readonly replacement: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  decideSuggestion(principal: MdfnPrincipal, id: string, suggestionId: string, input: { readonly expectedVersion: number; readonly decision: "accepted" | "rejected"; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  transitionReview(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly state: ReviewState; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  appendCollaborationUpdate(principal: MdfnPrincipal, id: string, update: string): Promise<string>;
  collaborationUpdates(principal: MdfnPrincipal, id: string): Promise<MdfnCollaborationUpdateBatch>;
  compactCollaborationUpdates(principal: MdfnPrincipal, id: string, snapshot: string, includedUpdateIds: readonly string[]): Promise<string>;
}

async function allowed(config: MdfnServerConfig, action: MdfnServerAction, principal: MdfnPrincipal, document?: MdfnDocumentRecord): Promise<void> {
  if (!(await config.authorize(action, principal, document))) throw new MdfnServerError("MDFN_FORBIDDEN", 403);
}

function whereId(id: string) { return [{ field: "id", operator: "eq" as const, value: id }]; }

export function createMdfnService(config: MdfnServerConfig): MdfnService {
  const database = wrapWithSchema(config.database, getSchema());
  if (!database.capabilities.transactions.supported && (config.durability ?? "required") === "required") {
    throw new MdfnServerError("MDFN_TRANSACTIONAL_DATABASE_REQUIRED", 500);
  }
  const registry = resolveExtensions(config.extensions ?? []);
  const markdownOptions: MarkdownOptions = { ...config.markdown, extensions: registry };
  const createId = config.createId ?? (() => crypto.randomUUID());
  const parse = (source: string, sidecar?: MdfnSidecar): void => {
    try {
      parseMarkdown(source, markdownOptions);
      validateMdfnSidecar(sidecar, { markdownLength: source.length });
    } catch {
      throw new MdfnServerError("MDFN_DOCUMENT_INVALID", 422);
    }
  };
  const load = async (id: string): Promise<MdfnDocumentRecord> => {
    const result = await database.findOne<MdfnDocumentRecord>({ model: DOCUMENTS, where: whereId(id) });
    if (!result) throw new MdfnServerError("MDFN_DOCUMENT_NOT_FOUND", 404);
    return result;
  };
  const loadScoped = async (principal: MdfnPrincipal, id: string): Promise<MdfnDocumentRecord> => {
    const document = await load(id);
    const inScope = principal.tenantId
      ? document.tenantId === principal.tenantId
      : document.tenantId === undefined && document.ownerId === principal.id;
    if (!inScope) throw new MdfnServerError("MDFN_DOCUMENT_NOT_FOUND", 404);
    return document;
  };
  const revision = (document: MdfnDocumentRecord, authorId: string, changeSource: string): MdfnVersionRecord => ({ ...document, id: `${document.id}:${document.version}`, documentId: document.id, authorId, changeSource });
  type Storage = Pick<Adapter, "create" | "findOne" | "update" | "delete" | "deleteMany">;
  const withStorage = <T>(callback: (storage: Storage) => Promise<T>): Promise<T> => database.capabilities.transactions.supported
    ? database.transaction((transaction) => callback(transaction))
    : callback(database);
  let service!: MdfnService;
  const editorialActor = (principal: MdfnPrincipal) => ({ id: principal.id, createId, now: () => new Date().toISOString() });
  type UpdateInput = Parameters<MdfnService["update"]>[2];
  type RestoreSnapshot = Pick<MdfnVersionRecord, "title" | "markdown" | "sidecar">;
  interface WriteUpdateOptions {
    readonly trustedEditorial?: boolean;
    readonly restoreSnapshot?: RestoreSnapshot;
    readonly idempotencyOperation?: string;
    readonly idempotencyPayload?: unknown;
  }
  const protectedSidecar = (value: MdfnSidecar | undefined): string => JSON.stringify({
    comments: value?.comments ?? [],
    suggestions: value?.suggestions ?? [],
    reviewState: value?.reviewState ?? "draft",
    audit: value?.audit ?? [],
  });
  const changedRanges = (previous: string, next: string): Array<{ from: number; to: number; insertedLength: number }> => {
    if (previous === next) return [];
    let prefix = 0;
    while (prefix < previous.length && prefix < next.length && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
    let previousEnd = previous.length;
    let nextEnd = next.length;
    while (previousEnd > prefix && nextEnd > prefix && previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)) { previousEnd -= 1; nextEnd -= 1; }
    const before = previous.slice(prefix, previousEnd);
    const after = next.slice(prefix, nextEnd);
    if (before.length * after.length > 250_000) return [{ from: prefix, to: previousEnd, insertedLength: after.length }];
    const width = after.length + 1;
    const lcs = new Uint32Array((before.length + 1) * width);
    for (let left = before.length - 1; left >= 0; left -= 1) {
      for (let right = after.length - 1; right >= 0; right -= 1) {
        const index = left * width + right;
        lcs[index] = before.charCodeAt(left) === after.charCodeAt(right)
          ? lcs[(left + 1) * width + right + 1] + 1
          : Math.max(lcs[(left + 1) * width + right], lcs[index + 1]);
      }
    }
    const ranges: Array<{ from: number; to: number; insertedLength: number }> = [];
    let left = 0;
    let right = 0;
    let position = prefix;
    while (left < before.length || right < after.length) {
      if (left < before.length && right < after.length && before.charCodeAt(left) === after.charCodeAt(right)) {
        left += 1; right += 1; position += 1; continue;
      }
      const from = position;
      let removed = 0;
      let insertedLength = 0;
      while (left < before.length || right < after.length) {
        if (left < before.length && right < after.length && before.charCodeAt(left) === after.charCodeAt(right)) break;
        if (right < after.length && (left === before.length || lcs[left * width + right + 1] >= lcs[(left + 1) * width + right])) {
          right += 1; insertedLength += 1;
        } else {
          left += 1; removed += 1;
        }
      }
      ranges.push({ from, to: from + removed, insertedLength });
      position += insertedLength;
    }
    return ranges;
  };
  const mapForMarkdownChange = (sidecar: MdfnSidecar | undefined, previous: string, next: string): MdfnSidecar | undefined => {
    if (!sidecar || previous === next) return sidecar;
    return mapSidecar(sidecar, changedRanges(previous, next));
  };
  interface Receipt { readonly operation: string; readonly payloadHash: string; readonly result: MdfnDocumentRecord; }
  const replayReceipt = async (storage: Storage, documentId: string, idempotencyKey: string, operation: string, payloadHash: string): Promise<MdfnDocumentRecord | undefined> => {
    const receipt = await storage.findOne<Receipt>({ model: RECEIPTS, where: [{ field: "documentId", operator: "eq", value: documentId }, { field: "idempotencyKey", operator: "eq", value: idempotencyKey }] });
    if (!receipt) return undefined;
    if (receipt.operation !== operation || receipt.payloadHash !== payloadHash) throw new MdfnServerError("MDFN_IDEMPOTENCY_KEY_REUSED", 409);
    return receipt.result;
  };
  const writeUpdate = async (principal: MdfnPrincipal, id: string, input: UpdateInput, options: WriteUpdateOptions = {}): Promise<MdfnDocumentRecord> => {
    const current = await loadScoped(principal, id);
    await allowed(config, "update", principal, current);
    const operation = options.idempotencyOperation ?? "document:update";
    const payloadHash = hashString(JSON.stringify(options.idempotencyPayload ?? { ...input, idempotencyKey: undefined, restoreSnapshot: options.restoreSnapshot }));
    if (input.idempotencyKey) {
      const replay = await replayReceipt(database, id, input.idempotencyKey, operation, payloadHash);
      if (replay) return replay;
    }
    if (current.version !== input.expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
    const markdown = options.restoreSnapshot?.markdown ?? input.markdown ?? current.markdown;
    if (!options.trustedEditorial && input.sidecar && protectedSidecar(input.sidecar) !== protectedSidecar(current.sidecar)) {
      throw new MdfnServerError("MDFN_EDITORIAL_MUTATION_FORBIDDEN", 403);
    }
    const sidecar = options.restoreSnapshot
      ? options.restoreSnapshot.sidecar
      : input.sidecar ?? mapForMarkdownChange(current.sidecar, current.markdown, markdown);
    parse(markdown, sidecar);
    const title = options.restoreSnapshot ? options.restoreSnapshot.title : input.title ?? current.title;
    const next: MdfnDocumentRecord = { ...current, title, markdown, sourceHash: hashString(markdown), schemaHash: registry.schemaHash, sidecar, version: current.version + 1, updatedAt: new Date() };
    return withStorage(async (storage) => {
      if (input.idempotencyKey) {
        const replay = await replayReceipt(storage, id, input.idempotencyKey, operation, payloadHash);
        if (replay) return replay;
      }
      const latest = await storage.findOne<MdfnDocumentRecord>({ model: DOCUMENTS, where: whereId(id) });
      if (!latest || latest.version !== input.expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
      const updated = await storage.update<MdfnDocumentRecord>({ model: DOCUMENTS, where: [{ field: "id", operator: "eq", value: id }, { field: "version", operator: "eq", value: input.expectedVersion }], data: next });
      await storage.create({ model: VERSIONS, data: revision(updated, principal.id, input.changeSource ?? "update") });
      if (input.idempotencyKey) await storage.create({ model: RECEIPTS, data: { id: createId(), documentId: id, idempotencyKey: input.idempotencyKey, operation, payloadHash, result: updated, createdAt: new Date() } });
      return updated;
    });
  };
  const mutateEditorial = async (
    principal: MdfnPrincipal,
    id: string,
    expectedVersion: number,
    changeSource: string,
    idempotencyKey: string | undefined,
    idempotencyPayload: unknown,
    mutate: (document: MdfnDocumentRecord) => { readonly markdown?: string; readonly sidecar: MdfnSidecar },
  ): Promise<MdfnDocumentRecord> => {
    const current = await loadScoped(principal, id);
    await allowed(config, "update", principal, current);
    if (idempotencyKey) {
      const replay = await replayReceipt(database, id, idempotencyKey, changeSource, hashString(JSON.stringify(idempotencyPayload)));
      if (replay) return replay;
    }
    if (current.version !== expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
    try {
      const next = mutate(current);
      return writeUpdate(principal, id, { expectedVersion, markdown: next.markdown, sidecar: next.sidecar, changeSource, idempotencyKey }, { trustedEditorial: true, idempotencyOperation: changeSource, idempotencyPayload });
    } catch (error) {
      if (error instanceof MdfnServerError) throw error;
      throw new MdfnServerError("MDFN_EDITORIAL_INVALID", 422);
    }
  };
  service = {
    async create(principal, input) {
      await allowed(config, "create", principal);
      parse(input.markdown, input.sidecar);
      if (input.sidecar && protectedSidecar(input.sidecar) !== protectedSidecar(undefined)) {
        throw new MdfnServerError("MDFN_EDITORIAL_MUTATION_FORBIDDEN", 403);
      }
      const now = new Date();
      const document: MdfnDocumentRecord = { id: input.id ?? createId(), ownerId: principal.id, tenantId: principal.tenantId, title: input.title, markdown: input.markdown, sourceHash: hashString(input.markdown), schemaHash: registry.schemaHash, sidecar: input.sidecar, version: 1, createdAt: now, updatedAt: now };
      return withStorage(async (storage) => {
        const created = await storage.create<MdfnDocumentRecord>({ model: DOCUMENTS, data: document });
        await storage.create({ model: VERSIONS, data: revision(created, principal.id, "create") });
        return created;
      });
    },
    async read(principal, id) { const document = await loadScoped(principal, id); await allowed(config, "read", principal, document); return document; },
    async list(principal, options = {}) {
      await allowed(config, "read", principal);
      const where = principal.tenantId ? [{ field: "tenantId", operator: "eq" as const, value: principal.tenantId }] : [{ field: "ownerId", operator: "eq" as const, value: principal.id }];
      const candidates = await database.findMany<MdfnDocumentRecord>({ model: DOCUMENTS, where, orderBy: [{ field: "updatedAt", direction: "desc" }] });
      const visible: MdfnDocumentRecord[] = [];
      for (const document of candidates) {
        if (!principal.tenantId && document.tenantId !== undefined && document.tenantId !== null) continue;
        if (await config.authorize("read", principal, document)) visible.push(document);
      }
      const offset = Math.max(0, options.offset ?? 0);
      const limit = Math.min(100, Math.max(1, options.limit ?? 50));
      return visible.slice(offset, offset + limit);
    },
    async update(principal, id, input) { return writeUpdate(principal, id, input); },
    async delete(principal, id) {
      const current = await loadScoped(principal, id);
      await allowed(config, "delete", principal, current);
      await withStorage(async (storage) => {
        const documentWhere = [{ field: "documentId", operator: "eq" as const, value: id }];
        await storage.deleteMany({ model: COLLAB_UPDATES, where: documentWhere });
        await storage.deleteMany({ model: RECEIPTS, where: documentWhere });
        await storage.deleteMany({ model: VERSIONS, where: documentWhere });
        await storage.delete({ model: DOCUMENTS, where: whereId(id) });
      });
    },
    async versions(principal, id) { const document = await loadScoped(principal, id); await allowed(config, "history", principal, document); return database.findMany<MdfnVersionRecord>({ model: VERSIONS, where: [{ field: "documentId", operator: "eq", value: id }], orderBy: [{ field: "version", direction: "desc" }] }); },
    async version(principal, id, version) { const document = await loadScoped(principal, id); await allowed(config, "history", principal, document); const result = await database.findOne<MdfnVersionRecord>({ model: VERSIONS, where: [{ field: "documentId", operator: "eq", value: id }, { field: "version", operator: "eq", value: version }] }); if (!result) throw new MdfnServerError("MDFN_VERSION_NOT_FOUND", 404); return result; },
    async restoreVersion(principal, id, input) {
      const restored = await service.version(principal, id, input.version);
      return writeUpdate(
        principal,
        id,
        { expectedVersion: input.expectedVersion, changeSource: `restore:${input.version}`, idempotencyKey: input.idempotencyKey },
        { trustedEditorial: true, restoreSnapshot: restored, idempotencyOperation: "document:restore", idempotencyPayload: input },
      );
    },
    async createComment(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "editorial:comment-created", input.idempotencyKey, input, (document) => createCommentThread({ sidecar: document.sidecar, anchor: input.anchor, body: input.body, actor: editorialActor(principal), markdownLength: document.markdown.length }));
    },
    async replyComment(principal, id, threadId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "editorial:comment-replied", input.idempotencyKey, { threadId, ...input }, (document) => ({ sidecar: replyToComment({ sidecar: document.sidecar ?? {}, threadId, body: input.body, actor: editorialActor(principal) }) }));
    },
    async resolveComment(principal, id, threadId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, input.resolved ? "editorial:comment-resolved" : "editorial:comment-reopened", input.idempotencyKey, { threadId, ...input }, (document) => ({ sidecar: setCommentResolved({ sidecar: document.sidecar ?? {}, threadId, resolved: input.resolved, actor: editorialActor(principal) }) }));
    },
    async createSuggestion(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "editorial:suggestion-created", input.idempotencyKey, input, (document) => createSuggestion({ sidecar: document.sidecar, anchor: input.anchor, replacement: input.replacement, actor: editorialActor(principal), markdownLength: document.markdown.length }));
    },
    async decideSuggestion(principal, id, suggestionId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, `editorial:suggestion-${input.decision}`, input.idempotencyKey, { suggestionId, ...input }, (document) => {
        const controller = createEditor({ markdown: document.markdown, projector: createMarkdownProjector(markdownOptions), extensions: config.extensions, sidecar: document.sidecar });
        try {
          decideSuggestion({ controller, suggestionId, decision: input.decision, actor: editorialActor(principal) });
          const state = controller.getState();
          return { markdown: state.markdown, sidecar: state.sidecar ?? {} };
        } finally { controller.destroy(); }
      });
    },
    async transitionReview(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "editorial:review-transitioned", input.idempotencyKey, input, (document) => ({ sidecar: transitionReview({ sidecar: document.sidecar, to: input.state, actor: editorialActor(principal) }) }));
    },
    async appendCollaborationUpdate(principal, id, update) { const document = await loadScoped(principal, id); await allowed(config, "collaborate", principal, document); const limit = config.maxCollaborationUpdateBytes ?? 1024 * 1024; if (new TextEncoder().encode(update).byteLength > limit) throw new MdfnServerError("MDFN_COLLAB_UPDATE_TOO_LARGE", 413); const updateId = createId(); await database.create({ model: COLLAB_UPDATES, data: { id: updateId, documentId: id, authorId: principal.id, update, createdAt: new Date() } }); return updateId; },
    async collaborationUpdates(principal, id) {
      const document = await loadScoped(principal, id);
      await allowed(config, "collaborate", principal, document);
      const rows = await database.findMany<{ id: string; update: string }>({ model: COLLAB_UPDATES, where: [{ field: "documentId", operator: "eq", value: id }], orderBy: [{ field: "createdAt", direction: "asc" }] });
      return { updates: rows.map((row) => row.update), includedUpdateIds: rows.map((row) => row.id) };
    },
    async compactCollaborationUpdates(principal, id, snapshot, includedUpdateIds) {
      const document = await loadScoped(principal, id);
      await allowed(config, "compact-collaboration", principal, document);
      const limit = config.maxCollaborationUpdateBytes ?? 1024 * 1024;
      if (new TextEncoder().encode(snapshot).byteLength > limit) throw new MdfnServerError("MDFN_COLLAB_UPDATE_TOO_LARGE", 413);
      if (!Array.isArray(includedUpdateIds) || includedUpdateIds.some((updateId) => typeof updateId !== "string" || !updateId)) {
        throw new MdfnServerError("MDFN_COLLAB_COMPACTION_INVALID", 422);
      }
      const uniqueUpdateIds = [...new Set(includedUpdateIds)];
      const updateId = createId();
      await withStorage(async (storage) => {
        if (uniqueUpdateIds.length > 0) {
          await storage.deleteMany({ model: COLLAB_UPDATES, where: [{ field: "documentId", operator: "eq", value: id }, { field: "id", operator: "in", value: uniqueUpdateIds }] });
        }
        await storage.create({ model: COLLAB_UPDATES, data: { id: updateId, documentId: id, authorId: principal.id, update: snapshot, createdAt: new Date() } });
      });
      return updateId;
    },
  };
  return service;
}

function etag(document: MdfnDocumentRecord): string { return `\"mdfn-${document.version}-${document.sourceHash}\"`; }
function response(document: MdfnDocumentRecord, status = 200): Response { return Response.json(document, { status, headers: { ETag: etag(document), "Cache-Control": "no-store" } }); }
function idempotent<T extends { readonly idempotencyKey?: string }>(request: Request, body: T): T {
  return { ...body, idempotencyKey: body.idempotencyKey ?? request.headers.get("Idempotency-Key") ?? undefined };
}

export function createMdfnRouter(config: MdfnServerConfig, service = createMdfnService(config)): Router<{ principal: MdfnPrincipal }> {
  const principal = config.resolvePrincipal ?? (() => { throw new MdfnServerError("MDFN_UNAUTHENTICATED", 401); });
  return createRouter({
    basePath: config.basePath ?? "/api/mdfn",
    context: async (request) => ({ principal: await principal(request) }),
    onError: (error) => error instanceof MdfnServerError ? Response.json({ error: error.code }, { status: error.status }) : Response.json({ error: "MDFN_INTERNAL_ERROR" }, { status: 500 }),
    routes: [
      { method: "GET", path: "/documents", handler: (_request, context) => service.list(context.principal, { limit: Number(context.query.get("limit") ?? 50), offset: Number(context.query.get("offset") ?? 0) }).then((documents) => Response.json({ documents })) },
      { method: "POST", path: "/documents", handler: async (_request, context) => response(await service.create(context.principal, await context.json()), 201) },
      { method: "GET", path: "/documents/:id", handler: async (_request, context) => response(await service.read(context.principal, context.params.id!)) },
      { method: "PATCH", path: "/documents/:id", handler: async (request, context) => response(await service.update(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "DELETE", path: "/documents/:id", handler: async (_request, context) => { await service.delete(context.principal, context.params.id!); return new Response(null, { status: 204 }); } },
      { method: "GET", path: "/documents/:id/versions", handler: async (_request, context) => Response.json({ versions: await service.versions(context.principal, context.params.id!) }) },
      { method: "GET", path: "/documents/:id/versions/:version", handler: async (_request, context) => Response.json(await service.version(context.principal, context.params.id!, Number(context.params.version))) },
      { method: "POST", path: "/documents/:id/restore", handler: async (request, context) => response(await service.restoreVersion(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "GET", path: "/documents/:id/sidecar", handler: async (_request, context) => Response.json((await service.read(context.principal, context.params.id!)).sidecar ?? {}) },
      { method: "PUT", path: "/documents/:id/sidecar", handler: async (request, context) => { const body = idempotent(request, await context.json<{ expectedVersion: number; sidecar: MdfnSidecar; idempotencyKey?: string }>()); return response(await service.update(context.principal, context.params.id!, { ...body, changeSource: "sidecar" })); } },
      { method: "GET", path: "/documents/:id/audit", handler: async (_request, context) => Response.json({ audit: (await service.read(context.principal, context.params.id!)).sidecar?.audit ?? [] }) },
      { method: "POST", path: "/documents/:id/comments", handler: async (request, context) => response(await service.createComment(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "POST", path: "/documents/:id/comments/:threadId/replies", handler: async (request, context) => response(await service.replyComment(context.principal, context.params.id!, context.params.threadId!, idempotent(request, await context.json()))) },
      { method: "PATCH", path: "/documents/:id/comments/:threadId", handler: async (request, context) => response(await service.resolveComment(context.principal, context.params.id!, context.params.threadId!, idempotent(request, await context.json()))) },
      { method: "POST", path: "/documents/:id/suggestions", handler: async (request, context) => response(await service.createSuggestion(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "PATCH", path: "/documents/:id/suggestions/:suggestionId", handler: async (request, context) => response(await service.decideSuggestion(context.principal, context.params.id!, context.params.suggestionId!, idempotent(request, await context.json()))) },
      { method: "PUT", path: "/documents/:id/review", handler: async (request, context) => response(await service.transitionReview(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "GET", path: "/documents/:id/collaboration-updates", handler: async (_request, context) => Response.json(await service.collaborationUpdates(context.principal, context.params.id!)) },
      { method: "POST", path: "/documents/:id/collaboration-updates", handler: async (_request, context) => { const body = await context.json<{ update: string }>(); return Response.json({ id: await service.appendCollaborationUpdate(context.principal, context.params.id!, body.update) }, { status: 201 }); } },
      { method: "PUT", path: "/documents/:id/collaboration-updates/compact", handler: async (_request, context) => { const body = await context.json<{ snapshot: string; includedUpdateIds: string[] }>(); return Response.json({ id: await service.compactCollaborationUpdates(context.principal, context.params.id!, body.snapshot, body.includedUpdateIds) }); } },
    ],
  });
}

export function createMdfnServer(config: MdfnServerConfig): { readonly service: MdfnService; readonly router: Router<{ principal: MdfnPrincipal }>; readonly schema: ReturnType<typeof getSchema> } {
  const service = createMdfnService(config);
  return { service, router: createMdfnRouter(config, service), schema: getSchema() };
}

export const MDFN_SERVER_VERSION = "0.1.0" as const;
