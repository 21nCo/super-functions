import type { TableSchema } from '@superfunctions/db';
import type { OAuthFetchLike, OAuthTokenHttpClient } from '@superfunctions/oauth-http';
import type { AuthFnPlugin } from './types.js';
import type {
  AuthFnCookieConfig,
  AuthFnPasswordCompromiseChecker,
  AuthFnRuntimeResolution,
  AuthFnDeliveryProvider,
  AuthFnSocialHandoffMode,
  AuthFnSocialProviderConfig,
  AuthFnSocialProviderId
} from './types.js';

export interface AuthFnBundledPluginConfig {
  schema?: TableSchema[];
}

export interface PasswordPluginConfig extends AuthFnBundledPluginConfig {
  compromisedPasswordChecker?: AuthFnPasswordCompromiseChecker;
  requireEmailVerifiedForSignIn?: boolean;
}
export interface EmailOtpPluginConfig extends AuthFnBundledPluginConfig {
  delivery?: AuthFnDeliveryProvider;
  codeGenerator?: () => string;
  now?: () => Date;
  challengeTtlSeconds?: number;
  maxAttempts?: number;
}
export interface SocialOAuthPluginConfig extends AuthFnBundledPluginConfig {
  providers?: Partial<Record<AuthFnSocialProviderId, AuthFnSocialProviderConfig>>;
  fetcher?: OAuthFetchLike;
  tokenHttpClient?: OAuthTokenHttpClient;
  now?: () => Date;
  defaultHandoffMode?: AuthFnSocialHandoffMode;
}
export interface ApiKeyPluginConfig extends AuthFnBundledPluginConfig {
  secretPrefix?: string;
  now?: () => Date;
}
export interface TwoFactorPluginConfig extends AuthFnBundledPluginConfig {
  issuer?: string;
  now?: () => Date;
  challengeTtlSeconds?: number;
  recoveryCodeCount?: number;
  digits?: number;
  periodSeconds?: number;
  window?: number;
  encryptionKeyRef?: string;
  encryptionKeyResolver?: (keyRef: string) => Promise<Buffer> | Buffer;
}

export interface AuthFnMultiRegionRegionConfig {
  regionId: string;
  authority: string;
  domain?: string;
  hosts?: string[];
  issuer?: string;
  baseUrl?: string;
  cookie?: Partial<AuthFnCookieConfig>;
  oauth?: AuthFnRuntimeResolution['oauth'];
}

export interface AuthFnMultiRegionLookupInput {
  identifier: string;
  request?: Request;
  runtime: AuthFnRuntimeResolution;
}

export interface AuthFnMultiRegionLookupResult {
  userId?: string;
  regionId: string;
  authority: string;
  domain?: string;
}

export interface AuthFnMultiRegionRegistrationInput {
  userId: string;
  primaryEmail?: string;
  regionId: string;
  authority: string;
  domain?: string;
  request?: Request;
  runtime: AuthFnRuntimeResolution;
}

export interface AuthFnMultiRegionDirectory {
  lookupByIdentifier(
    input: AuthFnMultiRegionLookupInput
  ): Promise<AuthFnMultiRegionLookupResult | null> | AuthFnMultiRegionLookupResult | null;
  registerUser?(
    input: AuthFnMultiRegionRegistrationInput
  ): Promise<void> | void;
}

export interface MultiRegionPluginConfig extends AuthFnBundledPluginConfig {
  regions?: AuthFnMultiRegionRegionConfig[];
  defaultRegionId?: string;
  directory?: AuthFnMultiRegionDirectory;
}

export type AuthFnPluginFactory<TConfig extends AuthFnBundledPluginConfig> = (
  config?: TConfig
) => AuthFnPlugin;
