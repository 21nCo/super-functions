import type { Adapter as DbAdapter } from '@superfunctions/db';
import { randomBytes } from 'node:crypto';
import type {
  Connection,
  Credentials,
  DisconnectOptions,
  DisconnectResult,
  EncryptedCredentials,
  GetAuthUrlOptions,
  HandleCallbackOptions,
  HandleCallbackResult,
  ListConnectionsOptions,
  OAuth2Credentials,
} from '../types/connection.js';
import { ConnectionStatus } from '../types/connection.js';
import type { PlugFnConnectionOwner, PlugFnProviderRuntimeContext } from '../types/runtime.js';
import type { Provider, OAuth2Config } from '../types/provider.js';
import { AuthType } from '../types/provider.js';
import type { Logger } from '../types/action.js';
import { ConnectionStorage } from '../storage/connection-storage.js';
import { SecureTokenStorage } from '../storage/token-storage.js';
import {
  type OAuthProviderDescriptor,
  type OAuthTokenSet,
} from '@superfunctions/oauth-core';
import {
  DefaultOAuthTokenHttpClient,
  type OAuthTokenHttpClient,
} from '@superfunctions/oauth-http';
import { createOAuthFlowService, type OAuthFlowDisconnectResult, type OAuthFlowService } from '@superfunctions/oauth-flow';
import {
  type OAuthStateRecord,
  type OAuthStateStore,
  type TokenRecord,
  EncryptedTokenVault,
} from '@superfunctions/oauth-storage';
import { oauthProviderDescriptors } from '@superfunctions/oauth-providers';
import { ensurePlugFnDatabaseAdapter, type PlugFnDatabaseStorageAdapter } from '../storage/adapters/database.js';
import { createPlugFnOAuthStateStore } from '../storage/oauth-state-store.js';
import {
  createPlugFnEncryptedTokenVault,
  DEFAULT_TOKEN_KEY_REF,
} from '../storage/oauth-token-vault.js';
import { ownerFields } from '../storage/runtime-storage.js';

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

interface OAuthSecretResolverConfig {
  resolveOAuthClient(
    context: PlugFnProviderRuntimeContext
  ): Promise<OAuthClientConfig | null> | OAuthClientConfig | null;
}

export interface ConnectionManagerOAuthDependencies {
  oauthFlowService: OAuthFlowService;
  oauthStateStore: OAuthStateStore;
  encryptedTokenVault: EncryptedTokenVault;
  keyRef: string;
  actionLogAdapter: PlugFnDatabaseStorageAdapter;
}

interface CreateConnectionManagerOAuthDependenciesInput {
  database: DbAdapter;
  providers: ProviderLookup;
  integrationConfigs: Map<string, any>;
  baseUrl: string;
  encryptionKey: string;
  tokenHttpClient?: OAuthTokenHttpClient;
  now?: () => Date;
  logger?: Logger;
}

interface ProviderLookup {
  get(name: string): Provider | undefined;
  list(): Provider[];
}

export class ConnectionSelectionError extends Error {
  readonly code = 'CONNECTION_AMBIGUOUS';
  readonly status = 409;

  constructor(message = 'multiple active connections require explicit connectionId') {
    super(message);
    this.name = 'ConnectionSelectionError';
  }
}

class ConnectionResolutionError extends Error {
  constructor(
    readonly code: 'TENANT_ACCESS_DENIED' | 'VALIDATION_ERROR',
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ConnectionResolutionError';
  }
}

export function createConnectionManagerOAuthDependencies(
  input: CreateConnectionManagerOAuthDependenciesInput
): ConnectionManagerOAuthDependencies {
  const now = input.now ?? (() => new Date());
  const tokenHttpClient = input.tokenHttpClient ?? new DefaultOAuthTokenHttpClient();
  const actionLogAdapter = ensurePlugFnDatabaseAdapter(input.database);
  const runtimeStorage = actionLogAdapter;
  const stateStore = createPlugFnOAuthStateStore(input.database);
  const { encryptedTokenVault } = createPlugFnEncryptedTokenVault({
    database: input.database,
    encryptionKey: input.encryptionKey,
    now: () => now().toISOString(),
  });

  const oauthProviderMap = createProviderDescriptorRegistry(input.providers);
  const oauthClientConfigMap = createOAuthClientConfigMap(input.integrationConfigs, input.baseUrl);
  const oauthRuntimeConfigMap = createDynamicOAuthRuntimeConfigMap(oauthClientConfigMap);
  const oauthRuntimeConfigResolver = createOAuthRuntimeConfigResolver(
    input.integrationConfigs,
    oauthClientConfigMap,
    input.baseUrl
  );
  const oauthFlowService = createOAuthFlowService({
    providers: oauthProviderMap,
    providerRuntimeConfig: oauthRuntimeConfigMap,
    resolveProviderRuntimeConfig: oauthRuntimeConfigResolver,
    stateStore,
    tokenVault: encryptedTokenVault,
    tokenHttpClient,
    keyRef: DEFAULT_TOKEN_KEY_REF,
    now,
    emitEvent: (event) => {
      if (!event.name.startsWith('oauth.flow.disconnect')) {
        return;
      }

      const payload = {
        requestId: event.requestId,
        providerId: event.providerId,
        connectionId: event.connectionId,
        ok: event.ok,
        errorCode: event.errorCode,
        details: event.details,
      };

      if (event.ok) {
        input.logger?.info(`[oauth] ${event.name}`, payload);
      } else {
        input.logger?.warn(`[oauth] ${event.name}`, payload);
      }
    },
    identityHooks: {
      onDisconnected: async ({ connectionId }) => {
        await runtimeStorage.deleteConnection(connectionId);
        return {
          attempted: true,
          deleted: true,
          reason: 'deleted' as const,
        };
      },
    },
  });

  return {
    oauthFlowService,
    oauthStateStore: stateStore,
    encryptedTokenVault,
    keyRef: DEFAULT_TOKEN_KEY_REF,
    actionLogAdapter,
  };
}

export class ConnectionNotFoundError extends Error {
  readonly code = 'CONNECTION_NOT_FOUND';
  readonly status = 404;

  constructor(id: string) {
    super(`Connection ${id} not found`);
    this.name = 'ConnectionNotFoundError';
  }
}

export class ConnectionManager {
  private readonly tokenStorage: SecureTokenStorage;
  private readonly oauthFlowService: OAuthFlowService;
  private readonly oauthStateStore: OAuthStateStore;
  private readonly encryptedTokenVault: EncryptedTokenVault;
  private readonly keyRef: string;
  private readonly actionLogAdapter: PlugFnDatabaseStorageAdapter;
  private readonly refreshInFlight = new Map<string, Promise<Connection>>();

  constructor(
    private connectionStorage: ConnectionStorage,
    private providers: ProviderLookup,
    private integrationConfigs: Map<string, any>,
    private baseUrl: string,
    encryptionKey: string,
    private logger: Logger,
    oauthDependencies: ConnectionManagerOAuthDependencies
  ) {
    this.tokenStorage = new SecureTokenStorage(encryptionKey);
    this.oauthFlowService = oauthDependencies.oauthFlowService;
    this.oauthStateStore = oauthDependencies.oauthStateStore;
    this.encryptedTokenVault = oauthDependencies.encryptedTokenVault;
    this.keyRef = oauthDependencies.keyRef;
    this.actionLogAdapter = oauthDependencies.actionLogAdapter;
  }

  async getAuthUrl(options: GetAuthUrlOptions): Promise<string> {
    const provider = this.providers.get(options.provider);
    if (!provider) {
      throw new Error(`Provider ${options.provider} not found`);
    }

    if (provider.auth.type !== AuthType.OAuth2) {
      throw new Error(`Provider ${options.provider} does not support OAuth`);
    }

    const oauthConfig = provider.auth.config as OAuth2Config;
    const owner = options.owner ?? { kind: 'user', userId: options.userId } satisfies PlugFnConnectionOwner;
    const metadata = buildConnectionStateMetadata(owner, options.returnTo);
    const result = await this.oauthFlowService.start({
      providerId: options.provider,
      tenantId: owner.tenantId ?? options.userId,
      userId: options.userId,
      redirectUri: options.redirectUri,
      scopes: options.scopes ?? oauthConfig.scopes,
      prompt: options.prompt,
      loginHint: options.loginHint,
      metadata,
    });

    const persistedState = await this.oauthStateStore.get(result.stateId);
    if (persistedState) {
      await this.oauthStateStore.put(
        enrichOAuthStateWithPlugFnMetadata(persistedState, metadata, owner.tenantId ?? persistedState.tenantId)
      );
    }

    this.logger.info(`Generated auth URL for ${options.provider}`, { userId: options.userId });
    return result.authorizationUrl;
  }

  async handleCallback(options: HandleCallbackOptions): Promise<HandleCallbackResult> {
    const statePreview = await this.oauthStateStore.get(options.state);
    if (!statePreview) {
      throw new Error('OAuth state is invalid or expired');
    }

    const returnTo = readReturnToFromMetadata(readPlugFnOAuthStateMetadata(statePreview));
    const providerId = options.provider ?? statePreview.providerId;
    const redirectUri = options.redirectUri ?? statePreview.redirectUri;
    if (!providerId || !redirectUri) {
      throw new Error('OAuth state is invalid or expired');
    }

    const callbackResult = await this.oauthFlowService.handleCallback({
      providerId,
      code: options.code,
      state: options.state,
      redirectUri,
    });
    const subjectUserId = callbackResult.subject.userId ?? statePreview.userId;
    const callbackConnectionId = callbackResult.connectionId;
    if (!subjectUserId || !callbackConnectionId) {
      throw new Error('OAuth callback did not resolve a stable connection subject');
    }

    const credentials = this.toOAuth2Credentials(callbackResult.tokenSet);
    const pendingTokenEntry = await this.encryptedTokenVault.getTokenSetByConnection(
      callbackConnectionId
    );
    if (!pendingTokenEntry) {
      throw new Error(`OAuth token record missing for connection ${callbackConnectionId}`);
    }

    const connection = await this.connectionStorage.create({
      userId: subjectUserId,
      provider: providerId,
      ...ownerFields(
        readConnectionOwnerFromMetadata(readPlugFnOAuthStateMetadata(statePreview), subjectUserId)
      ),
      name: options.connectionName,
      status: ConnectionStatus.Active,
      credentials: toEncryptedCredentials(pendingTokenEntry.record),
      scopes: statePreview.requestedScopes,
      expiresAt: credentials.expiresAt,
      connectedAt: new Date(),
    });

    const persistedTokenRecord = await this.rebindTokenConnection(
      callbackConnectionId,
      connection.id
    );

    const updatedConnection = await this.connectionStorage.update(connection.id, {
      credentials: toEncryptedCredentials(persistedTokenRecord),
      expiresAt: credentials.expiresAt,
      status: ConnectionStatus.Active,
    });

    this.logger.info(`Connection created: ${providerId}`, {
      userId: subjectUserId,
      connectionId: updatedConnection.id,
    });

    return {
      connection: updatedConnection,
      returnTo,
    };
  }

  async list(options: ListConnectionsOptions): Promise<Connection[]> {
    if (!options.owner) {
      return this.connectionStorage.list(options.userId, options.provider, options.status);
    }

    const expected = ownerFields(options.owner);
    return this.connectionStorage.listByOwner(
      expected.ownerKind!,
      expected.ownerId!,
      options.provider,
      options.status,
      expected.tenantId
    );
  }

  async get(id: string): Promise<Connection> {
    const connection = await this.connectionStorage.get(id);
    if (!connection) {
      throw new ConnectionNotFoundError(id);
    }
    return connection;
  }

  async getByUserAndProvider(userId: string, provider: string): Promise<Connection | null> {
    return this.connectionStorage.getByUserAndProvider(userId, provider);
  }

  async resolveConnectionForAction(options: {
    userId: string;
    provider: string;
    connectionId?: string;
  }): Promise<Connection | null> {
    if (options.connectionId) {
      const connection = await this.get(options.connectionId);
      if (!connectionBelongsToUser(connection, options.userId)) {
        throw new ConnectionResolutionError(
          'TENANT_ACCESS_DENIED',
          'connection owner mismatch',
          403
        );
      }
      if (connection.provider !== options.provider) {
        throw new ConnectionResolutionError(
          'VALIDATION_ERROR',
          'connection provider mismatch',
          400
        );
      }
      return connection;
    }

    const activeConnections = await this.connectionStorage.list(
      options.userId,
      options.provider,
      ConnectionStatus.Active
    );

    if (activeConnections.length === 0) {
      return null;
    }

    if (activeConnections.length === 1) {
      return activeConnections[0];
    }

    const sortedConnections = [...activeConnections].sort(compareConnectionPriority);
    if (compareConnectionPriority(sortedConnections[0], sortedConnections[1]) === 0) {
      throw new ConnectionSelectionError();
    }

    return sortedConnections[0];
  }

  async disconnect(options: DisconnectOptions): Promise<DisconnectResult> {
    const startedAt = Date.now();
    const targetConnection = options.connectionId
      ? await this.connectionStorage.get(options.connectionId)
      : await this.connectionStorage.getByUserAndProvider(options.userId, options.provider);

    if (!targetConnection) {
      return {
        disconnected: false,
        remoteRevokeAttempted: false,
        remoteRevokeSucceeded: false,
        localDeleted: false,
        connectionDeleted: false,
      };
    }

    if (options.owner) {
      const expected = ownerFields(options.owner);
      if (
        targetConnection.ownerKind &&
        (targetConnection.ownerKind !== expected.ownerKind || targetConnection.ownerId !== expected.ownerId)
      ) {
        throw {
          code: 'TENANT_ACCESS_DENIED',
          message: 'connection owner mismatch',
          status: 403,
        };
      }
    }

    const provider = this.providers.get(targetConnection.provider);
    if (!provider || provider.auth.type !== AuthType.OAuth2) {
      await this.connectionStorage.delete(targetConnection.id);
      const result: DisconnectResult = {
        disconnected: true,
        connectionId: targetConnection.id,
        remoteRevokeAttempted: false,
        remoteRevokeSucceeded: false,
        localDeleted: true,
        connectionDeleted: true,
      };
      this.logger.info(`Connection deleted: ${targetConnection.id}`);
      await this.persistDisconnectActionLog(options.userId, targetConnection, result, startedAt);
      return result;
    }

    try {
      const flowResult = await this.oauthFlowService.disconnect({
        connectionId: targetConnection.id,
        providerId: targetConnection.provider,
        revokeRemote: true,
        tokenTypeHint: 'access_token',
      });
      const result = toDisconnectResult(flowResult, targetConnection.id);
      this.logger.info(`Connection deleted: ${targetConnection.id}`, {
        remoteRevokeAttempted: result.remoteRevokeAttempted,
        remoteRevokeSucceeded: result.remoteRevokeSucceeded,
      });
      await this.persistDisconnectActionLog(options.userId, targetConnection, result, startedAt);
      return result;
    } catch (error) {
      if (isDisconnectRevokeFailureAfterLocalCleanup(error)) {
        await this.connectionStorage.delete(targetConnection.id).catch(() => undefined);
        const revokeError = extractDisconnectRevokeError(error);
        const result: DisconnectResult = {
          disconnected: true,
          connectionId: targetConnection.id,
          remoteRevokeAttempted: true,
          remoteRevokeSucceeded: false,
          localDeleted: true,
          connectionDeleted: true,
          revokeError,
        };
        this.logger.warn('Disconnect completed locally; remote token revoke failed', {
          provider: targetConnection.provider,
          connectionId: targetConnection.id,
          revokeError,
        });
        await this.persistDisconnectActionLog(options.userId, targetConnection, result, startedAt);
        return result;
      }

      this.logger.warn('Disconnect failed', {
        provider: targetConnection.provider,
        connectionId: targetConnection.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async persistDisconnectActionLog(
    userId: string,
    connection: Connection,
    result: DisconnectResult,
    startedAt: number
  ): Promise<void> {
    try {
      await this.actionLogAdapter.createActionLog({
        id: `log_${randomBytes(12).toString('hex')}`,
        userId,
        provider: connection.provider,
        action: 'connections.disconnect',
        connectionId: connection.id,
        status:
          result.disconnected && (!result.remoteRevokeAttempted || result.remoteRevokeSucceeded)
            ? 'success'
            : 'error',
        durationMs: Date.now() - startedAt,
        retries: 0,
        cached: false,
        executedAt: new Date(),
        metadata: {
          remoteRevokeAttempted: result.remoteRevokeAttempted,
          remoteRevokeSucceeded: result.remoteRevokeSucceeded,
          localDeleted: result.localDeleted,
          connectionDeleted: result.connectionDeleted,
          revokeError: result.revokeError,
        },
      });
    } catch (error) {
      this.logger.error('Failed to persist disconnect action log', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async refresh(connectionId: string): Promise<Connection> {
    const existing = this.refreshInFlight.get(connectionId);
    if (existing) {
      return existing;
    }

    const refreshPromise = this.performRefresh(connectionId).finally(() => {
      this.refreshInFlight.delete(connectionId);
    });
    this.refreshInFlight.set(connectionId, refreshPromise);
    return refreshPromise;
  }

  private async performRefresh(connectionId: string): Promise<Connection> {
    const connection = await this.get(connectionId);
    const provider = this.providers.get(connection.provider);

    if (!provider || provider.auth.type !== AuthType.OAuth2) {
      throw new Error('Token refresh not supported for this provider');
    }

    const refreshedTokenSet = await this.oauthFlowService.refresh({
      connectionId: connection.id,
      providerId: connection.provider,
      redirectUri: this.resolveRefreshRedirectUri(connection.provider),
      scopes: connection.scopes ?? [],
    });
    const mergedCredentials = this.toOAuth2Credentials(refreshedTokenSet);
    const tokenRecordEntry = await this.encryptedTokenVault.getTokenSetByConnection(connection.id);
    if (!tokenRecordEntry) {
      throw new Error(`OAuth token record missing for connection ${connection.id}`);
    }

    const updated = await this.connectionStorage.update(connection.id, {
      credentials: toEncryptedCredentials(tokenRecordEntry.record),
      expiresAt: mergedCredentials.expiresAt,
      status: ConnectionStatus.Active,
    });

    this.logger.info(`Connection refreshed: ${connection.id}`);
    return updated;
  }

  async getCredentials(connectionId: string): Promise<Credentials> {
    const connection = await this.get(connectionId);
    const provider = this.providers.get(connection.provider);

    if (provider?.auth.type === AuthType.OAuth2) {
      if (
        connection.status === ConnectionStatus.Active &&
        connection.expiresAt &&
        new Date() >= connection.expiresAt
      ) {
        const refreshedConnection = await this.refresh(connectionId);
        const refreshedToken = await this.encryptedTokenVault.getTokenSetByConnection(refreshedConnection.id);
        if (refreshedToken) {
          return this.toOAuth2Credentials(refreshedToken.tokenSet);
        }
        return this.decryptLegacyCredentials(refreshedConnection);
      }

      const storedToken = await this.encryptedTokenVault.getTokenSetByConnection(connection.id);
      if (storedToken) {
        return this.toOAuth2Credentials(storedToken.tokenSet);
      }

      return this.decryptLegacyCredentials(connection);
    }

    return this.decryptNonOAuthCredentials(connection);
  }

  async markUsed(connectionId: string): Promise<void> {
    await this.connectionStorage.updateLastUsed(connectionId);
  }

  async isValid(connectionId: string): Promise<boolean> {
    try {
      const connection = await this.get(connectionId);
      if (connection.status !== ConnectionStatus.Active) {
        return false;
      }

      if (connection.expiresAt && new Date() >= connection.expiresAt) {
        try {
          await this.refresh(connectionId);
          return true;
        } catch {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private resolveRefreshRedirectUri(providerId: string): string {
    const integrationConfig = this.integrationConfigs.get(providerId);
    if (integrationConfig && Array.isArray(integrationConfig.redirectUris) && integrationConfig.redirectUris[0]) {
      return integrationConfig.redirectUris[0];
    }

    return `${this.baseUrl}/api/plugfn/callback`;
  }

  private toOAuth2Credentials(tokenSet: OAuthTokenSet): OAuth2Credentials {
    return {
      type: 'oauth2',
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      expiresAt: tokenSet.expiresAt ? new Date(tokenSet.expiresAt) : undefined,
      tokenType: tokenSet.tokenType,
      scope: tokenSet.scope,
    };
  }

  private async rebindTokenConnection(
    fromConnectionId: string,
    toConnectionId: string
  ): Promise<TokenRecord> {
    const existing = await this.encryptedTokenVault.getTokenSetByConnection(fromConnectionId);
    if (!existing) {
      throw new Error(`OAuth token record missing for connection ${fromConnectionId}`);
    }

    const rewritten = await this.encryptedTokenVault.putTokenSet({
      tokenId: existing.record.tokenId,
      tenantId: existing.record.tenantId,
      userId: existing.record.userId,
      providerId: existing.record.providerId,
      connectionId: toConnectionId,
      tokenSet: existing.tokenSet,
      keyRef: existing.record.keyRef || this.keyRef,
      createdAt: existing.record.createdAt,
      updatedAt: existing.record.updatedAt,
      expiresAt: existing.record.expiresAt,
    });

    if (fromConnectionId !== toConnectionId) {
      await this.encryptedTokenVault.deleteByConnection(fromConnectionId);
    }

    return rewritten;
  }

  private decryptLegacyCredentials(connection: Connection): Credentials {
    return this.tokenStorage.decryptCredentials(connection.credentials);
  }

  private decryptNonOAuthCredentials(connection: Connection): Credentials {
    try {
      return this.tokenStorage.decryptCredentials(connection.credentials);
    } catch (error) {
      const integrationConfig = this.integrationConfigs.get(connection.provider);
      if (integrationConfig?.type === 'api-key' && integrationConfig.apiKey) {
        return {
          type: 'api-key',
          apiKey: integrationConfig.apiKey,
        };
      }

      if (integrationConfig?.type === 'basic' && integrationConfig.username && integrationConfig.password) {
        return {
          type: 'basic',
          username: integrationConfig.username,
          password: integrationConfig.password,
        };
      }

      if (integrationConfig?.type === 'jwt' && integrationConfig.privateKey) {
        return {
          type: 'jwt',
          token: integrationConfig.privateKey,
        };
      }

      throw error;
    }
  }
}

function connectionBelongsToUser(connection: Connection, userId: string): boolean {
  if (connection.userId === userId) {
    return true;
  }

  if (connection.ownerKind === 'user' && connection.ownerId === userId) {
    return true;
  }

  if (connection.ownerKind === 'organization' && connection.installedByUserId === userId) {
    return true;
  }

  if (connection.ownerKind === 'delegated' && connection.delegatedToUserId === userId) {
    return true;
  }

  return false;
}

function createProviderDescriptorRegistry(
  providers: ProviderLookup
): Record<string, OAuthProviderDescriptor> {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const provider = providers.get(property);
        if (!provider || provider.auth.type !== AuthType.OAuth2) {
          return undefined;
        }
        return buildOAuthProviderDescriptor(property, provider);
      },
      has: (_target, property) => {
        if (typeof property !== 'string') {
          return false;
        }
        const provider = providers.get(property);
        return Boolean(provider && provider.auth.type === AuthType.OAuth2);
      },
      ownKeys: () => {
        return providers
          .list()
          .filter((provider) => provider.auth.type === AuthType.OAuth2)
          .map((provider) => provider.name);
      },
      getOwnPropertyDescriptor: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const provider = providers.get(property);
        if (!provider || provider.auth.type !== AuthType.OAuth2) {
          return undefined;
        }
        return {
          configurable: true,
          enumerable: true,
          value: buildOAuthProviderDescriptor(property, provider),
        };
      },
    }
  ) as Record<string, OAuthProviderDescriptor>;
}

function createOAuthClientConfigMap(
  integrationConfigs: Map<string, any>,
  baseUrl: string
): Record<string, OAuthClientConfig> {
  const oauthClientConfigMap: Record<string, OAuthClientConfig> = {};

  for (const [providerId, rawConfig] of integrationConfigs.entries()) {
    if (
      !rawConfig ||
      typeof rawConfig.clientId !== 'string' ||
      rawConfig.clientId.length === 0 ||
      typeof rawConfig.clientSecret !== 'string' ||
      rawConfig.clientSecret.length === 0
    ) {
      continue;
    }

    const configuredRedirectUris = Array.isArray(rawConfig.redirectUris)
      ? rawConfig.redirectUris.filter((value: unknown): value is string => {
          return typeof value === 'string' && value.length > 0;
        })
      : [];

    const redirectUris =
      configuredRedirectUris.length > 0
        ? configuredRedirectUris
        : defaultOAuthRedirectUris(baseUrl, providerId);

    oauthClientConfigMap[providerId] = {
      clientId: rawConfig.clientId,
      clientSecret: rawConfig.clientSecret,
      redirectUris,
    };
  }

  return oauthClientConfigMap;
}

function createDynamicOAuthRuntimeConfigMap(
  oauthClientConfigMap: Record<string, OAuthClientConfig>
): Record<string, { clientId: string; clientSecret: string; allowlistedRedirectUris?: string[] }> {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const config = oauthClientConfigMap[property];
        if (!config) {
          return undefined;
        }
        return {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          allowlistedRedirectUris: [...config.redirectUris],
        };
      },
      has: (_target, property) => {
        if (typeof property !== 'string') {
          return false;
        }
        return Boolean(oauthClientConfigMap[property]);
      },
      ownKeys: () => {
        return Object.keys(oauthClientConfigMap);
      },
      getOwnPropertyDescriptor: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const config = oauthClientConfigMap[property];
        if (!config) {
          return undefined;
        }
        return {
          configurable: true,
          enumerable: true,
          value: {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            allowlistedRedirectUris: [...config.redirectUris],
          },
        };
      },
    }
  ) as Record<string, { clientId: string; clientSecret: string; allowlistedRedirectUris?: string[] }>;
}

function createOAuthRuntimeConfigResolver(
  integrationConfigs: Map<string, any>,
  staticConfigs: Record<string, OAuthClientConfig>,
  baseUrl: string
): (input: {
  providerId: string;
  subject: { kind: string; tenantId?: string; userId?: string; metadata?: Record<string, unknown> };
}) => Promise<{ clientId: string; clientSecret: string; allowlistedRedirectUris?: string[] }> {
  return async (input) => {
    const rawConfig = integrationConfigs.get(input.providerId);
    if (rawConfig && isOAuthSecretResolverConfig(rawConfig)) {
      const owner = readConnectionOwnerFromMetadata(input.subject.metadata, input.subject.userId);
      const resolved = await rawConfig.resolveOAuthClient({
        provider: input.providerId,
        tenantId: owner?.tenantId ?? input.subject.tenantId,
        owner,
      });
      if (!resolved) {
        throw new Error(`Missing OAuth client config for provider: ${input.providerId}`);
      }
      const redirectUris = normalizeRedirectUris(resolved.redirectUris, baseUrl, input.providerId);
      return {
        clientId: resolved.clientId,
        clientSecret: resolved.clientSecret,
        allowlistedRedirectUris: redirectUris,
      };
    }

    const staticConfig = staticConfigs[input.providerId];
    if (!staticConfig) {
      throw new Error(`Missing OAuth client config for provider: ${input.providerId}`);
    }
    return {
      clientId: staticConfig.clientId,
      clientSecret: staticConfig.clientSecret,
      allowlistedRedirectUris: [...staticConfig.redirectUris],
    };
  };
}

function isDisconnectRevokeFailureAfterLocalCleanup(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };

  return (
    record.code === 'INTERNAL_ERROR' &&
    record.message === 'provider revoke failed after local cleanup' &&
    record.details?.localDeleted === true
  );
}

function extractDisconnectRevokeError(error: unknown): DisconnectResult['revokeError'] {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as {
    code?: string;
    message?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
  const details = isPlainMetadataRecord(record.details) ? record.details : {};

  return {
    code: typeof details.revokeErrorCode === 'string' ? details.revokeErrorCode : record.code,
    message: typeof details.revokeMessage === 'string' ? details.revokeMessage : record.message,
    status:
      typeof details.revokeStatus === 'number'
        ? details.revokeStatus
        : typeof record.status === 'number'
          ? record.status
          : undefined,
    details: isPlainMetadataRecord(details.revokeDetails)
      ? details.revokeDetails
      : details,
  };
}

function toDisconnectResult(flow: OAuthFlowDisconnectResult, connectionId: string): DisconnectResult {
  return {
    disconnected: flow.disconnected,
    connectionId,
    remoteRevokeAttempted: flow.remoteRevokeAttempted,
    remoteRevokeSucceeded: flow.remoteRevokeAttempted,
    localDeleted: flow.localTokenDeleted,
    connectionDeleted: flow.connectionCleanup.deleted,
  };
}

function buildOAuthProviderDescriptor(providerId: string, provider: Provider): OAuthProviderDescriptor {
  const sharedDescriptor = (oauthProviderDescriptors as Record<string, OAuthProviderDescriptor | undefined>)[
    providerId
  ];
  if (sharedDescriptor) {
    return {
      ...sharedDescriptor,
      defaultScopes: [...sharedDescriptor.defaultScopes],
      extraAuthParams: sharedDescriptor.extraAuthParams
        ? { ...sharedDescriptor.extraAuthParams }
        : undefined,
    };
  }

  const oauthConfig = provider.auth.config as OAuth2Config;
  const rawOAuthConfig = oauthConfig as unknown as Record<string, unknown>;
  const rawTokenAuthMethod = rawOAuthConfig.tokenAuthMethod;
  const tokenAuthMethod =
    rawTokenAuthMethod === 'client_secret_basic' || rawTokenAuthMethod === 'client_secret_post'
      ? rawTokenAuthMethod
      : 'client_secret_post';

  return {
    id: providerId,
    authorizationUrl: oauthConfig.authorizationUrl,
    tokenUrl: oauthConfig.tokenUrl,
    revocationUrl:
      typeof rawOAuthConfig.revocationUrl === 'string'
        ? (rawOAuthConfig.revocationUrl as string)
        : undefined,
    defaultScopes: [...oauthConfig.scopes],
    supportsPkce: true,
    supportsRefreshToken: true,
    scopeSeparator: oauthConfig.scopeSeparator === ',' ? ',' : ' ',
    tokenAuthMethod,
  };
}

function toEncryptedCredentials(record: TokenRecord): EncryptedCredentials {
  return {
    encrypted: record.encryptedPayload,
    encryptedPayload: record.encryptedPayload,
    keyRef: record.keyRef,
    tokenId: record.tokenId,
    schemaVersion: 'oauth-v1',
    algorithm: 'aes-256-gcm',
  };
}

function buildConnectionStateMetadata(
  owner: PlugFnConnectionOwner,
  returnTo: string | undefined
): Record<string, unknown> {
  return {
    plugfnOwner: owner,
    ...(returnTo ? { returnTo } : {}),
  };
}

function enrichOAuthStateWithPlugFnMetadata(
  state: OAuthStateRecord,
  metadata: Record<string, unknown>,
  tenantId?: string
): OAuthStateRecord {
  const subject = state.subject;
  if (subject?.kind === 'connection') {
    return {
      ...state,
      tenantId: tenantId ?? state.tenantId,
      subject: {
        ...subject,
        metadata: {
          ...readConnectionSubjectMetadata(subject),
          ...metadata,
        },
      } as OAuthStateRecord['subject'],
    };
  }

  return {
    ...state,
    tenantId: tenantId ?? state.tenantId,
    metadata: {
      ...(state.metadata ?? {}),
      ...metadata,
    },
  };
}

function readPlugFnOAuthStateMetadata(state: OAuthStateRecord): Record<string, unknown> | undefined {
  if (state.metadata) {
    return state.metadata;
  }

  const subject = state.subject;
  if (subject?.kind === 'connection') {
    const metadata = readConnectionSubjectMetadata(subject);
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  if (subject?.kind === 'browser-auth') {
    const metadata: Record<string, unknown> = {
      ...(subject.metadata ?? {}),
    };
    if (subject.returnTo) {
      metadata.returnTo = subject.returnTo;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  if (state.returnTo) {
    return { returnTo: state.returnTo };
  }

  return undefined;
}

function readConnectionSubjectMetadata(subject: unknown): Record<string, unknown> {
  if (!subject || typeof subject !== 'object') {
    return {};
  }

  const metadata = (subject as { metadata?: unknown }).metadata;
  return isPlainMetadataRecord(metadata) ? { ...metadata } : {};
}

function isPlainMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readReturnToFromMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  const returnTo = metadata?.returnTo;
  return typeof returnTo === 'string' && returnTo.trim().length > 0 ? returnTo.trim() : undefined;
}

function readConnectionOwnerFromMetadata(
  metadata: Record<string, unknown> | undefined,
  fallbackUserId?: string
): PlugFnConnectionOwner | undefined {
  const rawOwner = metadata?.plugfnOwner;
  if (isConnectionOwner(rawOwner)) {
    return rawOwner;
  }
  return fallbackUserId ? { kind: 'user', userId: fallbackUserId } : undefined;
}

function isConnectionOwner(value: unknown): value is PlugFnConnectionOwner {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.kind === 'user') {
    return typeof record.userId === 'string' && record.userId.length > 0;
  }
  if (record.kind === 'organization') {
    return (
      typeof record.organizationId === 'string' &&
      record.organizationId.length > 0 &&
      typeof record.installedByUserId === 'string' &&
      record.installedByUserId.length > 0
    );
  }
  if (record.kind === 'delegated') {
    return (
      typeof record.organizationId === 'string' &&
      record.organizationId.length > 0 &&
      typeof record.delegatedToUserId === 'string' &&
      record.delegatedToUserId.length > 0 &&
      typeof record.installedByUserId === 'string' &&
      record.installedByUserId.length > 0 &&
      Array.isArray(record.grants) &&
      record.grants.every((grant) => typeof grant === 'string')
    );
  }
  return false;
}

function isOAuthSecretResolverConfig(value: unknown): value is OAuthSecretResolverConfig {
  return (
    !!value &&
    typeof value === 'object' &&
    'resolveOAuthClient' in value &&
    typeof (value as OAuthSecretResolverConfig).resolveOAuthClient === 'function'
  );
}

function defaultOAuthRedirectUris(baseUrl: string, providerId: string): string[] {
  let normalizedBaseUrl = baseUrl;
  while (normalizedBaseUrl.endsWith('/')) {
    normalizedBaseUrl = normalizedBaseUrl.slice(0, -1);
  }
  return [
    `${normalizedBaseUrl}/api/plugfn/callback`,
    `${normalizedBaseUrl}/api/plugfn/callback/${providerId}`,
  ];
}

function normalizeRedirectUris(
  redirectUris: string[] | undefined,
  baseUrl: string,
  providerId: string
): string[] {
  const configured = Array.isArray(redirectUris)
    ? redirectUris.filter((value) => typeof value === 'string' && value.length > 0)
    : [];
  return configured.length > 0 ? configured : defaultOAuthRedirectUris(baseUrl, providerId);
}

function compareConnectionPriority(a: Connection, b: Connection): number {
  // Deterministic ordering: newest lastUsedAt, then newest connectedAt, then newest createdAt.
  // Final tie-breaker is lexical connection id.
  const priorityFields: Array<keyof Connection> = ['lastUsedAt', 'connectedAt', 'createdAt'];

  for (const field of priorityFields) {
    const timeDiff = toTimestamp(b[field]) - toTimestamp(a[field]);
    if (timeDiff !== 0) {
      return timeDiff;
    }
  }

  if (a.id !== b.id) {
    return a.id.localeCompare(b.id);
  }

  return 0;
}

function toTimestamp(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}
