import type { ConditionalKVStoreAdapter, TableSchema } from '@superfunctions/db';
import type { ObservabilityInput } from '@superfunctions/observability';
import type { AuthFnPlugin } from './types.js';
import type {
  AuthFnCookieConfig,
  AuthFnDeliveryMessageResolver,
  AuthFnPasswordCompromiseChecker,
  AuthFnEnvironment,
  AuthFnDeliveryProvider,
  AuthFnEvent
} from './types.js';

export interface AuthFnBundledPluginConfig {
  schema?: TableSchema[];
}

export interface PasswordPluginConfig extends AuthFnBundledPluginConfig {
  compromisedPasswordChecker?: AuthFnPasswordCompromiseChecker;
  requireEmailVerifiedForSignIn?: boolean;
}
export interface PasswordPluginRuntimeConfig {
  /** OTP delivery and challenge settings used by password sign-up, sign-in, and reset flows. */
  otp?: EmailOtpPluginRuntimeConfig;
}
export interface EmailOtpPluginConfig extends AuthFnBundledPluginConfig {
}
export interface EmailOtpPluginRuntimeConfig {
  /** Provider responsible for sending OTP challenges and receiving OTP lifecycle events. */
  delivery: AuthFnDeliveryProvider;
  /** Optional resolver used to customize the OTP message before it is passed to the delivery provider. */
  message?: AuthFnDeliveryMessageResolver;
  /** Optional code generator for tests or custom OTP formats; defaults to the built-in numeric generator. */
  codeGenerator?: () => string;
  /** Clock source used for challenge creation and expiry checks; primarily useful for tests. */
  now?: () => Date;
  /** Number of seconds before an OTP challenge expires. */
  challengeTtlSeconds?: number;
  /** Maximum verification attempts allowed before a challenge is rejected. */
  maxAttempts?: number;
}
export interface ApiKeyPluginConfig extends AuthFnBundledPluginConfig {
  secretPrefix?: string;
}
export interface ApiKeyPluginRuntimeConfig {
  /** Clock source used for API key timestamps and expiry checks; primarily useful for tests. */
  now?: () => Date;
}
export interface TwoFactorPluginConfig extends AuthFnBundledPluginConfig {
}
export interface TwoFactorPluginRuntimeConfig {
  /** Issuer name displayed by authenticator apps for generated TOTP enrollments. */
  issuer?: string;
  /** Clock source used for TOTP challenge creation and verification; primarily useful for tests. */
  now?: () => Date;
  /** Number of seconds before a two-factor challenge expires. */
  challengeTtlSeconds?: number;
  /** Number of recovery codes generated for each confirmed enrollment. */
  recoveryCodeCount?: number;
  /** Number of digits in generated TOTP codes. */
  digits?: number;
  /** TOTP time-step duration in seconds. */
  periodSeconds?: number;
  /** Number of adjacent TOTP windows accepted during verification. */
  window?: number;
  /** Key reference passed to encryptionKeyResolver when encrypting two-factor secrets. */
  encryptionKeyRef?: string;
  /** Resolves the encryption key used for two-factor secret storage. */
  encryptionKeyResolver?: (keyRef: string) => Promise<Buffer> | Buffer;
}

export interface NativeHandoffPluginConfig extends AuthFnBundledPluginConfig {
  codeTtlSeconds?: number;
}
export interface NativeHandoffPluginRuntimeConfig {
  /** Clock source used for native handoff code timestamps and expiry checks; primarily useful for tests. */
  now?: () => Date;
}

export interface AuthFnMultiRegionRegionConfig {
  regionId: string;
  authority: string;
  domain?: string;
  hosts?: string[];
  issuer?: string;
  baseUrl?: string;
  cookie?: Partial<AuthFnCookieConfig>;
  oauth?: AuthFnEnvironment['oauth'];
}

export interface AuthFnMultiRegionLookupInput {
  identifier: string;
  request?: Request;
  environment: AuthFnEnvironment;
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
  environment: AuthFnEnvironment;
}

export interface AuthFnRegionLookupRecord {
  identifier: string;
  userId?: string;
  regionId: string;
  authority: string;
  domain?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MultiRegionPluginConfig extends AuthFnBundledPluginConfig {
}

export interface MultiRegionPluginRuntimeConfig {
  /** Region definitions available to the multi-region resolver and routing plugin. */
  regions?: AuthFnMultiRegionRegionConfig[];
  /** Region ID used when no request host or identifier lookup selects another region. */
  defaultRegionId?: string;
  /** Store used to look up and register the region that owns a user identifier. */
  lookupStore?: ConditionalKVStoreAdapter;
  /** Observability sink for multi-region lookup, registration, and conflict events. */
  observability?: ObservabilityInput<AuthFnEvent>;
}

export type AuthFnPluginFactory<TConfig extends AuthFnBundledPluginConfig> = (
  config?: TConfig
) => AuthFnPlugin;
