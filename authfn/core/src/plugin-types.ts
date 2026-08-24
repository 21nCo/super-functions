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
  /** @deprecated Configure password OTP delivery through pluginRuntime.password.otp. */
  otp?: Partial<EmailOtpPluginRuntimeConfig>;
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

export type AuthFnIdentityPlacementState = 'active' | 'moving' | 'tombstoned';

/**
 * Canonical ownership record for an AuthFn identity. The directory owns only
 * placement metadata; cell destinations remain private to the cell registry.
 */
export interface AuthFnIdentityPlacement {
  identityKey: string;
  regionId: string;
  epoch: number;
  state: AuthFnIdentityPlacementState;
  movingToRegionId?: string;
  previousRegionId?: string;
  updatedAt: Date | string;
}

export interface AuthFnIdentityPlacementDirectoryAdapter {
  /** Strongly consistent with every successful claim and epoch transition. */
  get(identityKey: string): Promise<AuthFnIdentityPlacement | null>;
  /** Globally atomic across every gateway writer for the same identity key. */
  putIfAbsent(placement: AuthFnIdentityPlacement): Promise<{
    inserted: boolean;
    existing?: AuthFnIdentityPlacement;
  }>;
  /** Globally atomic across every writer and fenced by both epoch and state. */
  compareAndSet(input: {
    identityKey: string;
    expectedEpoch: number;
    expectedState: AuthFnIdentityPlacementState;
    placement: AuthFnIdentityPlacement;
  }): Promise<{
    updated: boolean;
    existing?: AuthFnIdentityPlacement;
  }>;
}

export interface AuthFnRoutingSigningKey {
  keyId: string;
  secret: string | Uint8Array;
}

export interface AuthFnRoutingKeyring {
  active: AuthFnRoutingSigningKey;
  /** Verification-only keys retained during rotation. */
  previous?: AuthFnRoutingSigningKey[];
}

export interface AuthFnRoutingReplayStore {
  /** Atomically claims a nonce until its expiry. False means replay. */
  claim(nonce: string, expiresAt: number): Promise<boolean>;
}

export interface AuthFnCanonicalRoutingConfig {
  mode: 'direct' | 'gateway';
  /** Stable public issuer/base URL used for discovery, OAuth, and cookies. */
  publicAuthority?: string;
  /** Canonical cookie policy. In gateway mode this must not vary by cell. */
  canonicalCookie?: Partial<AuthFnCookieConfig>;
  /** Canonical OAuth policy merged independently of the execution cell. */
  canonicalOAuth?: AuthFnEnvironment['oauth'];
  /** Required in gateway mode on both the gateway and regional cells. */
  placementDirectory?: AuthFnIdentityPlacementDirectoryAdapter;
  /** Maps normalized public identifiers to the same stable key used by the gateway. */
  identityKeyForIdentifier?: (identifier: string) => string;
  /** Required by a regional cell to validate gateway assertions. */
  cell?: {
    regionId: string;
    audience: string;
    keyring: AuthFnRoutingKeyring;
    replayStore: AuthFnRoutingReplayStore;
    clockSkewSeconds?: number;
  };
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
  /** Canonical-gateway routing. Omit (or use direct) for legacy regional clients. */
  routing?: AuthFnCanonicalRoutingConfig;
}

export type AuthFnPluginFactory<TConfig extends AuthFnBundledPluginConfig> = (
  config?: TConfig
) => AuthFnPlugin;
