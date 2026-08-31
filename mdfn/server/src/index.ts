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
import { createRouter, RouterError, type Router } from "@superfunctions/http";

const DOCUMENTS = "mdfnDocuments";
const VERSIONS = "mdfnVersions";
const RECEIPTS = "mdfnReceipts";
const COLLAB_UPDATES = "mdfnCollaborationUpdates";
export const MDFN_SERVER_SCHEMA_VERSION = 1;

export interface MdfnPrincipal { readonly id: string; readonly tenantId?: string; readonly roles?: readonly string[]; }
export type MdfnServerAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "history"
  | "history:restore"
  | "collaborate"
  | "compact-collaboration"
  | "comment:create"
  | "comment:reply"
  | "comment:resolve"
  | "suggestion:create"
  | "suggestion:decide"
  | "review:transition";

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

export type MdfnVersionSummary = Omit<MdfnVersionRecord, "markdown" | "sidecar">;

export interface MdfnVersionBatch {
  readonly versions: readonly MdfnVersionSummary[];
  readonly nextCursor?: string;
}

export interface MdfnCollaborationUpdateBatch {
  readonly updates: readonly string[];
  /** Exact persisted update ids represented by `updates` and therefore safe to compact. */
  readonly includedUpdateIds: readonly string[];
  /** Opaque continuation for the next bounded batch, when more updates remain. */
  readonly nextCursor?: string;
}

export interface MdfnServerConfig {
  readonly database: Adapter;
  readonly authorize: (action: MdfnServerAction, principal: MdfnPrincipal, document?: MdfnDocumentRecord) => boolean | Promise<boolean>;
  readonly resolvePrincipal?: (request: Request) => MdfnPrincipal | Promise<MdfnPrincipal>;
  readonly extensions?: readonly MdfnExtension[];
  readonly markdown?: MarkdownOptions;
  readonly basePath?: string;
  readonly createId?: () => string;
  /** Injectable clock for deterministic hosts and tests. */
  readonly now?: () => Date;
  readonly maxCollaborationUpdateBytes?: number;
  readonly maxCollaborationBatchBytes?: number;
  readonly maxCollaborationBatchUpdates?: number;
  /** Maximum encoded request body accepted by JSON-writing routes. */
  readonly maxRequestBodyBytes?: number;
  /** Maximum UTF-8 bytes accepted for a persisted document title. */
  readonly maxTitleBytes?: number;
  /** Durable storage requires adapter transactions. Ephemeral is intended only for in-memory/test hosts. */
  readonly durability?: "required" | "ephemeral";
}

export class MdfnServerError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) { super(message); this.name = "MdfnServerError"; }
}

function configuredDocumentBytes(config: MdfnServerConfig): number {
  return config.markdown?.maxBytes ?? 2 * 1024 * 1024;
}

function configuredCollaborationUpdateBytes(config: MdfnServerConfig): number {
  if (config.maxCollaborationUpdateBytes !== undefined) return config.maxCollaborationUpdateBytes;
  const documentBytes = configuredDocumentBytes(config);
  const yjsOverhead = Math.max(64 * 1024, Math.ceil(documentBytes / 16));
  return 4 * Math.ceil((documentBytes + yjsOverhead) / 3);
}

interface CollaborationCursor {
  readonly documentId: string;
  readonly key: string;
}

function collaborationCursorKey(previousKey?: string): string {
  const match = previousKey?.match(/^v2:(\d{20})$/);
  if (previousKey?.startsWith("v2:") && !match) throw new MdfnServerError("MDFN_COLLAB_CURSOR_INVALID", 500);
  const sequence = (match ? BigInt(match[1]) : 0n) + 1n;
  const encoded = sequence.toString().padStart(20, "0");
  if (encoded.length > 20) throw new MdfnServerError("MDFN_COLLAB_CURSOR_EXHAUSTED", 500);
  return `v2:${encoded}`;
}

function isUniqueConflict(error: unknown): boolean {
  const value = error as { readonly code?: unknown; readonly message?: unknown; readonly cause?: unknown };
  const cause = value?.cause as { readonly code?: unknown; readonly message?: unknown } | undefined;
  return /(?:unique|duplicate|23505|p2002)/i.test([value?.code, value?.message, cause?.code, cause?.message].filter(Boolean).join(" "));
}

function encodeCollaborationCursor(documentId: string, key: string): string {
  return encodeURIComponent(JSON.stringify({ documentId, key }));
}

function decodeCollaborationCursor(cursor: string, documentId: string): string {
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as Partial<CollaborationCursor>;
    if (parsed.documentId !== documentId || typeof parsed.key !== "string" || !parsed.key) {
      throw new Error("invalid cursor");
    }
    return parsed.key;
  } catch {
    throw new MdfnServerError("MDFN_COLLAB_CURSOR_INVALID", 422);
  }
}

export function getSchema(): { version: number; schemas: TableSchema[] } {
  const date = { type: "date" as const, required: true, dateValueType: "date" as const };
  return { version: MDFN_SERVER_SCHEMA_VERSION, schemas: [
    { modelName: DOCUMENTS, fields: { id: { type: "string", required: true }, ownerId: { type: "string", required: true }, tenantId: { type: "string" }, title: { type: "string" }, markdown: { type: "string", required: true }, sourceHash: { type: "string", required: true }, schemaHash: { type: "string", required: true }, sidecar: { type: "json" }, version: { type: "number", required: true }, createdAt: date, updatedAt: date }, indexes: [{ name: "idx_mdfn_documents_owner", fields: ["ownerId"] }, { name: "idx_mdfn_documents_tenant", fields: ["tenantId"] }] },
    { modelName: VERSIONS, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true }, ownerId: { type: "string", required: true }, tenantId: { type: "string" }, title: { type: "string" }, markdown: { type: "string", required: true }, sourceHash: { type: "string", required: true }, schemaHash: { type: "string", required: true }, sidecar: { type: "json" }, version: { type: "number", required: true }, authorId: { type: "string", required: true }, changeSource: { type: "string", required: true }, createdAt: date, updatedAt: date }, indexes: [{ name: "idx_mdfn_versions_document_version", fields: ["documentId", "version"], unique: true }] },
    { modelName: RECEIPTS, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true }, idempotencyKey: { type: "string", required: true }, operation: { type: "string", required: true }, payloadHash: { type: "string", required: true }, result: { type: "json", required: true }, createdAt: date }, indexes: [{ name: "idx_mdfn_receipts_key", fields: ["documentId", "idempotencyKey"], unique: true }] },
    { modelName: COLLAB_UPDATES, fields: { id: { type: "string", required: true }, documentId: { type: "string", required: true, references: { model: DOCUMENTS, field: "id", onDelete: "cascade" } }, authorId: { type: "string", required: true }, update: { type: "string", required: true }, cursorKey: { type: "string", required: true }, createdAt: date }, indexes: [{ name: "idx_mdfn_collab_document_cursor", fields: ["documentId", "cursorKey"], unique: true }] },
  ] };
}

export interface MdfnService {
  create(principal: MdfnPrincipal, input: { readonly id?: string; readonly title?: string; readonly markdown: string; readonly sidecar?: MdfnSidecar }): Promise<MdfnDocumentRecord>;
  read(principal: MdfnPrincipal, id: string): Promise<MdfnDocumentRecord>;
  list(principal: MdfnPrincipal, options?: { readonly limit?: number; readonly offset?: number }): Promise<readonly MdfnDocumentRecord[]>;
  update(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly markdown?: string; readonly title?: string; readonly sidecar?: MdfnSidecar; readonly changeSource?: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  delete(principal: MdfnPrincipal, id: string): Promise<void>;
  versions(
    principal: MdfnPrincipal,
    id: string,
    options?: { readonly cursor?: string; readonly limit?: number },
  ): Promise<MdfnVersionBatch>;
  version(principal: MdfnPrincipal, id: string, version: number): Promise<MdfnVersionRecord>;
  restoreVersion(principal: MdfnPrincipal, id: string, input: { readonly version: number; readonly expectedVersion: number; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  createComment(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly anchor: SidecarAnchor; readonly body: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  replyComment(principal: MdfnPrincipal, id: string, threadId: string, input: { readonly expectedVersion: number; readonly body: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  resolveComment(principal: MdfnPrincipal, id: string, threadId: string, input: { readonly expectedVersion: number; readonly resolved: boolean; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  createSuggestion(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly anchor: SidecarAnchor; readonly replacement: string; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  decideSuggestion(principal: MdfnPrincipal, id: string, suggestionId: string, input: { readonly expectedVersion: number; readonly decision: "accepted" | "rejected"; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  transitionReview(principal: MdfnPrincipal, id: string, input: { readonly expectedVersion: number; readonly state: ReviewState; readonly idempotencyKey?: string }): Promise<MdfnDocumentRecord>;
  appendCollaborationUpdate(principal: MdfnPrincipal, id: string, update: string): Promise<string>;
  collaborationUpdates(
    principal: MdfnPrincipal,
    id: string,
    options?: { readonly cursor?: string; readonly limit?: number },
  ): Promise<MdfnCollaborationUpdateBatch>;
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
  const now = config.now ?? (() => new Date());
  const collaborationUpdateBytes = configuredCollaborationUpdateBytes(config);
  const collaborationBatchBytes = Math.max(
    collaborationUpdateBytes,
    config.maxCollaborationBatchBytes ?? collaborationUpdateBytes * 4,
  );
  const collaborationBatchUpdates = Math.min(1_000, Math.max(1, config.maxCollaborationBatchUpdates ?? 100));
  const parse = (source: string, sidecar?: MdfnSidecar): void => {
    try {
      parseMarkdown(source, markdownOptions);
      validateMdfnSidecar(sidecar, { markdownLength: source.length });
    } catch {
      throw new MdfnServerError("MDFN_DOCUMENT_INVALID", 422);
    }
  };
  type Storage = Pick<Adapter, "create" | "findOne" | "findMany" | "update" | "delete" | "deleteMany">;
  const loadFrom = async (storage: Pick<Adapter, "findOne">, id: string): Promise<MdfnDocumentRecord> => {
    const result = await storage.findOne<MdfnDocumentRecord>({ model: DOCUMENTS, where: whereId(id) });
    if (!result) throw new MdfnServerError("MDFN_DOCUMENT_NOT_FOUND", 404);
    return result;
  };
  const load = (id: string): Promise<MdfnDocumentRecord> => loadFrom(database, id);
  const loadScopedFrom = async (storage: Pick<Adapter, "findOne">, principal: MdfnPrincipal, id: string): Promise<MdfnDocumentRecord> => {
    const document = await loadFrom(storage, id);
    const inScope = principal.tenantId
      ? document.tenantId === principal.tenantId
      : document.tenantId === undefined && document.ownerId === principal.id;
    if (!inScope) throw new MdfnServerError("MDFN_DOCUMENT_NOT_FOUND", 404);
    return document;
  };
  const loadScoped = (principal: MdfnPrincipal, id: string): Promise<MdfnDocumentRecord> => loadScopedFrom(database, principal, id);
  const revision = (document: MdfnDocumentRecord, authorId: string, changeSource: string): MdfnVersionRecord => ({ ...document, id: `${document.id}:${document.version}`, documentId: document.id, authorId, changeSource });
  const withStorage = <T>(callback: (storage: Storage) => Promise<T>): Promise<T> => database.capabilities.transactions.supported
    ? database.transaction((transaction) => callback(transaction))
    : callback(database);
  const collaborationWriteTails = new Map<string, Promise<void>>();
  const serializeCollaborationWrite = async <T>(documentId: string, callback: () => Promise<T>): Promise<T> => {
    const previous = collaborationWriteTails.get(documentId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    collaborationWriteTails.set(documentId, tail);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (collaborationWriteTails.get(documentId) === tail) collaborationWriteTails.delete(documentId);
    }
  };
  const withCollaborationWrite = <T>(
    documentId: string,
    callback: (storage: Storage, cursorKey: string) => Promise<T>,
    revalidate?: () => Promise<void>,
    revalidateStoredDocument?: (storage: Storage) => Promise<void>,
  ): Promise<T> => (
    serializeCollaborationWrite(documentId, async () => {
      await revalidate?.();
      let lastConflict: unknown;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await withStorage(async (storage) => {
            await revalidateStoredDocument?.(storage);
            const latest = await storage.findMany<{ readonly cursorKey: string }>({
              model: COLLAB_UPDATES,
              where: [{ field: "documentId", operator: "eq", value: documentId }],
              select: ["cursorKey"],
              orderBy: [{ field: "cursorKey", direction: "desc" }],
              limit: 1,
            });
            return callback(storage, collaborationCursorKey(latest[0]?.cursorKey));
          });
        } catch (error) {
          if (!isUniqueConflict(error)) throw error;
          lastConflict = error;
        }
      }
      throw lastConflict;
    })
  );
  let service!: MdfnService;
  const editorialActor = (principal: MdfnPrincipal) => ({ id: principal.id, createId, now: () => now().toISOString() });
  const maxTitleBytes = config.maxTitleBytes ?? 512;
  if (!Number.isSafeInteger(maxTitleBytes) || maxTitleBytes < 1) {
    throw new MdfnServerError("MDFN_TITLE_LIMIT_INVALID", 500);
  }
  const validateTitle = (title: string | undefined): void => {
    if (title !== undefined && new TextEncoder().encode(title).byteLength > maxTitleBytes) {
      throw new MdfnServerError("MDFN_TITLE_TOO_LARGE", 413);
    }
  };
  type UpdateInput = Parameters<MdfnService["update"]>[2];
  type RestoreSnapshot = Pick<MdfnVersionRecord, "title" | "markdown" | "sidecar">;
  interface WriteUpdateOptions {
    readonly trustedEditorial?: boolean;
    readonly authorizationAction?: MdfnServerAction;
    readonly restoreSnapshot?: RestoreSnapshot;
    readonly idempotencyOperation?: string;
    readonly idempotencyPayload?: unknown;
  }
  const canonicalJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  };
  const hashValue = (value: unknown): string => hashString(JSON.stringify(canonicalJson(value)));
  const protectedSidecar = (value: MdfnSidecar | undefined): string => JSON.stringify(canonicalJson({
    comments: value?.comments ?? [],
    suggestions: value?.suggestions ?? [],
    reviewState: value?.reviewState ?? "draft",
    audit: value?.audit ?? [],
  }));
  const coarseChangedRanges = (before: string, after: string, offset: number): Array<{ from: number; to: number; insertedLength: number }> => {
    const ranges: Array<{ from: number; to: number; insertedLength: number }> = [];
    const syncLength = 16;
    const initialLookahead = 2_048;
    let remainingSearchWork = 65_536;
    let left = 0;
    let right = 0;
    let position = offset;
    while (left < before.length || right < after.length) {
      while (left < before.length && right < after.length && before.charCodeAt(left) === after.charCodeAt(right)) {
        left += 1;
        right += 1;
        position += 1;
      }
      if (left === before.length && right === after.length) break;
      const from = position;
      let match: { left: number; right: number; cost: number } | undefined;
      let lookahead = initialLookahead;
      const beforeAnchors = new Map<string, number>();
      const afterAnchors = new Map<string, number>();
      let beforeScannedTo = left - 1;
      let afterScannedTo = right - 1;
      while (!match) {
        const beforeLimit = Math.min(before.length - syncLength, left + lookahead);
        for (let candidate = beforeScannedTo + 1; candidate <= beforeLimit; candidate += 1) {
          if (remainingSearchWork === 0) break;
          remainingSearchWork -= 1;
          const key = before.slice(candidate, candidate + syncLength);
          if (!beforeAnchors.has(key)) beforeAnchors.set(key, candidate);
          const matchingRight = afterAnchors.get(key);
          if (matchingRight !== undefined) {
            const cost = candidate - left + matchingRight - right;
            if (!match || cost < match.cost) match = { left: candidate, right: matchingRight, cost };
          }
          beforeScannedTo = candidate;
        }
        const afterLimit = Math.min(after.length - syncLength, right + lookahead);
        for (let candidate = afterScannedTo + 1; candidate <= afterLimit; candidate += 1) {
          if (remainingSearchWork === 0) break;
          remainingSearchWork -= 1;
          const key = after.slice(candidate, candidate + syncLength);
          if (!afterAnchors.has(key)) afterAnchors.set(key, candidate);
          const matchingLeft = beforeAnchors.get(key);
          if (matchingLeft !== undefined) {
            const cost = matchingLeft - left + candidate - right;
            if (!match || cost < match.cost) match = { left: matchingLeft, right: candidate, cost };
          }
          afterScannedTo = candidate;
        }
        const searchedAllBefore = before.length - left < syncLength || beforeScannedTo >= before.length - syncLength;
        const searchedAllAfter = after.length - right < syncLength || afterScannedTo >= after.length - syncLength;
        if (match || remainingSearchWork === 0 || (searchedAllBefore && searchedAllAfter)) break;
        lookahead = Math.min(
          Math.max(before.length - left, after.length - right),
          lookahead * 2,
        );
      }
      if (!match || match.cost === 0) {
        ranges.push({ from, to: from + before.length - left, insertedLength: after.length - right });
        break;
      }
      const removed = match.left - left;
      const insertedLength = match.right - right;
      ranges.push({ from, to: from + removed, insertedLength });
      left = match.left;
      right = match.right;
      position += insertedLength;
    }
    return ranges;
  };
  const changedRanges = (previous: string, next: string): Array<{ from: number; to: number; insertedLength: number }> => {
    if (previous === next) return [];
    let prefix = 0;
    while (prefix < previous.length && prefix < next.length && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
    let previousEnd = previous.length;
    let nextEnd = next.length;
    while (previousEnd > prefix && nextEnd > prefix && previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)) { previousEnd -= 1; nextEnd -= 1; }
    const before = previous.slice(prefix, previousEnd);
    const after = next.slice(prefix, nextEnd);
    if (before.length * after.length > 250_000) return coarseChangedRanges(before, after, prefix);
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
    await allowed(config, options.authorizationAction ?? "update", principal, current);
    const operation = options.idempotencyOperation ?? "document:update";
    const payloadHash = hashValue(options.idempotencyPayload ?? {
      ...input,
      idempotencyKey: undefined,
      restoreSnapshot: options.restoreSnapshot,
    });
    if (input.idempotencyKey) {
      const replay = await replayReceipt(database, id, input.idempotencyKey, operation, payloadHash);
      if (replay) return replay;
    }
    if (current.version !== input.expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
    const markdown = options.restoreSnapshot?.markdown ?? input.markdown ?? current.markdown;
    if (!options.trustedEditorial && input.sidecar && protectedSidecar(input.sidecar) !== protectedSidecar(current.sidecar)) {
      throw new MdfnServerError("MDFN_EDITORIAL_MUTATION_FORBIDDEN", 403);
    }
    const mappedSidecar = mapForMarkdownChange(current.sidecar, current.markdown, markdown);
    const sidecar = options.restoreSnapshot
      ? options.restoreSnapshot.sidecar
      : options.trustedEditorial
        ? input.sidecar ?? mappedSidecar
      : input.sidecar
        ? {
            ...input.sidecar,
            comments: mappedSidecar?.comments,
            suggestions: mappedSidecar?.suggestions,
            reviewState: mappedSidecar?.reviewState,
            audit: mappedSidecar?.audit,
          }
        : mappedSidecar;
    parse(markdown, sidecar);
    const title = options.restoreSnapshot ? options.restoreSnapshot.title : input.title ?? current.title;
    validateTitle(title);
    const next: MdfnDocumentRecord = { ...current, title, markdown, sourceHash: hashString(markdown), schemaHash: registry.schemaHash, sidecar, version: current.version + 1, updatedAt: now() };
    return withStorage(async (storage) => {
      if (input.idempotencyKey) {
        const replay = await replayReceipt(storage, id, input.idempotencyKey, operation, payloadHash);
        if (replay) return replay;
      }
      const latest = await storage.findOne<MdfnDocumentRecord>({ model: DOCUMENTS, where: whereId(id) });
      if (!latest || latest.version !== input.expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
      const updated = await storage.update<MdfnDocumentRecord>({ model: DOCUMENTS, where: [{ field: "id", operator: "eq", value: id }, { field: "version", operator: "eq", value: input.expectedVersion }], data: next });
      await storage.create({ model: VERSIONS, data: revision(updated, principal.id, input.changeSource ?? "update") });
      if (input.idempotencyKey) await storage.create({ model: RECEIPTS, data: { id: createId(), documentId: id, idempotencyKey: input.idempotencyKey, operation, payloadHash, result: updated, createdAt: now() } });
      return updated;
    });
  };
  const mutateEditorial = async (
    principal: MdfnPrincipal,
    id: string,
    expectedVersion: number,
    authorizationAction: MdfnServerAction,
    changeSource: string,
    idempotencyKey: string | undefined,
    idempotencyPayload: unknown,
    mutate: (document: MdfnDocumentRecord) => { readonly markdown?: string; readonly sidecar: MdfnSidecar },
  ): Promise<MdfnDocumentRecord> => {
    const current = await loadScoped(principal, id);
    await allowed(config, authorizationAction, principal, current);
    if (idempotencyKey) {
      const replay = await replayReceipt(database, id, idempotencyKey, changeSource, hashValue(idempotencyPayload));
      if (replay) return replay;
    }
    if (current.version !== expectedVersion) throw new MdfnServerError("MDFN_VERSION_CONFLICT", 409);
    try {
      const next = mutate(current);
      return writeUpdate(principal, id, { expectedVersion, markdown: next.markdown, sidecar: next.sidecar, changeSource, idempotencyKey }, { trustedEditorial: true, authorizationAction, idempotencyOperation: changeSource, idempotencyPayload });
    } catch (error) {
      if (error instanceof MdfnServerError) throw error;
      throw new MdfnServerError("MDFN_EDITORIAL_INVALID", 422);
    }
  };
  service = {
    async create(principal, input) {
      await allowed(config, "create", principal);
      parse(input.markdown, input.sidecar);
      validateTitle(input.title);
      if (input.sidecar && protectedSidecar(input.sidecar) !== protectedSidecar(undefined)) {
        throw new MdfnServerError("MDFN_EDITORIAL_MUTATION_FORBIDDEN", 403);
      }
      const createdAt = now();
      const document: MdfnDocumentRecord = { id: input.id ?? createId(), ownerId: principal.id, tenantId: principal.tenantId, title: input.title, markdown: input.markdown, sourceHash: hashString(input.markdown), schemaHash: registry.schemaHash, sidecar: input.sidecar, version: 1, createdAt, updatedAt: createdAt };
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
      const offset = Math.max(0, options.offset ?? 0);
      const limit = Math.min(100, Math.max(1, options.limit ?? 50));
      const pageSize = Math.max(25, limit);
      const visible: MdfnDocumentRecord[] = [];
      let databaseOffset = 0;
      let authorizedOffset = 0;
      while (visible.length < limit) {
        const candidates = await database.findMany<MdfnDocumentRecord>({
          model: DOCUMENTS,
          where,
          orderBy: [{ field: "updatedAt", direction: "desc" }, { field: "id", direction: "desc" }],
          limit: pageSize,
          offset: databaseOffset,
        });
        databaseOffset += candidates.length;
        for (const document of candidates) {
          if (!principal.tenantId && document.tenantId !== undefined && document.tenantId !== null) continue;
          if (!(await config.authorize("read", principal, document))) continue;
          if (authorizedOffset < offset) {
            authorizedOffset += 1;
            continue;
          }
          visible.push(document);
          if (visible.length === limit) break;
        }
        if (candidates.length < pageSize) break;
      }
      return visible;
    },
    async update(principal, id, input) { return writeUpdate(principal, id, input); },
    async delete(principal, id) {
      await serializeCollaborationWrite(id, async () => {
        const current = await loadScoped(principal, id);
        await allowed(config, "delete", principal, current);
        await withStorage(async (storage) => {
          const documentWhere = [{ field: "documentId", operator: "eq" as const, value: id }];
          await storage.deleteMany({ model: COLLAB_UPDATES, where: documentWhere });
          await storage.deleteMany({ model: RECEIPTS, where: documentWhere });
          await storage.deleteMany({ model: VERSIONS, where: documentWhere });
          await storage.delete({ model: DOCUMENTS, where: whereId(id) });
        });
      });
    },
    async versions(principal, id, options = {}) {
      const document = await loadScoped(principal, id);
      await allowed(config, "history", principal, document);
      const cursor = options.cursor === undefined ? undefined : Number(options.cursor);
      const requestedLimit = options.limit ?? 50;
      if ((cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 1)) ||
        !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
        throw new MdfnServerError("MDFN_VERSION_CURSOR_INVALID", 422);
      }
      const limit = Math.min(100, requestedLimit);
      const where = [
        { field: "documentId", operator: "eq" as const, value: id },
        ...(cursor === undefined ? [] : [{ field: "version", operator: "lt" as const, value: cursor }]),
      ];
      const rows = await database.findMany<MdfnVersionSummary>({
        model: VERSIONS,
        where,
        select: [
          "id", "documentId", "ownerId", "tenantId", "title", "sourceHash", "schemaHash",
          "version", "authorId", "changeSource", "createdAt", "updatedAt",
        ],
        orderBy: [{ field: "version", direction: "desc" }],
        limit: limit + 1,
      });
      const versions = rows.slice(0, limit);
      return {
        versions,
        ...(rows.length > limit ? { nextCursor: String(versions.at(-1)!.version) } : {}),
      };
    },
    async version(principal, id, version) { const document = await loadScoped(principal, id); await allowed(config, "history", principal, document); const result = await database.findOne<MdfnVersionRecord>({ model: VERSIONS, where: [{ field: "documentId", operator: "eq", value: id }, { field: "version", operator: "eq", value: version }] }); if (!result) throw new MdfnServerError("MDFN_VERSION_NOT_FOUND", 404); return result; },
    async restoreVersion(principal, id, input) {
      const current = await loadScoped(principal, id);
      await allowed(config, "history:restore", principal, current);
      const restored = await database.findOne<MdfnVersionRecord>({
        model: VERSIONS,
        where: [
          { field: "documentId", operator: "eq", value: id },
          { field: "version", operator: "eq", value: input.version },
        ],
      });
      if (!restored) throw new MdfnServerError("MDFN_VERSION_NOT_FOUND", 404);
      return writeUpdate(
        principal,
        id,
        { expectedVersion: input.expectedVersion, changeSource: `restore:${input.version}`, idempotencyKey: input.idempotencyKey },
        {
          trustedEditorial: true,
          authorizationAction: "history:restore",
          restoreSnapshot: restored,
          idempotencyOperation: "document:restore",
          idempotencyPayload: input,
        },
      );
    },
    async createComment(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "comment:create", "editorial:comment-created", input.idempotencyKey, input, (document) => createCommentThread({ sidecar: document.sidecar, anchor: input.anchor, body: input.body, actor: editorialActor(principal), markdownLength: document.markdown.length }));
    },
    async replyComment(principal, id, threadId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "comment:reply", "editorial:comment-replied", input.idempotencyKey, { threadId, ...input }, (document) => ({ sidecar: replyToComment({ sidecar: document.sidecar ?? {}, threadId, body: input.body, actor: editorialActor(principal) }) }));
    },
    async resolveComment(principal, id, threadId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "comment:resolve", input.resolved ? "editorial:comment-resolved" : "editorial:comment-reopened", input.idempotencyKey, { threadId, ...input }, (document) => ({ sidecar: setCommentResolved({ sidecar: document.sidecar ?? {}, threadId, resolved: input.resolved, actor: editorialActor(principal) }) }));
    },
    async createSuggestion(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "suggestion:create", "editorial:suggestion-created", input.idempotencyKey, input, (document) => createSuggestion({ sidecar: document.sidecar, anchor: input.anchor, replacement: input.replacement, actor: editorialActor(principal), markdownLength: document.markdown.length }));
    },
    async decideSuggestion(principal, id, suggestionId, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "suggestion:decide", `editorial:suggestion-${input.decision}`, input.idempotencyKey, { suggestionId, ...input }, (document) => {
        const controller = createEditor({ markdown: document.markdown, projector: createMarkdownProjector(markdownOptions), extensions: config.extensions, sidecar: document.sidecar });
        try {
          decideSuggestion({ controller, suggestionId, decision: input.decision, actor: editorialActor(principal) });
          const state = controller.getState();
          return { markdown: state.markdown, sidecar: state.sidecar ?? {} };
        } finally { controller.destroy(); }
      });
    },
    async transitionReview(principal, id, input) {
      return mutateEditorial(principal, id, input.expectedVersion, "review:transition", "editorial:review-transitioned", input.idempotencyKey, input, (document) => ({ sidecar: transitionReview({ sidecar: document.sidecar, to: input.state, actor: editorialActor(principal) }) }));
    },
    async appendCollaborationUpdate(principal, id, update) {
      if (new TextEncoder().encode(update).byteLength > collaborationUpdateBytes) throw new MdfnServerError("MDFN_COLLAB_UPDATE_TOO_LARGE", 413);
      const updateId = createId();
      const createdAt = now();
      await withCollaborationWrite(id, async (storage, cursorKey) => {
        await storage.create({
          model: COLLAB_UPDATES,
          data: { id: updateId, documentId: id, authorId: principal.id, update, cursorKey, createdAt },
        });
      }, async () => {
        const document = await loadScoped(principal, id);
        await allowed(config, "collaborate", principal, document);
      }, async (storage) => {
        await loadScopedFrom(storage, principal, id);
      });
      return updateId;
    },
    async collaborationUpdates(principal, id, options = {}) {
      const document = await loadScoped(principal, id);
      await allowed(config, "collaborate", principal, document);
      const requestedLimit = options.limit ?? collaborationBatchUpdates;
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
        throw new MdfnServerError("MDFN_COLLAB_CURSOR_INVALID", 422);
      }
      const limit = Math.min(collaborationBatchUpdates, requestedLimit);
      type CollaborationRow = { readonly id: string; readonly update: string; readonly cursorKey: string };
      const cursor = options.cursor === undefined ? undefined : decodeCollaborationCursor(options.cursor, id);
      const rows = await database.findMany<CollaborationRow>({
        model: COLLAB_UPDATES,
        where: [
          { field: "documentId", operator: "eq", value: id },
          ...(cursor === undefined ? [] : [{ field: "cursorKey", operator: "gt" as const, value: cursor }]),
        ],
        orderBy: [{ field: "cursorKey", direction: "asc" }],
        limit: limit + 1,
      });
      const included: CollaborationRow[] = [];
      let encodedBytes = 0;
      for (const row of rows.slice(0, limit)) {
        const rowBytes = new TextEncoder().encode(row.update).byteLength;
        if (included.length > 0 && encodedBytes + rowBytes > collaborationBatchBytes) break;
        included.push(row);
        encodedBytes += rowBytes;
      }
      const hasMore = included.length < rows.length;
      return {
        updates: included.map((row) => row.update),
        includedUpdateIds: included.map((row) => row.id),
        ...(hasMore ? { nextCursor: encodeCollaborationCursor(id, included.at(-1)!.cursorKey) } : {}),
      };
    },
    async compactCollaborationUpdates(principal, id, snapshot, includedUpdateIds) {
      if (new TextEncoder().encode(snapshot).byteLength > collaborationUpdateBytes) throw new MdfnServerError("MDFN_COLLAB_UPDATE_TOO_LARGE", 413);
      if (!Array.isArray(includedUpdateIds) || includedUpdateIds.some((updateId) => typeof updateId !== "string" || !updateId)) {
        throw new MdfnServerError("MDFN_COLLAB_COMPACTION_INVALID", 422);
      }
      const uniqueUpdateIds = [...new Set(includedUpdateIds)];
      const updateId = createId();
      const createdAt = now();
      await withCollaborationWrite(id, async (storage, cursorKey) => {
        if (uniqueUpdateIds.length > 0) {
          await storage.deleteMany({ model: COLLAB_UPDATES, where: [{ field: "documentId", operator: "eq", value: id }, { field: "id", operator: "in", value: uniqueUpdateIds }] });
        }
        await storage.create({ model: COLLAB_UPDATES, data: { id: updateId, documentId: id, authorId: principal.id, update: snapshot, cursorKey, createdAt } });
      }, async () => {
        const document = await loadScoped(principal, id);
        await allowed(config, "compact-collaboration", principal, document);
      }, async (storage) => {
        await loadScopedFrom(storage, principal, id);
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
  const defaultBodyBytes = Math.max(
    configuredDocumentBytes(config) + 4 * 1024 * 1024,
    configuredCollaborationUpdateBytes(config) + 64 * 1024,
  );
  return createRouter({
    basePath: config.basePath ?? "/api/mdfn",
    maxBodyBytes: config.maxRequestBodyBytes ?? defaultBodyBytes,
    context: async (request) => ({ principal: await principal(request) }),
    onError: (error) => error instanceof MdfnServerError
      ? Response.json({ error: error.code }, { status: error.status })
      : error instanceof RouterError
        ? error.toResponse()
        : Response.json({ error: "MDFN_INTERNAL_ERROR" }, { status: 500 }),
    routes: [
      { method: "GET", path: "/documents", handler: (_request, context) => service.list(context.principal, { limit: Number(context.query.get("limit") ?? 50), offset: Number(context.query.get("offset") ?? 0) }).then((documents) => Response.json({ documents })) },
      { method: "POST", path: "/documents", handler: async (_request, context) => response(await service.create(context.principal, await context.json()), 201) },
      { method: "GET", path: "/documents/:id", handler: async (_request, context) => response(await service.read(context.principal, context.params.id!)) },
      { method: "PATCH", path: "/documents/:id", handler: async (request, context) => response(await service.update(context.principal, context.params.id!, idempotent(request, await context.json()))) },
      { method: "DELETE", path: "/documents/:id", handler: async (_request, context) => { await service.delete(context.principal, context.params.id!); return new Response(null, { status: 204 }); } },
      { method: "GET", path: "/documents/:id/versions", handler: async (_request, context) => Response.json(await service.versions(context.principal, context.params.id!, { cursor: context.query.get("cursor") ?? undefined, limit: context.query.has("limit") ? Number(context.query.get("limit")) : undefined })) },
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
      { method: "GET", path: "/documents/:id/collaboration-updates", handler: async (_request, context) => Response.json(await service.collaborationUpdates(context.principal, context.params.id!, { cursor: context.query.get("cursor") ?? undefined, limit: context.query.has("limit") ? Number(context.query.get("limit")) : undefined })) },
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
