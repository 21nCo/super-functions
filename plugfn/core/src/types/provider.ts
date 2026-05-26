import type { Action } from './action.js';
import type { Trigger } from './trigger.js';
import type { PlugFnConnectionOwner, PlugFnPersistenceSink } from './runtime.js';

/**
 * Authentication types supported by providers
 */
export enum AuthType {
  OAuth2 = 'oauth2',
  ApiKey = 'api-key',
  JWT = 'jwt',
  Basic = 'basic',
  None = 'none',
}

/**
 * OAuth 2.0 configuration
 */
export interface OAuth2Config {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator?: string;
  getAuthParams?: (config: OAuth2RuntimeConfig) => Record<string, string>;
  getTokenParams?: (config: OAuth2RuntimeConfig, code: string) => Record<string, any>;
  refreshToken?: (config: OAuth2RuntimeConfig, refreshToken: string) => Promise<TokenResponse>;
}

export interface OAuth2RuntimeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * API Key configuration
 */
export interface ApiKeyConfig {
  headerName?: string;
  paramName?: string;
  prefix?: string;
}

/**
 * JWT configuration
 */
export interface JWTConfig {
  algorithm: string;
  publicKey?: string;
  privateKey?: string;
  issuer?: string;
  audience?: string;
}

/**
 * Basic Auth configuration
 */
export interface BasicAuthConfig {
  usernameField?: string;
  passwordField?: string;
}

/**
 * Authentication configuration union
 */
export type AuthConfig =
  | { type: AuthType.OAuth2; config: OAuth2Config }
  | { type: AuthType.ApiKey; config: ApiKeyConfig }
  | { type: AuthType.JWT; config: JWTConfig }
  | { type: AuthType.Basic; config: BasicAuthConfig }
  | { type: AuthType.None; config?: never };

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requests: number;
  window: number; // milliseconds
  strategy?: 'sliding' | 'fixed';
}

/**
 * Provider metadata and configuration
 */
export interface Provider<TActions extends Record<string, Action<any, any>> = any> {
  name: string;
  displayName: string;
  version: string;
  description: string;
  iconUrl?: string;
  auth: AuthConfig;
  baseUrl: string;
  actions: TActions;
  triggers?: Record<string, Trigger<any>>;
  rateLimit?: RateLimitConfig;
  headers?: Record<string, string>;
  transformRequest?: (request: any) => any;
  transformResponse?: (response: any) => any;
  webhooks?: PlugFnWebhookDefinition[];
  sync?: Record<string, PlugFnSyncResourceDefinition<any, any>>;
  capabilities?: PlugFnProviderCapabilities;
  defaultPolicies?: PlugFnProviderPolicy[];
}

export type PlugFnProviderDefinition<
  TActions extends Record<string, Action<any, any>> = Record<string, Action<any, any>>,
> = Provider<TActions> & {
  id?: string;
};

export interface PlugFnProviderCapabilities {
  oauth?: boolean;
  webhooks?: boolean;
  sync?: boolean;
  actions?: boolean;
  organizationInstallations?: boolean;
  delegatedInstallations?: boolean;
  sinks?: boolean;
  [capability: string]: boolean | undefined;
}

export interface PlugFnProviderPolicy {
  id: string;
  description?: string;
  enforce(input: {
    owner?: PlugFnConnectionOwner;
    action?: string;
    resource?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface PlugFnWebhookDefinition {
  id: string;
  route?: string;
  events?: string[];
  resolveEvent?(input: {
    headers: Record<string, string>;
    payload: unknown;
    path?: string;
  }): string;
  idempotencyKey?(input: {
    headers: Record<string, string>;
    payload: unknown;
  }): string | undefined;
  normalize?(payload: unknown): unknown;
}

export interface PlugFnSyncResourceDefinition<Checkpoint = unknown, Item = unknown> {
  resource: string;
  defaultSinkId?: string;
  initialCheckpoint?: Checkpoint;
  fetch(input: PlugFnSyncFetchInput<Checkpoint>): Promise<PlugFnSyncFetchResult<Checkpoint, Item>>;
}

export interface PlugFnSyncFetchInput<Checkpoint = unknown> {
  provider: string;
  resource: string;
  connectionId: string;
  mode: 'full' | 'incremental';
  checkpoint?: Checkpoint;
  cursor?: string;
  signal?: AbortSignal;
}

export interface PlugFnSyncFetchResult<Checkpoint = unknown, Item = unknown> {
  items: Item[];
  checkpoint?: Checkpoint;
  cursor?: string;
  done?: boolean;
  partial?: boolean;
  sinkId?: string;
}

export type PlugFnProviderActions<P> = P extends Provider<infer TActions> ? TActions : never;

export type PlugFnActionParams<TAction> = TAction extends Action<infer TParams, any>
  ? TParams
  : never;

export type PlugFnActionReturn<TAction> = TAction extends Action<any, infer TReturn>
  ? TReturn
  : never;

export type PlugFnPersistenceSinkFactory<Raw = unknown, RecordValue = unknown> = (
  sink: PlugFnPersistenceSink<Raw, RecordValue>
) => PlugFnPersistenceSink<Raw, RecordValue>;

/**
 * Provider status
 */
export enum ProviderStatus {
  Available = 'available',
  Configured = 'configured',
  Unavailable = 'unavailable',
}

/**
 * Provider info returned to users
 */
export interface ProviderInfo {
  name: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  authType: AuthType;
  status: ProviderStatus;
  version: string;
  actionsCount: number;
  triggersCount: number;
}
