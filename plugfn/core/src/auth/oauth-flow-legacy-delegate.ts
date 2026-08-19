import {
  DefaultOAuthService,
  type OAuthProviderDescriptor,
  type OAuthTokenSet,
} from '@superfunctions/oauth-core';
import {
  DefaultOAuthTokenHttpClient,
  type OAuthTokenEndpointResponse,
  type OAuthTokenHttpClient,
} from '@superfunctions/oauth-http';
import {
  MemoryOAuthStateStore,
  type OAuthStateStore,
} from '@superfunctions/oauth-storage';
import type { OAuth2Config, OAuth2RuntimeConfig, TokenResponse } from '../types/provider.js';
import type { OAuthState } from './types.js';

const LEGACY_PROVIDER_ID = 'legacy-oauth-provider';

export interface LegacyOAuthFlowDelegate {
  getAuthorizationUrl(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig
  ): Promise<{ url: string; state: string }>;
  exchangeCodeForToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    code: string
  ): Promise<TokenResponse>;
  refreshAccessToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    refreshTokenValue: string
  ): Promise<TokenResponse>;
  verifyState(state: string): Promise<OAuthState | null>;
}

export interface CreateLegacyOAuthFlowDelegateOptions {
  stateStore?: OAuthStateStore;
  stateTimeout?: number;
  tokenClient?: OAuthTokenHttpClient;
}

export function createLegacyOAuthFlowDelegate(
  options: CreateLegacyOAuthFlowDelegateOptions = {}
): LegacyOAuthFlowDelegate {
  return new SharedStackLegacyOAuthFlowDelegate(
    options.stateStore ?? new MemoryOAuthStateStore(),
    options.stateTimeout ?? 600000,
    options.tokenClient ?? new DefaultOAuthTokenHttpClient()
  );
}

class SharedStackLegacyOAuthFlowDelegate implements LegacyOAuthFlowDelegate {
  constructor(
    private readonly stateStore: OAuthStateStore,
    private readonly stateTimeout: number,
    private readonly tokenClient: OAuthTokenHttpClient
  ) {}

  async getAuthorizationUrl(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig
  ): Promise<{ url: string; state: string }> {
    const provider = toOAuthProviderDescriptor(config);
    const service = this.createOAuthService(provider, runtimeConfig);

    const result = await service.createAuthorizationRequest({
      providerId: LEGACY_PROVIDER_ID,
      tenantId: '',
      userId: '',
      redirectUri: runtimeConfig.redirectUri,
      scopes: runtimeConfig.scopes,
    });

    return {
      url: result.authorizationUrl,
      state: result.stateId,
    };
  }

  async exchangeCodeForToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    code: string
  ): Promise<TokenResponse> {
    const provider = toOAuthProviderDescriptor(config);
    const response = await this.tokenClient.exchangeToken({
      provider,
      grantType: 'authorization_code',
      clientId: runtimeConfig.clientId,
      clientSecret: runtimeConfig.clientSecret,
      redirectUri: runtimeConfig.redirectUri,
      code,
      scopes: runtimeConfig.scopes,
    });

    return toLegacyTokenResponse(response);
  }

  async refreshAccessToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    refreshTokenValue: string
  ): Promise<TokenResponse> {
    const provider = toOAuthProviderDescriptor(config);
    const response = await this.tokenClient.exchangeToken({
      provider,
      grantType: 'refresh_token',
      clientId: runtimeConfig.clientId,
      clientSecret: runtimeConfig.clientSecret,
      redirectUri: runtimeConfig.redirectUri,
      refreshToken: refreshTokenValue,
      scopes: runtimeConfig.scopes,
    });

    return toLegacyTokenResponse(response);
  }

  async verifyState(state: string): Promise<OAuthState | null> {
    const consumed = await this.stateStore.consume(state, new Date().toISOString());
    if (!consumed) {
      return null;
    }

    return {
      userId: consumed.userId ?? '',
      provider: consumed.providerId,
      redirectUri: consumed.redirectUri,
      scopes: [...consumed.requestedScopes],
      timestamp: Date.parse(consumed.createdAt),
    };
  }

  private createOAuthService(
    provider: OAuthProviderDescriptor,
    runtimeConfig: OAuth2RuntimeConfig
  ): DefaultOAuthService {
    return new DefaultOAuthService({
      providers: {
        [LEGACY_PROVIDER_ID]: provider,
      },
      providerRuntimeConfig: {
        [LEGACY_PROVIDER_ID]: {
          clientId: runtimeConfig.clientId,
          allowlistedRedirectUris: [runtimeConfig.redirectUri],
        },
      },
      stateStore: this.stateStore,
      stateTtlMs: this.stateTimeout,
      exchangeCodeForToken: async ({ provider: currentProvider, code, redirectUri, codeVerifier, scopes }) => {
        const response = await this.tokenClient.exchangeToken({
          provider: currentProvider,
          grantType: 'authorization_code',
          clientId: runtimeConfig.clientId,
          clientSecret: runtimeConfig.clientSecret,
          redirectUri,
          code,
          codeVerifier,
          scopes,
        });

        return toOAuthTokenSet(response);
      },
      refreshToken: async ({ provider: currentProvider, refreshToken, redirectUri, scopes }) => {
        const response = await this.tokenClient.exchangeToken({
          provider: currentProvider,
          grantType: 'refresh_token',
          clientId: runtimeConfig.clientId,
          clientSecret: runtimeConfig.clientSecret,
          redirectUri,
          refreshToken,
          scopes,
        });

        return toOAuthTokenSet(response);
      },
    });
  }
}

function toOAuthProviderDescriptor(config: OAuth2Config): OAuthProviderDescriptor {
  const rawConfig = config as unknown as Record<string, unknown>;
  const rawTokenAuthMethod = rawConfig.tokenAuthMethod;
  const tokenAuthMethod =
    rawTokenAuthMethod === 'client_secret_basic' || rawTokenAuthMethod === 'client_secret_post'
      ? rawTokenAuthMethod
      : 'client_secret_post';

  return {
    id: LEGACY_PROVIDER_ID,
    authorizationUrl: config.authorizationUrl,
    tokenUrl: config.tokenUrl,
    defaultScopes: [...config.scopes],
    supportsPkce: true,
    supportsRefreshToken: true,
    scopeSeparator: config.scopeSeparator === ',' ? ',' : ' ',
    tokenAuthMethod,
  };
}

function toLegacyTokenResponse(response: OAuthTokenEndpointResponse): TokenResponse {
  return {
    access_token: response.accessToken,
    refresh_token: response.refreshToken,
    expires_in: response.expiresIn,
    token_type: response.tokenType,
    scope: response.scope,
  };
}

function toOAuthTokenSet(response: OAuthTokenEndpointResponse): OAuthTokenSet {
  const now = Date.now();
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt:
      response.expiresIn !== undefined
        ? new Date(now + response.expiresIn * 1000).toISOString()
        : undefined,
    scope: response.scope,
    tokenType: response.tokenType,
    idToken: response.idToken,
  };
}
