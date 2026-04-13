import type {
  OAuthConsentRecord,
  OAuthConsentStore,
  OAuthRevocationFailureRecord,
  OAuthRevocationFailureStore,
  OAuthStateRecord,
  OAuthStateStore,
  OAuthStorageTableDefinition,
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

export interface SqlResult {
  rowsAffected?: number;
}

export interface SqlClient {
  query<TRow = unknown>(statement: string, params?: readonly unknown[]): Promise<TRow[]>;
  execute(statement: string, params?: readonly unknown[]): Promise<SqlResult>;
}

interface OAuthStateRow {
  state_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: string;
  redirect_uri: string;
  requested_scopes: string;
  code_verifier: string | null;
  nonce: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

interface TokenRow {
  token_id: string;
  tenant_id: string;
  user_id: string;
  provider_id: string;
  connection_id: string;
  encrypted_payload: string;
  key_ref: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

interface ConsentRow {
  consent_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: string;
  scope_set: string;
  granted_at: string;
  updated_at: string;
  metadata: string | null;
}

interface RevocationFailureRow {
  failure_id: string;
  provider_id: string;
  subject_kind: string;
  subject_key: string;
  subject_payload: string;
  token_id: string | null;
  token_type_hint: string | null;
  error_code: string;
  error_message: string;
  retryable: boolean;
  occurred_at: string;
  metadata: string | null;
}

const STATE_COLUMNS = `
  state_id,
  provider_id,
  subject_kind,
  subject_key,
  subject_payload,
  redirect_uri,
  requested_scopes,
  code_verifier,
  nonce,
  created_at,
  expires_at,
  consumed_at
`;

const TOKEN_COLUMNS = `
  token_id,
  tenant_id,
  user_id,
  provider_id,
  connection_id,
  encrypted_payload,
  key_ref,
  created_at,
  updated_at,
  expires_at
`;

const CONSENT_COLUMNS = `
  consent_id,
  provider_id,
  subject_kind,
  subject_key,
  subject_payload,
  scope_set,
  granted_at,
  updated_at,
  metadata
`;

const REVOCATION_FAILURE_COLUMNS = `
  failure_id,
  provider_id,
  subject_kind,
  subject_key,
  subject_payload,
  token_id,
  token_type_hint,
  error_code,
  error_message,
  retryable,
  occurred_at,
  metadata
`;

export class SqlOAuthStateStore implements OAuthStateStore {
  private readonly client: SqlClient;
  private readonly tableName: string;

  constructor(client: SqlClient, tableName = "oauth_states") {
    this.client = client;
    this.tableName = validateSqlIdentifier(tableName, "tableName");
  }

  async put(record: OAuthStateRecord): Promise<void> {
    validateOAuthStateRecord(record);
    const normalized = applySubjectToStateRecord(record);
    await this.client.execute(
      `
      INSERT INTO ${this.tableName} (
        state_id,
        provider_id,
        subject_kind,
        subject_key,
        subject_payload,
        redirect_uri,
        requested_scopes,
        code_verifier,
        nonce,
        created_at,
        expires_at,
        consumed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(state_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        subject_kind = excluded.subject_kind,
        subject_key = excluded.subject_key,
        subject_payload = excluded.subject_payload,
        redirect_uri = excluded.redirect_uri,
        requested_scopes = excluded.requested_scopes,
        code_verifier = excluded.code_verifier,
        nonce = excluded.nonce,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        consumed_at = excluded.consumed_at
      `,
      [
        normalized.stateId,
        normalized.providerId,
        normalized.subject!.kind,
        getOAuthSubjectKey(normalized.subject!),
        JSON.stringify(normalized.subject),
        normalized.redirectUri,
        JSON.stringify(normalized.requestedScopes),
        normalized.codeVerifier ?? null,
        normalized.nonce ?? null,
        normalized.createdAt,
        normalized.expiresAt,
        normalized.consumedAt ?? null
      ]
    );
  }

  async get(stateId: string): Promise<OAuthStateRecord | null> {
    const rows = await this.client.query<OAuthStateRow>(
      `SELECT ${STATE_COLUMNS} FROM ${this.tableName} WHERE state_id = ? LIMIT 1`,
      [stateId]
    );

    return rows[0] ? mapStateRow(rows[0]) : null;
  }

  async consume(stateId: string, consumedAt: string): Promise<OAuthStateRecord | null> {
    const rows = await this.client.query<OAuthStateRow>(
      `
      SELECT ${STATE_COLUMNS}
      FROM ${this.tableName}
      WHERE state_id = ?
        AND consumed_at IS NULL
        AND expires_at > ?
      LIMIT 1
      `,
      [stateId, consumedAt]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const result = await this.client.execute(
      `
      UPDATE ${this.tableName}
      SET consumed_at = ?
      WHERE state_id = ?
        AND consumed_at IS NULL
        AND expires_at > ?
      `,
      [consumedAt, stateId, consumedAt]
    );

    if ((result.rowsAffected ?? 0) === 0) {
      return null;
    }

    return mapStateRow({
      ...row,
      consumed_at: consumedAt
    });
  }

  async deleteExpired(before: string): Promise<number> {
    const result = await this.client.execute(`DELETE FROM ${this.tableName} WHERE expires_at < ?`, [before]);
    return result.rowsAffected ?? 0;
  }
}

export class SqlTokenVault implements TokenVault {
  private readonly client: SqlClient;
  private readonly tableName: string;

  constructor(client: SqlClient, tableName = "oauth_tokens") {
    this.client = client;
    this.tableName = validateSqlIdentifier(tableName, "tableName");
  }

  async put(record: TokenRecord): Promise<void> {
    await this.client.execute(
      `
      INSERT INTO ${this.tableName} (
        token_id,
        tenant_id,
        user_id,
        provider_id,
        connection_id,
        encrypted_payload,
        key_ref,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        user_id = excluded.user_id,
        provider_id = excluded.provider_id,
        connection_id = excluded.connection_id,
        encrypted_payload = excluded.encrypted_payload,
        key_ref = excluded.key_ref,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
      `,
      [
        record.tokenId,
        record.tenantId,
        record.userId,
        record.providerId,
        record.connectionId,
        record.encryptedPayload,
        record.keyRef,
        record.createdAt,
        record.updatedAt,
        record.expiresAt ?? null
      ]
    );
  }

  async get(tokenId: string): Promise<TokenRecord | null> {
    const rows = await this.client.query<TokenRow>(
      `SELECT ${TOKEN_COLUMNS} FROM ${this.tableName} WHERE token_id = ? LIMIT 1`,
      [tokenId]
    );

    return rows[0] ? mapTokenRow(rows[0]) : null;
  }

  async getByConnection(connectionId: string): Promise<TokenRecord | null> {
    const rows = await this.client.query<TokenRow>(
      `SELECT ${TOKEN_COLUMNS} FROM ${this.tableName} WHERE connection_id = ? LIMIT 1`,
      [connectionId]
    );

    return rows[0] ? mapTokenRow(rows[0]) : null;
  }

  async rotateKey(tokenId: string, newKeyRef: string): Promise<void> {
    const existing = await this.get(tokenId);
    if (!existing || existing.keyRef === newKeyRef) {
      return;
    }

    throw new Error("Token key rotation requires re-encryption; use EncryptedTokenVault.rotateKey");
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    await this.client.execute(`DELETE FROM ${this.tableName} WHERE connection_id = ?`, [connectionId]);
  }
}

export class SqlOAuthConsentStore implements OAuthConsentStore {
  private readonly client: SqlClient;
  private readonly tableName: string;

  constructor(client: SqlClient, tableName = "oauth_consents") {
    this.client = client;
    this.tableName = validateSqlIdentifier(tableName, "tableName");
  }

  async put(record: OAuthConsentRecord): Promise<void> {
    validateOAuthConsentRecord(record);
    await this.client.execute(
      `
      INSERT INTO ${this.tableName} (
        consent_id,
        provider_id,
        subject_kind,
        subject_key,
        subject_payload,
        scope_set,
        granted_at,
        updated_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(consent_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        subject_kind = excluded.subject_kind,
        subject_key = excluded.subject_key,
        subject_payload = excluded.subject_payload,
        scope_set = excluded.scope_set,
        granted_at = excluded.granted_at,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata
      `,
      [
        record.consentId,
        record.providerId,
        record.subject.kind,
        getOAuthSubjectKey(record.subject),
        JSON.stringify(record.subject),
        JSON.stringify(record.scopes),
        record.grantedAt,
        record.updatedAt,
        record.metadata ? JSON.stringify(record.metadata) : null
      ]
    );
  }

  async get(consentId: string): Promise<OAuthConsentRecord | null> {
    const rows = await this.client.query<ConsentRow>(
      `SELECT ${CONSENT_COLUMNS} FROM ${this.tableName} WHERE consent_id = ? LIMIT 1`,
      [consentId]
    );

    return rows[0] ? mapConsentRow(rows[0]) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthConsentRecord[]> {
    validateOAuthStoredSubject(subject);
    const rows = await this.client.query<ConsentRow>(
      `SELECT ${CONSENT_COLUMNS} FROM ${this.tableName} WHERE provider_id = ? AND subject_key = ?`,
      [providerId, getOAuthSubjectKey(subject)]
    );

    return rows.map(mapConsentRow);
  }

  async delete(consentId: string): Promise<void> {
    await this.client.execute(`DELETE FROM ${this.tableName} WHERE consent_id = ?`, [consentId]);
  }
}

export class SqlOAuthRevocationFailureStore implements OAuthRevocationFailureStore {
  private readonly client: SqlClient;
  private readonly tableName: string;

  constructor(client: SqlClient, tableName = "oauth_revocation_failures") {
    this.client = client;
    this.tableName = validateSqlIdentifier(tableName, "tableName");
  }

  async put(record: OAuthRevocationFailureRecord): Promise<void> {
    validateOAuthRevocationFailureRecord(record);
    await this.client.execute(
      `
      INSERT INTO ${this.tableName} (
        failure_id,
        provider_id,
        subject_kind,
        subject_key,
        subject_payload,
        token_id,
        token_type_hint,
        error_code,
        error_message,
        retryable,
        occurred_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(failure_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        subject_kind = excluded.subject_kind,
        subject_key = excluded.subject_key,
        subject_payload = excluded.subject_payload,
        token_id = excluded.token_id,
        token_type_hint = excluded.token_type_hint,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        retryable = excluded.retryable,
        occurred_at = excluded.occurred_at,
        metadata = excluded.metadata
      `,
      [
        record.failureId,
        record.providerId,
        record.subject.kind,
        getOAuthSubjectKey(record.subject),
        JSON.stringify(record.subject),
        record.tokenId ?? null,
        record.tokenTypeHint ?? null,
        record.errorCode,
        record.errorMessage,
        record.retryable,
        record.occurredAt,
        record.metadata ? JSON.stringify(record.metadata) : null
      ]
    );
  }

  async get(failureId: string): Promise<OAuthRevocationFailureRecord | null> {
    const rows = await this.client.query<RevocationFailureRow>(
      `SELECT ${REVOCATION_FAILURE_COLUMNS} FROM ${this.tableName} WHERE failure_id = ? LIMIT 1`,
      [failureId]
    );

    return rows[0] ? mapRevocationFailureRow(rows[0]) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthRevocationFailureRecord[]> {
    validateOAuthStoredSubject(subject);
    const rows = await this.client.query<RevocationFailureRow>(
      `SELECT ${REVOCATION_FAILURE_COLUMNS} FROM ${this.tableName} WHERE provider_id = ? AND subject_key = ?`,
      [providerId, getOAuthSubjectKey(subject)]
    );

    return rows.map(mapRevocationFailureRow);
  }

  async delete(failureId: string): Promise<void> {
    await this.client.execute(`DELETE FROM ${this.tableName} WHERE failure_id = ?`, [failureId]);
  }
}

export function getOAuthStorageTableDefinitions(): ReadonlyArray<OAuthStorageTableDefinition> {
  return [
    {
      name: "oauth_states",
      fields: [
        { name: "state_id", type: "text", primaryKey: true },
        { name: "provider_id", type: "text" },
        { name: "subject_kind", type: "text" },
        { name: "subject_key", type: "text" },
        { name: "subject_payload", type: "json" },
        { name: "redirect_uri", type: "text" },
        { name: "requested_scopes", type: "json" },
        { name: "code_verifier", type: "text", nullable: true },
        { name: "nonce", type: "text", nullable: true },
        { name: "created_at", type: "text" },
        { name: "expires_at", type: "text" },
        { name: "consumed_at", type: "text", nullable: true }
      ],
      indexes: [{ name: "idx_oauth_states_expires_at", fields: ["expires_at"] }]
    },
    {
      name: "oauth_tokens",
      fields: [
        { name: "token_id", type: "text", primaryKey: true },
        { name: "tenant_id", type: "text" },
        { name: "user_id", type: "text" },
        { name: "provider_id", type: "text" },
        { name: "connection_id", type: "text", unique: true },
        { name: "encrypted_payload", type: "text" },
        { name: "key_ref", type: "text" },
        { name: "created_at", type: "text" },
        { name: "updated_at", type: "text" },
        { name: "expires_at", type: "text", nullable: true }
      ],
      indexes: [{ name: "idx_oauth_tokens_connection", fields: ["connection_id"] }]
    },
    {
      name: "oauth_consents",
      fields: [
        { name: "consent_id", type: "text", primaryKey: true },
        { name: "provider_id", type: "text" },
        { name: "subject_kind", type: "text" },
        { name: "subject_key", type: "text" },
        { name: "subject_payload", type: "json" },
        { name: "scope_set", type: "json" },
        { name: "granted_at", type: "text" },
        { name: "updated_at", type: "text" },
        { name: "metadata", type: "json", nullable: true }
      ],
      indexes: [{ name: "idx_oauth_consents_provider_subject", fields: ["provider_id", "subject_key"] }]
    },
    {
      name: "oauth_revocation_failures",
      fields: [
        { name: "failure_id", type: "text", primaryKey: true },
        { name: "provider_id", type: "text" },
        { name: "subject_kind", type: "text" },
        { name: "subject_key", type: "text" },
        { name: "subject_payload", type: "json" },
        { name: "token_id", type: "text", nullable: true },
        { name: "token_type_hint", type: "text", nullable: true },
        { name: "error_code", type: "text" },
        { name: "error_message", type: "text" },
        { name: "retryable", type: "boolean" },
        { name: "occurred_at", type: "text" },
        { name: "metadata", type: "json", nullable: true }
      ],
      indexes: [{ name: "idx_oauth_revocation_failures_provider_subject", fields: ["provider_id", "subject_key"] }]
    }
  ];
}

export function getOAuthStorageSchema(
  stateTable = "oauth_states",
  tokenTable = "oauth_tokens",
  consentTable = "oauth_consents",
  revocationFailureTable = "oauth_revocation_failures"
): ReadonlyArray<string> {
  const safeStateTable = validateSqlIdentifier(stateTable, "stateTable");
  const safeTokenTable = validateSqlIdentifier(tokenTable, "tokenTable");
  const safeConsentTable = validateSqlIdentifier(consentTable, "consentTable");
  const safeRevocationFailureTable = validateSqlIdentifier(revocationFailureTable, "revocationFailureTable");

  return [
    `
    CREATE TABLE IF NOT EXISTS ${safeStateTable} (
      state_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_payload TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      requested_scopes TEXT NOT NULL,
      code_verifier TEXT,
      nonce TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_${safeStateTable}_expires_at
    ON ${safeStateTable}(expires_at)
    `,
    `
    CREATE TABLE IF NOT EXISTS ${safeTokenTable} (
      token_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      connection_id TEXT NOT NULL UNIQUE,
      encrypted_payload TEXT NOT NULL,
      key_ref TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_${safeTokenTable}_connection
    ON ${safeTokenTable}(connection_id)
    `,
    `
    CREATE TABLE IF NOT EXISTS ${safeConsentTable} (
      consent_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_payload TEXT NOT NULL,
      scope_set TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_${safeConsentTable}_provider_subject
    ON ${safeConsentTable}(provider_id, subject_key)
    `,
    `
    CREATE TABLE IF NOT EXISTS ${safeRevocationFailureTable} (
      failure_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_payload TEXT NOT NULL,
      token_id TEXT,
      token_type_hint TEXT,
      error_code TEXT NOT NULL,
      error_message TEXT NOT NULL,
      retryable INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata TEXT
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_${safeRevocationFailureTable}_provider_subject
    ON ${safeRevocationFailureTable}(provider_id, subject_key)
    `
  ];
}

function mapStateRow(row: OAuthStateRow): OAuthStateRecord {
  const subject = parseSubject(row.subject_payload);
  return applySubjectToStateRecord({
    stateId: row.state_id,
    providerId: row.provider_id,
    subject,
    redirectUri: row.redirect_uri,
    requestedScopes: parseStringArray(row.requested_scopes, "requested_scopes"),
    codeVerifier: row.code_verifier ?? undefined,
    nonce: row.nonce ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? undefined
  });
}

function mapTokenRow(row: TokenRow): TokenRecord {
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

function mapConsentRow(row: ConsentRow): OAuthConsentRecord {
  return {
    consentId: row.consent_id,
    providerId: row.provider_id,
    subject: parseSubject(row.subject_payload),
    scopes: parseStringArray(row.scope_set, "scope_set"),
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? parseRecord(row.metadata, "metadata") : undefined
  };
}

function mapRevocationFailureRow(row: RevocationFailureRow): OAuthRevocationFailureRecord {
  return {
    failureId: row.failure_id,
    providerId: row.provider_id,
    subject: parseSubject(row.subject_payload),
    tokenId: row.token_id ?? undefined,
    tokenTypeHint: parseTokenTypeHint(row.token_type_hint),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryable: parseRetryable(row.retryable),
    occurredAt: row.occurred_at,
    metadata: row.metadata ? parseRecord(row.metadata, "metadata") : undefined
  };
}

function parseSubject(raw: string): OAuthStoredSubject {
  const subject = parseJsonValue<OAuthStoredSubject>(raw, "subject_payload");
  validateOAuthStoredSubject(subject);
  return cloneOAuthStoredSubject(subject);
}

function parseJsonValue<T>(raw: string, fieldName: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
}

function parseStringArray(raw: string, fieldName: string): string[] {
  const value = parseJsonValue<unknown>(raw, fieldName);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  return [...value];
}

function parseRecord(raw: string, fieldName: string): Record<string, unknown> {
  const value = parseJsonValue<unknown>(raw, fieldName);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return { ...value };
}

function parseTokenTypeHint(value: string | null): "access_token" | "refresh_token" | undefined {
  if (value === null) {
    return undefined;
  }
  if (value === "access_token" || value === "refresh_token") {
    return value;
  }
  throw new Error("token_type_hint must be access_token or refresh_token");
}

function parseRetryable(value: boolean): boolean;
function parseRetryable(value: number): boolean;
function parseRetryable(value: boolean | number): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  throw new Error("retryable must be a boolean or 0/1");
}

function validateSqlIdentifier(value: string, fieldName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${fieldName} must contain only letters, numbers, and underscores`);
  }
  return value;
}
