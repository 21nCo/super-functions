/**
 * Types for authfn
 */

import type { AuthSession } from '@superfunctions/auth';
import type { Adapter } from '@superfunctions/db';
import type { Router } from '@superfunctions/http';

/**
 * API key session extends base AuthSession
 */
export interface ApiKeySession extends AuthSession {
  type: 'api-key';
  keyId: string;
  name: string;
}

/**
 * API key data stored in database
 */
export interface ApiKey {
  id: string;
  key: string;
  name: string;
  resourceIds: string[];
  scopes?: string[];
  metadata?: Record<string, any>;
  expiresAt?: Date | string;
  lastUsedAt?: Date | string;
  revokedAt?: Date | string;
  createdAt: Date | string;
}

/**
 * Configuration for authfn
 */
export interface AuthFnConfig {
  /** Database adapter */
  database: Adapter;

  /** Namespace for table prefixing (default: 'authfn') */
  namespace?: string;

  /** Mount management API (default: false) */
  enableApi?: boolean;

  /** API configuration (required if enableApi is true) */
  apiConfig?: {
    /** Base path for API routes (default: '/auth') */
    basePath?: string;
    /** Admin API key for managing keys (optional) */
    adminKey?: string;
  };
}

/**
 * AuthFn instance with provider and optional router
 */
export interface AuthFnInstance {
  /** Auth provider for use with other libraries */
  provider: {
    authenticate: (request: Request) => Promise<ApiKeySession | null>;
    authorize: (session: ApiKeySession, resourceId: string) => Promise<boolean>;
    revoke: (sessionId: string) => Promise<void>;
  };

  /** Management API router (if enabled) */
  router?: Router;

  /** Create a new API key */
  createKey: (data: {
    name: string;
    resourceIds: string[];
    scopes?: string[];
    metadata?: Record<string, any>;
    expiresAt?: Date;
  }) => Promise<{ id: string; key: string }>;

  /** Revoke an API key */
  revokeKey: (keyId: string) => Promise<void>;

  /** Get API key by ID */
  getKey: (keyId: string) => Promise<ApiKey | null>;

  /** List API keys */
  listKeys: (filters?: { resourceId?: string }) => Promise<ApiKey[]>;
}
