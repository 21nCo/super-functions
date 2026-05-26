import type { PlugFnActor, PlugFnConnectionOwner, PlugFnOwnerKind } from './runtime.js';

/**
 * Connection status
 */
export enum ConnectionStatus {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
  Error = 'error',
}

/**
 * User connection to a provider
 */
export interface Connection {
  id: string;
  userId: string;
  provider: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  tenantId?: string;
  organizationId?: string;
  installedByUserId?: string;
  delegatedToUserId?: string;
  grants?: string[];
  name?: string;
  status: ConnectionStatus;
  credentials: EncryptedCredentials;
  scopes?: string[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
  connectedAt: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Encrypted credentials stored in database
 */
export interface EncryptedCredentials {
  encrypted: string;
  algorithm: string;
  encryptedPayload?: string;
  keyRef?: string;
  tokenId?: string;
  schemaVersion?: string;
  iv?: string;
}

/**
 * Decrypted credentials for runtime use
 */
export type Credentials =
  | OAuth2Credentials
  | ApiKeyCredentials
  | JWTCredentials
  | BasicAuthCredentials;

export interface OAuth2Credentials {
  type: 'oauth2';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType?: string;
  scope?: string;
}

export interface ApiKeyCredentials {
  type: 'api-key';
  apiKey: string;
}

export interface JWTCredentials {
  type: 'jwt';
  token: string;
}

export interface BasicAuthCredentials {
  type: 'basic';
  username: string;
  password: string;
}

/**
 * Get auth URL options
 */
export interface GetAuthUrlOptions {
  userId: string;
  provider: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  connectionName?: string;
  owner?: PlugFnConnectionOwner;
  actor?: PlugFnActor;
  returnTo?: string;
  /** OAuth prompt parameter (e.g. Google `select_account`, `consent`). */
  prompt?: string;
  /** OAuth login_hint parameter (e.g. email prefill). */
  loginHint?: string;
}

/**
 * Disconnect operation result
 */
export interface DisconnectResult {
  disconnected: boolean;
  connectionId?: string;
  remoteRevokeAttempted: boolean;
  remoteRevokeSucceeded: boolean;
  localDeleted: boolean;
  connectionDeleted: boolean;
  revokeError?: {
    code?: string;
    message?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
}

/**
 * Handle OAuth callback options
 */
export interface HandleCallbackOptions {
  code: string;
  state: string;
  provider?: string;
  redirectUri?: string;
  connectionName?: string;
}

/**
 * OAuth callback completion result
 */
export interface HandleCallbackResult {
  connection: Connection;
  returnTo?: string;
}

/**
 * List connections options
 */
export interface ListConnectionsOptions {
  userId: string;
  provider?: string;
  status?: ConnectionStatus;
  owner?: PlugFnConnectionOwner;
}

/**
 * Disconnect options
 */
export interface DisconnectOptions {
  userId: string;
  provider: string;
  connectionId?: string;
  owner?: PlugFnConnectionOwner;
  actor?: PlugFnActor;
}

export interface StartConnectionOptions extends GetAuthUrlOptions {}
