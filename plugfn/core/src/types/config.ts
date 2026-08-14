import type { Logger } from './action.js';
import type { RetryOptions } from './action.js';
import type { RateLimitConfig } from './provider.js';
import type { Adapter as DbAdapter, KVStoreAdapter } from '@superfunctions/db';
import type { AuthSession } from '@superfunctions/auth';
import type { PlugFnOAuthClientConfig, PlugFnSecretResolverConfig } from './runtime.js';
import type { Connection } from './connection.js';

export type PlugFnDatabaseAdapter = DbAdapter;
export type Adapter = PlugFnDatabaseAdapter;

export interface PlugFnPrincipal {
  userId: string;
  tenantId?: string;
  organizationId?: string;
  roles?: string[];
  grants?: string[];
  metadata?: Record<string, unknown>;
}

export type PlugFnConnectionOperation =
  | 'read'
  | 'disconnect'
  | 'revoke'
  | 'sync'
  | 'action'
  | 'checkpoint';

export interface PlugFnAuthorizationOptions {
  authorizeConnection?(input: {
    actor: PlugFnPrincipal;
    connection: Connection;
    operation: PlugFnConnectionOperation;
  }): Promise<boolean> | boolean;
}

/**
 * Auth provider interface
 */
export interface AuthProvider {
  authenticate?(request: Request): Promise<PlugFnPrincipal | AuthSession | null> | PlugFnPrincipal | AuthSession | null;
  getUserId?(request: any): Promise<string | null>;
  requireAuth?(request: any): Promise<string>;
}

/**
 * Integration configuration per provider
 */
export type IntegrationConfig =
  | OAuth2IntegrationConfig
  | PlugFnSecretResolverConfig
  | ApiKeyIntegrationConfig
  | JWTIntegrationConfig
  | BasicAuthIntegrationConfig;

export interface OAuth2IntegrationConfig extends PlugFnOAuthClientConfig {
  type?: 'oauth2';
}

export interface ApiKeyIntegrationConfig {
  type: 'api-key';
  apiKey: string;
}

export interface JWTIntegrationConfig {
  type: 'jwt';
  privateKey: string;
  publicKey?: string;
}

export interface BasicAuthIntegrationConfig {
  type: 'basic';
  username: string;
  password: string;
}

/**
 * Webhook configuration
 */
export interface WebhookOptions {
  verifySignatures?: boolean;
  allowedIPs?: string[];
  maxPayloadSize?: number;
}

/**
 * Global cache configuration
 */
export interface GlobalCacheConfig {
  enabled: boolean;
  ttl?: number;
  instance?: any;
  defaultTTL?: number;
  store?: KVStoreAdapter;
  keyPrefix?: string;
}

/**
 * Global rate limit configuration
 */
export interface GlobalRateLimitConfig {
  enabled: boolean;
  respectProviderLimits?: boolean;
  global?: RateLimitConfig;
}

/**
 * Global retry configuration
 */
export interface GlobalRetryConfig extends RetryOptions {
  enabled?: boolean;
}

/**
 * Main PlugFn configuration
 */
export interface PlugFnConfig {
  database: DbAdapter;
  cacheStore?: KVStoreAdapter;
  auth: AuthProvider;
  baseUrl: string;
  encryptionKey: string;
  integrations: Record<string, IntegrationConfig>;
  cache?: GlobalCacheConfig;
  rateLimit?: GlobalRateLimitConfig;
  retry?: GlobalRetryConfig;
  logger?: Logger;
  webhooks?: WebhookOptions;
  authorization?: PlugFnAuthorizationOptions;
}

/**
 * Metrics configuration
 */
export interface MetricsOptions {
  timeRange?: 'last-hour' | 'last-24h' | 'last-7d' | 'last-30d';
  groupBy?: 'provider' | 'action' | 'user';
  provider?: string;
  userId?: string;
}

/**
 * Metrics data
 */
export interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgResponseTime: number;
  byProvider?: ProviderMetrics[];
  byAction?: ActionMetrics[];
}

export interface ProviderMetrics {
  name: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  rateLimitHits: number;
}

export interface ActionMetrics {
  provider: string;
  action: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
}
