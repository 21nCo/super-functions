import type { OAuthClientSecretResolver, OAuthFetchLike, OAuthTokenHttpClient } from '@superfunctions/oauth-http';
import type {
  AuthFnEnvironment,
  AuthFnSocialProfile,
  AuthFnSocialProviderId
} from 'authfn';
import type { AuthFnBundledPluginConfig } from 'authfn/plugin-types';

export type { AuthFnSocialProfile, AuthFnSocialProviderId } from 'authfn';

export type AuthFnSocialHandoffMode = 'none' | 'session-token';

export interface AuthFnSocialProfileResolverInput {
  providerId: AuthFnSocialProviderId;
  tokenSet: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    scope?: string;
    tokenType?: string;
    idToken?: string;
  };
  request?: Request;
  environment?: AuthFnEnvironment;
  fetcher?: OAuthFetchLike;
}

export type AuthFnSocialProfileResolver = (
  input: AuthFnSocialProfileResolverInput
) => Promise<AuthFnSocialProfile> | AuthFnSocialProfile;

export interface AuthFnSocialProviderRuntimeConfig {
  clientId: string;
  clientSecret?: string;
  clientSecretResolver?: OAuthClientSecretResolver;
  allowlistedRedirectUris?: string[];
  allowlistedReturnTo?: string[];
  scopes?: string[];
  nativeClientIds?: string[];
}

export interface AuthFnSocialProviderConfig extends Partial<AuthFnSocialProviderRuntimeConfig> {
  linkByVerifiedEmail?: boolean;
  profileResolver?: AuthFnSocialProfileResolver;
}

export interface SocialOAuthPluginConfig extends AuthFnBundledPluginConfig {
  defaultHandoffMode?: AuthFnSocialHandoffMode;
}

export interface SocialOAuthPluginRuntimeConfig {
  providers: Partial<Record<AuthFnSocialProviderId, AuthFnSocialProviderConfig>>;
  fetcher?: OAuthFetchLike;
  tokenHttpClient?: OAuthTokenHttpClient;
  diagnostics?: false | SocialOAuthDiagnosticsConfig;
  now?: () => Date;
}

export interface OAuthTokenExchangeDiagnostic {
  provider: AuthFnSocialProviderId;
  ok: boolean;
  status: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

export interface OAuthTokenExchangeDiagnosticsConfig {
  includeSuccessful?: boolean;
  sink?: (diagnostic: OAuthTokenExchangeDiagnostic) => Promise<void> | void;
}

export interface SocialOAuthDiagnosticsConfig {
  tokenExchange?: false | OAuthTokenExchangeDiagnosticsConfig;
}

export type AuthFnSocialOAuthEnvironment = AuthFnEnvironment & {
  oauth?: Partial<Record<AuthFnSocialProviderId, AuthFnSocialProviderRuntimeConfig>>;
};
