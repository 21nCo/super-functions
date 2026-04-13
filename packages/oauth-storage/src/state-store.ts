import type {
  OAuthBrowserAuthSubject,
  OAuthConnectionSubject,
  OAuthConsentRecord,
  OAuthRevocationFailureRecord,
  OAuthStateRecord,
  OAuthStateStore,
  OAuthStoredSubject
} from "./index.js";

export class OAuthStateStoreError extends Error {
  readonly code: "VALIDATION_ERROR" | "OAUTH_STATE_INVALID";

  constructor(code: "VALIDATION_ERROR" | "OAUTH_STATE_INVALID", message: string) {
    super(message);
    this.name = "OAuthStateStoreError";
    this.code = code;
  }
}

export function validateOAuthStateRecord(record: OAuthStateRecord): void {
  if (!record.stateId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "stateId is required");
  }

  if (!record.providerId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "providerId is required");
  }

  if (!record.redirectUri) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "redirectUri is required");
  }

  if (!Array.isArray(record.requestedScopes)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "requestedScopes must be an array");
  }

  resolveOAuthStoredSubject(record);
  assertIsoTimestamp("createdAt", record.createdAt);
  assertIsoTimestamp("expiresAt", record.expiresAt);

  if (record.consumedAt) {
    assertIsoTimestamp("consumedAt", record.consumedAt);
  }
}

export function validateOAuthConsentRecord(record: OAuthConsentRecord): void {
  if (!record.consentId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "consentId is required");
  }

  if (!record.providerId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "providerId is required");
  }

  if (!Array.isArray(record.scopes)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "scopes must be an array");
  }

  validateOAuthStoredSubject(record.subject);
  assertIsoTimestamp("grantedAt", record.grantedAt);
  assertIsoTimestamp("updatedAt", record.updatedAt);

  if (record.metadata !== undefined && !isRecord(record.metadata)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "metadata must be an object");
  }
}

export function validateOAuthRevocationFailureRecord(record: OAuthRevocationFailureRecord): void {
  if (!record.failureId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "failureId is required");
  }

  if (!record.providerId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "providerId is required");
  }

  if (!record.errorCode || !record.errorMessage) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "errorCode and errorMessage are required");
  }

  validateOAuthStoredSubject(record.subject);
  assertIsoTimestamp("occurredAt", record.occurredAt);

  if (record.metadata !== undefined && !isRecord(record.metadata)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "metadata must be an object");
  }
}

export function resolveOAuthStoredSubject(
  record: Pick<
    OAuthStateRecord,
    "subject" | "tenantId" | "userId" | "connectionId" | "intentId" | "regionId" | "returnTo" | "metadata"
  >
): OAuthStoredSubject {
  const subject =
    record.subject ??
    (record.intentId
      ? {
          kind: "browser-auth" as const,
          intentId: record.intentId,
          tenantId: record.tenantId,
          regionId: record.regionId,
          returnTo: record.returnTo,
          metadata: record.metadata
        }
      : record.tenantId && record.userId
        ? {
            kind: "connection" as const,
            tenantId: record.tenantId,
            userId: record.userId,
            connectionId: record.connectionId
          }
        : null);

  if (!subject) {
    throw new OAuthStateStoreError(
      "VALIDATION_ERROR",
      "subject is required or tenantId/userId or intentId must be provided"
    );
  }

  validateOAuthStoredSubject(subject);
  return subject;
}

export function validateOAuthStoredSubject(subject: OAuthStoredSubject): void {
  if (subject.kind === "connection") {
    validateConnectionSubject(subject);
    return;
  }

  validateBrowserAuthSubject(subject);
}

export function getOAuthSubjectKey(subject: OAuthStoredSubject): string {
  if (subject.kind === "connection") {
    return subject.connectionId ? `connection:${subject.connectionId}` : `connection:${subject.tenantId}:${subject.userId}`;
  }

  return `browser-auth:${subject.intentId}`;
}

export function applySubjectToStateRecord(record: OAuthStateRecord): OAuthStateRecord {
  const subject = resolveOAuthStoredSubject(record);
  return {
    ...record,
    subject: cloneOAuthStoredSubject(subject),
    tenantId: subject.kind === "connection" ? subject.tenantId : subject.tenantId,
    userId: subject.kind === "connection" ? subject.userId : undefined,
    connectionId: subject.kind === "connection" ? subject.connectionId : undefined,
    intentId: subject.kind === "browser-auth" ? subject.intentId : undefined,
    regionId: subject.kind === "browser-auth" ? subject.regionId : undefined,
    returnTo: subject.kind === "browser-auth" ? subject.returnTo : undefined,
    metadata: subject.kind === "browser-auth" ? cloneUnknownRecord(subject.metadata) : undefined
  };
}

export function cloneOAuthStoredSubject(subject: OAuthStoredSubject): OAuthStoredSubject {
  if (subject.kind === "connection") {
    return { ...subject };
  }

  return {
    ...subject,
    metadata: cloneUnknownRecord(subject.metadata)
  };
}

export function isOAuthStateExpired(record: Pick<OAuthStateRecord, "expiresAt">, at: string): boolean {
  const expiresAt = parseIsoTimestamp("expiresAt", record.expiresAt);
  const checkpoint = parseIsoTimestamp("at", at);
  return expiresAt <= checkpoint;
}

export async function consumeOAuthState(
  store: OAuthStateStore,
  stateId: string,
  consumedAt: string
): Promise<OAuthStateRecord | null> {
  if (!stateId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "stateId is required");
  }

  assertIsoTimestamp("consumedAt", consumedAt);
  const consumed = await store.consume(stateId, consumedAt);
  if (!consumed) {
    return null;
  }

  validateOAuthStateRecord(consumed);
  return cloneOAuthStateRecord(consumed);
}

export async function purgeExpiredOAuthStates(store: OAuthStateStore, before: string): Promise<number> {
  assertIsoTimestamp("before", before);
  return store.deleteExpired(before);
}

export function cloneOAuthStateRecord(record: OAuthStateRecord): OAuthStateRecord {
  const normalized = applySubjectToStateRecord(record);
  return {
    ...normalized,
    requestedScopes: [...normalized.requestedScopes],
    metadata: cloneUnknownRecord(normalized.metadata)
  };
}

function validateConnectionSubject(subject: OAuthConnectionSubject): void {
  if (!subject.tenantId || !subject.userId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "connection subjects require tenantId and userId");
  }
}

function validateBrowserAuthSubject(subject: OAuthBrowserAuthSubject): void {
  if (!subject.intentId) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "browser-auth subjects require intentId");
  }

  if (subject.metadata !== undefined && !isRecord(subject.metadata)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", "browser-auth subject metadata must be an object");
  }
}

function assertIsoTimestamp(fieldName: string, value: string): void {
  parseIsoTimestamp(fieldName, value);
}

function parseIsoTimestamp(fieldName: string, value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", `${fieldName} must be a valid ISO-8601 timestamp`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new OAuthStateStoreError("VALIDATION_ERROR", `${fieldName} must be a valid ISO-8601 timestamp`);
  }

  return timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneUnknownRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return value ? { ...value } : undefined;
}
