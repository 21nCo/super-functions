import type { MdfnJsonValue, MdfnSidecar, ReviewState, SidecarAnchor } from "./types";

export interface SidecarValidationOptions {
  readonly markdownLength?: number;
  readonly maxEntries?: number;
  readonly maxTextLength?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownFields(value: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const fields = new Set(allowed);
  if (Object.keys(value).some((key) => !fields.has(key))) throw new Error(code);
}

function text(value: unknown, code: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0) || value.length > maximum) throw new Error(code);
  return value;
}

function timestamp(value: unknown, code: string): string {
  const resolved = text(value, code, 128);
  if (!Number.isFinite(Date.parse(resolved))) throw new Error(code);
  return resolved;
}

function anchor(value: unknown, markdownLength: number | undefined): SidecarAnchor {
  if (!record(value) || !Number.isInteger(value.from) || !Number.isInteger(value.to)) throw new Error("MDFN_SIDECAR_ANCHOR_INVALID");
  knownFields(value, ["from", "to", "affinity"], "MDFN_SIDECAR_ANCHOR_INVALID");
  const from = value.from as number;
  const to = value.to as number;
  if (from < 0 || to < from || (markdownLength !== undefined && to > markdownLength)) throw new Error("MDFN_SIDECAR_ANCHOR_INVALID");
  if (value.affinity !== undefined && value.affinity !== "before" && value.affinity !== "after") throw new Error("MDFN_SIDECAR_ANCHOR_INVALID");
  return value as unknown as SidecarAnchor;
}

function json(value: unknown, count: (textLength: number) => boolean, countKey: (textLength: number) => boolean, depth = 0): value is MdfnJsonValue {
  if (!count(typeof value === "string" ? value.length : 0)) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth >= 32) return false;
  if (Array.isArray(value)) return value.every((entry) => json(entry, count, countKey, depth + 1));
  return record(value) && Object.entries(value).every(([key, entry]) => countKey(key.length) && json(entry, count, countKey, depth + 1));
}

/** Validates untrusted persisted or collaborative sidecar data before it enters editor state. */
export function validateMdfnSidecar(value: unknown, options: SidecarValidationOptions = {}): MdfnSidecar | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) throw new Error("MDFN_SIDECAR_INVALID");
  knownFields(value, ["comments", "suggestions", "assets", "historyRef", "reviewState", "audit"], "MDFN_SIDECAR_INVALID");
  const maxEntries = options.maxEntries ?? 10_000;
  const maxText = options.maxTextLength ?? 256 * 1024;
  let entryCount = 0;
  let jsonTextLength = 0;
  const countEntry = (): void => {
    entryCount += 1;
    if (entryCount > maxEntries) throw new Error("MDFN_SIDECAR_ENTRY_LIMIT_EXCEEDED");
  };
  const seen = new Set<string>();
  const unique = (id: string): void => {
    if (seen.has(id)) throw new Error(`MDFN_SIDECAR_DUPLICATE_ID:${id}`);
    seen.add(id);
  };
  const bounded = (entry: unknown, code: string): unknown[] => {
    if (entry === undefined) return [];
    if (!Array.isArray(entry) || entry.length > maxEntries) throw new Error(code);
    return entry;
  };
  const countJsonText = (length: number): boolean => {
    jsonTextLength += length;
    return jsonTextLength <= maxText;
  };
  const boundedJson = (entry: unknown): entry is MdfnJsonValue => json(entry, (length) => {
    countEntry();
    return countJsonText(length);
  }, countJsonText);

  for (const candidate of bounded(value.comments, "MDFN_SIDECAR_COMMENTS_INVALID")) {
    countEntry();
    if (!record(candidate)) throw new Error("MDFN_SIDECAR_COMMENT_INVALID");
    knownFields(candidate, ["id", "anchor", "resolved", "messages"], "MDFN_SIDECAR_COMMENT_INVALID");
    if (typeof candidate.resolved !== "boolean") throw new Error("MDFN_SIDECAR_COMMENT_INVALID");
    unique(text(candidate.id, "MDFN_SIDECAR_COMMENT_INVALID", 256));
    anchor(candidate.anchor, options.markdownLength);
    const messages = bounded(candidate.messages, "MDFN_SIDECAR_COMMENT_MESSAGES_INVALID");
    if (messages.length === 0) throw new Error("MDFN_SIDECAR_COMMENT_MESSAGES_INVALID");
    for (const message of messages) {
      countEntry();
      if (!record(message)) throw new Error("MDFN_SIDECAR_COMMENT_MESSAGE_INVALID");
      knownFields(message, ["id", "authorId", "body", "createdAt", "updatedAt"], "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID");
      unique(text(message.id, "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID", 256));
      text(message.authorId, "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID", 256);
      text(message.body, "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID", maxText);
      timestamp(message.createdAt, "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID");
      if (message.updatedAt !== undefined) timestamp(message.updatedAt, "MDFN_SIDECAR_COMMENT_MESSAGE_INVALID");
    }
  }

  for (const candidate of bounded(value.suggestions, "MDFN_SIDECAR_SUGGESTIONS_INVALID")) {
    countEntry();
    if (!record(candidate)) throw new Error("MDFN_SIDECAR_SUGGESTION_INVALID");
    knownFields(candidate, ["id", "anchor", "replacement", "authorId", "status", "createdAt"], "MDFN_SIDECAR_SUGGESTION_INVALID");
    if (!["pending", "accepted", "rejected"].includes(String(candidate.status))) throw new Error("MDFN_SIDECAR_SUGGESTION_INVALID");
    unique(text(candidate.id, "MDFN_SIDECAR_SUGGESTION_INVALID", 256));
    anchor(candidate.anchor, options.markdownLength);
    text(candidate.replacement, "MDFN_SIDECAR_SUGGESTION_INVALID", maxText, true);
    text(candidate.authorId, "MDFN_SIDECAR_SUGGESTION_INVALID", 256);
    timestamp(candidate.createdAt, "MDFN_SIDECAR_SUGGESTION_INVALID");
  }

  for (const candidate of bounded(value.assets, "MDFN_SIDECAR_ASSETS_INVALID")) {
    countEntry();
    if (!record(candidate)) throw new Error("MDFN_SIDECAR_ASSET_INVALID");
    knownFields(candidate, ["id", "mediaType", "name", "byteSize", "metadata"], "MDFN_SIDECAR_ASSET_INVALID");
    unique(text(candidate.id, "MDFN_SIDECAR_ASSET_INVALID", 256));
    text(candidate.mediaType, "MDFN_SIDECAR_ASSET_INVALID", 256);
    if (candidate.name !== undefined) text(candidate.name, "MDFN_SIDECAR_ASSET_INVALID", 4_096, true);
    if (candidate.byteSize !== undefined && (!Number.isSafeInteger(candidate.byteSize) || (candidate.byteSize as number) < 0)) throw new Error("MDFN_SIDECAR_ASSET_INVALID");
    if (candidate.metadata !== undefined && (!record(candidate.metadata) || !boundedJson(candidate.metadata))) throw new Error("MDFN_SIDECAR_ASSET_INVALID");
  }

  for (const candidate of bounded(value.audit, "MDFN_SIDECAR_AUDIT_INVALID")) {
    countEntry();
    if (!record(candidate)) throw new Error("MDFN_SIDECAR_AUDIT_ENTRY_INVALID");
    knownFields(candidate, ["id", "action", "actorId", "targetId", "createdAt", "details"], "MDFN_SIDECAR_AUDIT_ENTRY_INVALID");
    if (!["comment-created", "comment-replied", "comment-resolved", "comment-reopened", "suggestion-created", "suggestion-accepted", "suggestion-rejected", "review-transitioned"].includes(String(candidate.action))) throw new Error("MDFN_SIDECAR_AUDIT_ENTRY_INVALID");
    unique(text(candidate.id, "MDFN_SIDECAR_AUDIT_ENTRY_INVALID", 256));
    text(candidate.actorId, "MDFN_SIDECAR_AUDIT_ENTRY_INVALID", 256);
    if (candidate.targetId !== undefined) text(candidate.targetId, "MDFN_SIDECAR_AUDIT_ENTRY_INVALID", 256);
    timestamp(candidate.createdAt, "MDFN_SIDECAR_AUDIT_ENTRY_INVALID");
    if (candidate.details !== undefined && (!record(candidate.details) || !boundedJson(candidate.details))) throw new Error("MDFN_SIDECAR_AUDIT_ENTRY_INVALID");
  }

  if (value.historyRef !== undefined) text(value.historyRef, "MDFN_SIDECAR_HISTORY_REF_INVALID", 4_096);
  if (value.reviewState !== undefined && !(["draft", "in-review", "changes-requested", "approved"] satisfies ReviewState[]).includes(value.reviewState as ReviewState)) throw new Error("MDFN_SIDECAR_REVIEW_STATE_INVALID");
  return value as unknown as MdfnSidecar;
}
