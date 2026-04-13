export interface OAuthConnectionSubject {
  kind: "connection";
  tenantId: string;
  userId: string;
  connectionId?: string;
}

export interface OAuthBrowserAuthSubject {
  kind: "browser-auth";
  intentId: string;
  tenantId?: string;
  regionId?: string;
  returnTo?: string;
  metadata?: Record<string, unknown>;
}

export type OAuthStoredSubject = OAuthConnectionSubject | OAuthBrowserAuthSubject;

export interface OAuthStateRecord {
  stateId: string;
  providerId: string;
  redirectUri: string;
  requestedScopes: string[];
  subject?: OAuthStoredSubject;
  tenantId?: string;
  userId?: string;
  connectionId?: string;
  intentId?: string;
  regionId?: string;
  returnTo?: string;
  metadata?: Record<string, unknown>;
  codeVerifier?: string;
  nonce?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface TokenRecord {
  tokenId: string;
  tenantId: string;
  userId: string;
  providerId: string;
  connectionId: string;
  encryptedPayload: string;
  keyRef: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface OAuthConsentRecord {
  consentId: string;
  providerId: string;
  subject: OAuthStoredSubject;
  scopes: string[];
  grantedAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface OAuthRevocationFailureRecord {
  failureId: string;
  providerId: string;
  subject: OAuthStoredSubject;
  tokenId?: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface OAuthStateStore {
  put(record: OAuthStateRecord): Promise<void>;
  get(stateId: string): Promise<OAuthStateRecord | null>;
  consume(stateId: string, consumedAt: string): Promise<OAuthStateRecord | null>;
  deleteExpired(before: string): Promise<number>;
}

export interface TokenVault {
  put(record: TokenRecord): Promise<void>;
  get(tokenId: string): Promise<TokenRecord | null>;
  getByConnection(connectionId: string): Promise<TokenRecord | null>;
  rotateKey(tokenId: string, newKeyRef: string): Promise<void>;
  deleteByConnection(connectionId: string): Promise<void>;
}

export interface OAuthConsentStore {
  put(record: OAuthConsentRecord): Promise<void>;
  get(consentId: string): Promise<OAuthConsentRecord | null>;
  listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthConsentRecord[]>;
  delete(consentId: string): Promise<void>;
}

export interface OAuthRevocationFailureStore {
  put(record: OAuthRevocationFailureRecord): Promise<void>;
  get(failureId: string): Promise<OAuthRevocationFailureRecord | null>;
  listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthRevocationFailureRecord[]>;
  delete(failureId: string): Promise<void>;
}

export interface OAuthStorageFieldDefinition {
  name: string;
  type: "text" | "json" | "boolean";
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
}

export interface OAuthStorageIndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface OAuthStorageTableDefinition {
  name: string;
  fields: OAuthStorageFieldDefinition[];
  indexes?: OAuthStorageIndexDefinition[];
}

export * from "./state-store.js";
export * from "./token-vault.js";
export * from "./adapters/memory.js";
export * from "./adapters/sql.js";
export * from "./adapters/db.js";
