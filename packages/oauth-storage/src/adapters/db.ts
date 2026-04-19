import type { Adapter, WhereClause } from "@superfunctions/db";
import type {
  OAuthConsentRecord,
  OAuthConsentStore,
  OAuthRevocationFailureRecord,
  OAuthRevocationFailureStore,
  OAuthStateRecord,
  OAuthStateStore,
  OAuthStoredSubject,
  TokenRecord,
  TokenVault
} from "../index.js";
import {
  applySubjectToStateRecord,
  cloneOAuthStoredSubject,
  getOAuthSubjectKey,
  validateOAuthConsentRecord,
  validateOAuthRevocationFailureRecord,
  validateOAuthStateRecord,
  validateOAuthStoredSubject
} from "../state-store.js";

export interface OAuthDbModelMapping {
  oauthStates: string;
  oauthTokenVault: string;
  oauthConsents: string;
  oauthRevocationFailures: string;
}

export interface OAuthDbAdapterOptions {
  adapter: Adapter;
  models?: Partial<OAuthDbModelMapping>;
}

export type OAuthDbAdapterErrorCode = "SCHEMA_MISSING" | "INTERNAL_ERROR";

export class OAuthDbAdapterError extends Error {
  readonly code: OAuthDbAdapterErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: OAuthDbAdapterErrorCode, message: string) {
    super(message);
    this.name = "OAuthDbAdapterError";
    this.code = code;
    this.status = 500;
    this.retryable = false;
  }
}

const DEFAULT_MODELS: OAuthDbModelMapping = {
  oauthStates: "oauth_states",
  oauthTokenVault: "oauth_tokens",
  oauthConsents: "oauth_consents",
  oauthRevocationFailures: "oauth_revocation_failures"
};

type StateRow = {
  state_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: unknown;
  redirect_uri: string;
  requested_scopes: unknown;
  code_verifier?: string | null;
  nonce?: string | null;
  created_at: string;
  expires_at: string;
  consumed_at?: string | null;
};

type TokenRow = {
  token_id: string;
  tenant_id: string;
  user_id: string;
  provider_id: string;
  connection_id: string;
  encrypted_payload: string;
  key_ref: string;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
};

type ConsentRow = {
  consent_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: unknown;
  scope_set: unknown;
  granted_at: string;
  updated_at: string;
  metadata?: unknown;
};

type RevocationFailureRow = {
  failure_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: unknown;
  token_id?: string | null;
  token_type_hint?: string | null;
  error_code: string;
  error_message: string;
  retryable: boolean;
  occurred_at: string;
  metadata?: unknown;
};

export class DbAdapterOAuthStateStore implements OAuthStateStore {
  private readonly adapter: Adapter;
  private readonly model: string;

  constructor(adapter: Adapter, model = DEFAULT_MODELS.oauthStates) {
    this.adapter = adapter;
    this.model = model;
  }

  async put(record: OAuthStateRecord): Promise<void> {
    validateOAuthStateRecord(record);
    await this.adapter.upsert({
      model: this.model,
      where: [{ field: "state_id", operator: "eq", value: record.stateId }],
      create: mapStateRecordToRow(record),
      update: mapStateRecordToRow(record),
      conflictTarget: "state_id"
    });
  }

  async get(stateId: string): Promise<OAuthStateRecord | null> {
    const row = await this.adapter.findOne<StateRow>({
      model: this.model,
      where: [{ field: "state_id", operator: "eq", value: stateId }]
    });

    return row ? mapStateRowToRecord(row) : null;
  }

  async consume(stateId: string, consumedAt: string): Promise<OAuthStateRecord | null> {
    const where: WhereClause[] = [
      { field: "state_id", operator: "eq", value: stateId },
      { field: "consumed_at", operator: "eq", value: null },
      { field: "expires_at", operator: "gt", value: consumedAt }
    ];

    try {
      const updated = await this.adapter.update<StateRow>({
        model: this.model,
        where,
        data: { consumed_at: consumedAt }
      });

      return mapStateRowToRecord(updated);
    } catch (error) {
      if (isAdapterNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteExpired(before: string): Promise<number> {
    return this.adapter.deleteMany({
      model: this.model,
      where: [{ field: "expires_at", operator: "lt", value: before }]
    });
  }
}

function isAdapterNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const raw = error as { code?: unknown; name?: unknown };
  return raw.code === "ADAPTER_NOT_FOUND" || raw.name === "NotFoundError";
}

export class DbAdapterTokenVault implements TokenVault {
  private readonly adapter: Adapter;
  private readonly model: string;

  constructor(adapter: Adapter, model = DEFAULT_MODELS.oauthTokenVault) {
    this.adapter = adapter;
    this.model = model;
  }

  async put(record: TokenRecord): Promise<void> {
    await this.adapter.upsert({
      model: this.model,
      where: [{ field: "token_id", operator: "eq", value: record.tokenId }],
      create: mapTokenRecordToRow(record),
      update: mapTokenRecordToRow(record),
      conflictTarget: "token_id"
    });
  }

  async get(tokenId: string): Promise<TokenRecord | null> {
    const row = await this.adapter.findOne<TokenRow>({
      model: this.model,
      where: [{ field: "token_id", operator: "eq", value: tokenId }]
    });

    return row ? mapTokenRowToRecord(row) : null;
  }

  async getByConnection(connectionId: string): Promise<TokenRecord | null> {
    const row = await this.adapter.findOne<TokenRow>({
      model: this.model,
      where: [{ field: "connection_id", operator: "eq", value: connectionId }]
    });

    return row ? mapTokenRowToRecord(row) : null;
  }

  async rotateKey(tokenId: string, newKeyRef: string): Promise<void> {
    const existing = await this.get(tokenId);
    if (!existing || existing.keyRef === newKeyRef) {
      return;
    }

    throw new OAuthDbAdapterError(
      "INTERNAL_ERROR",
      "Token key rotation requires re-encryption; use EncryptedTokenVault.rotateKey"
    );
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    await this.adapter.deleteMany({
      model: this.model,
      where: [{ field: "connection_id", operator: "eq", value: connectionId }]
    });
  }
}

export class DbAdapterOAuthConsentStore implements OAuthConsentStore {
  private readonly adapter: Adapter;
  private readonly model: string;

  constructor(adapter: Adapter, model = DEFAULT_MODELS.oauthConsents) {
    this.adapter = adapter;
    this.model = model;
  }

  async put(record: OAuthConsentRecord): Promise<void> {
    validateOAuthConsentRecord(record);
    await this.adapter.upsert({
      model: this.model,
      where: [{ field: "consent_id", operator: "eq", value: record.consentId }],
      create: mapConsentRecordToRow(record),
      update: mapConsentRecordToRow(record),
      conflictTarget: "consent_id"
    });
  }

  async get(consentId: string): Promise<OAuthConsentRecord | null> {
    const row = await this.adapter.findOne<ConsentRow>({
      model: this.model,
      where: [{ field: "consent_id", operator: "eq", value: consentId }]
    });

    return row ? mapConsentRowToRecord(row) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthConsentRecord[]> {
    validateOAuthStoredSubject(subject);
    const rows = await this.adapter.findMany<ConsentRow>({
      model: this.model,
      where: [
        { field: "provider_id", operator: "eq", value: providerId },
        { field: "subject_key", operator: "eq", value: getOAuthSubjectKey(subject) }
      ]
    });

    return rows.map(mapConsentRowToRecord);
  }

  async delete(consentId: string): Promise<void> {
    await this.adapter.deleteMany({
      model: this.model,
      where: [{ field: "consent_id", operator: "eq", value: consentId }]
    });
  }
}

export class DbAdapterOAuthRevocationFailureStore implements OAuthRevocationFailureStore {
  private readonly adapter: Adapter;
  private readonly model: string;

  constructor(adapter: Adapter, model = DEFAULT_MODELS.oauthRevocationFailures) {
    this.adapter = adapter;
    this.model = model;
  }

  async put(record: OAuthRevocationFailureRecord): Promise<void> {
    validateOAuthRevocationFailureRecord(record);
    await this.adapter.upsert({
      model: this.model,
      where: [{ field: "failure_id", operator: "eq", value: record.failureId }],
      create: mapRevocationFailureRecordToRow(record),
      update: mapRevocationFailureRecordToRow(record),
      conflictTarget: "failure_id"
    });
  }

  async get(failureId: string): Promise<OAuthRevocationFailureRecord | null> {
    const row = await this.adapter.findOne<RevocationFailureRow>({
      model: this.model,
      where: [{ field: "failure_id", operator: "eq", value: failureId }]
    });

    return row ? mapRevocationFailureRowToRecord(row) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthRevocationFailureRecord[]> {
    validateOAuthStoredSubject(subject);
    const rows = await this.adapter.findMany<RevocationFailureRow>({
      model: this.model,
      where: [
        { field: "provider_id", operator: "eq", value: providerId },
        { field: "subject_key", operator: "eq", value: getOAuthSubjectKey(subject) }
      ]
    });

    return rows.map(mapRevocationFailureRowToRecord);
  }

  async delete(failureId: string): Promise<void> {
    await this.adapter.deleteMany({
      model: this.model,
      where: [{ field: "failure_id", operator: "eq", value: failureId }]
    });
  }
}

export function createOAuthDbStorage(options: OAuthDbAdapterOptions): {
  stateStore: OAuthStateStore;
  tokenVault: TokenVault;
  consentStore: OAuthConsentStore;
  revocationFailureStore: OAuthRevocationFailureStore;
  models: OAuthDbModelMapping;
} {
  const models = resolveModelMapping(options.models);
  return {
    stateStore: new DbAdapterOAuthStateStore(options.adapter, models.oauthStates),
    tokenVault: new DbAdapterTokenVault(options.adapter, models.oauthTokenVault),
    consentStore: new DbAdapterOAuthConsentStore(options.adapter, models.oauthConsents),
    revocationFailureStore: new DbAdapterOAuthRevocationFailureStore(
      options.adapter,
      models.oauthRevocationFailures
    ),
    models
  };
}

function resolveModelMapping(mapping: Partial<OAuthDbModelMapping> | undefined): OAuthDbModelMapping {
  const models: OAuthDbModelMapping = {
    oauthStates: mapping?.oauthStates ?? DEFAULT_MODELS.oauthStates,
    oauthTokenVault: mapping?.oauthTokenVault ?? DEFAULT_MODELS.oauthTokenVault,
    oauthConsents: mapping?.oauthConsents ?? DEFAULT_MODELS.oauthConsents,
    oauthRevocationFailures: mapping?.oauthRevocationFailures ?? DEFAULT_MODELS.oauthRevocationFailures
  };

  if (!models.oauthStates) {
    throw new OAuthDbAdapterError("SCHEMA_MISSING", "oauth_states model mapping required");
  }

  if (!models.oauthTokenVault) {
    throw new OAuthDbAdapterError("SCHEMA_MISSING", "oauth_tokens model mapping required");
  }

  if (!models.oauthConsents) {
    throw new OAuthDbAdapterError("SCHEMA_MISSING", "oauth_consents model mapping required");
  }

  if (!models.oauthRevocationFailures) {
    throw new OAuthDbAdapterError("SCHEMA_MISSING", "oauth_revocation_failures model mapping required");
  }

  return models;
}

function mapStateRecordToRow(record: OAuthStateRecord): StateRow {
  const normalized = applySubjectToStateRecord(record);
  return {
    state_id: normalized.stateId,
    provider_id: normalized.providerId,
    subject_kind: normalized.subject!.kind,
    subject_key: getOAuthSubjectKey(normalized.subject!),
    subject_payload: JSON.stringify(normalized.subject),
    redirect_uri: normalized.redirectUri,
    requested_scopes: JSON.stringify(normalized.requestedScopes),
    code_verifier: normalized.codeVerifier ?? null,
    nonce: normalized.nonce ?? null,
    created_at: normalized.createdAt,
    expires_at: normalized.expiresAt,
    consumed_at: normalized.consumedAt ?? null
  };
}

function mapStateRowToRecord(row: StateRow): OAuthStateRecord {
  const subject = parseSubject(row.subject_payload);
  return applySubjectToStateRecord({
    stateId: row.state_id,
    providerId: row.provider_id,
    subject,
    redirectUri: row.redirect_uri,
    requestedScopes: parseStringArrayValue(row.requested_scopes, "requested_scopes"),
    codeVerifier: row.code_verifier ?? undefined,
    nonce: row.nonce ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? undefined
  });
}

function mapTokenRecordToRow(record: TokenRecord): TokenRow {
  return {
    token_id: record.tokenId,
    tenant_id: record.tenantId,
    user_id: record.userId,
    provider_id: record.providerId,
    connection_id: record.connectionId,
    encrypted_payload: record.encryptedPayload,
    key_ref: record.keyRef,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    expires_at: record.expiresAt ?? null
  };
}

function mapTokenRowToRecord(row: TokenRow): TokenRecord {
  return {
    tokenId: row.token_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    providerId: row.provider_id,
    connectionId: row.connection_id,
    encryptedPayload: row.encrypted_payload,
    keyRef: row.key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined
  };
}

function mapConsentRecordToRow(record: OAuthConsentRecord): ConsentRow {
  return {
    consent_id: record.consentId,
    provider_id: record.providerId,
    subject_kind: record.subject.kind,
    subject_key: getOAuthSubjectKey(record.subject),
    subject_payload: JSON.stringify(record.subject),
    scope_set: JSON.stringify(record.scopes),
    granted_at: record.grantedAt,
    updated_at: record.updatedAt,
    metadata: record.metadata ? JSON.stringify(record.metadata) : null
  };
}

function mapConsentRowToRecord(row: ConsentRow): OAuthConsentRecord {
  return {
    consentId: row.consent_id,
    providerId: row.provider_id,
    subject: parseSubject(row.subject_payload),
    scopes: parseStringArrayValue(row.scope_set, "scope_set"),
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? parseRecordValue(row.metadata, "metadata") : undefined
  };
}

function mapRevocationFailureRecordToRow(record: OAuthRevocationFailureRecord): RevocationFailureRow {
  return {
    failure_id: record.failureId,
    provider_id: record.providerId,
    subject_kind: record.subject.kind,
    subject_key: getOAuthSubjectKey(record.subject),
    subject_payload: JSON.stringify(record.subject),
    token_id: record.tokenId ?? null,
    token_type_hint: record.tokenTypeHint ?? null,
    error_code: record.errorCode,
    error_message: record.errorMessage,
    retryable: record.retryable,
    occurred_at: record.occurredAt,
    metadata: record.metadata ? JSON.stringify(record.metadata) : null
  };
}

function mapRevocationFailureRowToRecord(row: RevocationFailureRow): OAuthRevocationFailureRecord {
  return {
    failureId: row.failure_id,
    providerId: row.provider_id,
    subject: parseSubject(row.subject_payload),
    tokenId: row.token_id ?? undefined,
    tokenTypeHint: parseTokenTypeHint(row.token_type_hint),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryable: row.retryable,
    occurredAt: row.occurred_at,
    metadata: row.metadata ? parseRecordValue(row.metadata, "metadata") : undefined
  };
}

function parseSubject(raw: unknown): OAuthStoredSubject {
  const subject = parseJsonValue<OAuthStoredSubject>(raw);
  validateOAuthStoredSubject(subject);
  return cloneOAuthStoredSubject(subject);
}

function parseJsonValue<T>(raw: unknown): T {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new OAuthDbAdapterError("INTERNAL_ERROR", "persisted JSON value must be valid JSON");
    }
  }

  return raw as T;
}

function parseStringArrayValue(raw: unknown, fieldName: string): string[] {
  const value = parseJsonValue<unknown>(raw);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new OAuthDbAdapterError("INTERNAL_ERROR", `${fieldName} must be an array of strings`);
  }

  return [...value];
}

function parseRecordValue(raw: unknown, fieldName: string): Record<string, unknown> {
  const value = parseJsonValue<unknown>(raw);
  if (!isPlainRecord(value)) {
    throw new OAuthDbAdapterError("INTERNAL_ERROR", `${fieldName} must be an object`);
  }

  return { ...value };
}

function parseTokenTypeHint(value: string | null | undefined): "access_token" | "refresh_token" | undefined {
  if (value == null) {
    return undefined;
  }
  if (value === "access_token" || value === "refresh_token") {
    return value;
  }
  throw new OAuthDbAdapterError("INTERNAL_ERROR", "token_type_hint must be access_token or refresh_token");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
