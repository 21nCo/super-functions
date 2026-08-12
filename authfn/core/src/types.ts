import type { AuthProvider, AuthSession } from '@superfunctions/auth';
import type { Adapter, KVStoreAdapter, TableSchema } from '@superfunctions/db';
import type { Route, Router } from '@superfunctions/http';
import type { OAuthClientSecretResolver, OAuthFetchLike, OAuthTokenHttpClient } from '@superfunctions/oauth-http';
import type { AuthFnErrorCode } from './core/errors.js';
export {
  AuthFnAdminAmbiguousUserError,
  AuthFnAdminConfigError,
  AuthFnAdminUnauthorizedError,
  AuthFnApiKeyRevokedError,
  AuthFnConfigError,
  AuthFnConflictError,
  AuthFnCsrfInvalidError,
  AuthFnDeliveryFailedError,
  AuthFnEmailNotVerifiedError,
  AuthFnError,
  AuthFnInternalError,
  AuthFnInvalidCredentialsError,
  AuthFnNotFoundError,
  AuthFnNotImplementedError,
  AuthFnOAuthCallbackInvalidError,
  AuthFnOAuthProviderUnsupportedError,
  AuthFnOAuthStateInvalidError,
  AuthFnOAuthStateReplayedError,
  AuthFnOtpExpiredError,
  AuthFnOtpInvalidError,
  AuthFnOtpReplayedError,
  AuthFnPluginAbortedError,
  AuthFnRateLimitedError,
  AuthFnRedirectUriDisallowedError,
  AuthFnRegionMismatchError,
  AuthFnRegionNotFoundError,
  AuthFnSessionExpiredError,
  AuthFnSessionRevokedError,
  AuthFnTwoFactorInvalidCodeError,
  AuthFnTwoFactorRequiredError,
  AuthFnUnauthenticatedError,
  AuthFnValidationError
} from './core/errors.js';

export interface AuthFnSchemaDefinition {
  version: number;
  schemas: TableSchema[];
}

export type AuthFnActorType = 'user' | 'api-key';
export type AuthFnAuthMethod =
  | 'password'
  | 'email-otp'
  | 'oauth-google'
  | 'oauth-apple'
  | 'oauth-github'
  | 'api-key'
  | 'two-factor';

export type AuthFnOtpPurpose = 'verify-email' | 'sign-in' | 'sign-up' | 'reset-password';
export type AuthFnSocialProviderId = 'google' | 'apple' | 'github';

export interface AuthFnSession extends AuthSession {
  id: string;
  type: 'session' | 'api-key';
  subject: {
    actorId: string;
    actorType: AuthFnActorType;
    tenantId?: string;
    regionId?: string;
    email?: string;
    attributes?: Record<string, unknown>;
  };
  actorType: AuthFnActorType;
  actorId: string;
  tenantId?: string;
  regionId?: string;
  methods: AuthFnAuthMethod[];
  primaryEmail?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface AuthFnUserRecord {
  id: string;
  primaryEmail?: string;
  emailVerifiedAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash?: string;
  methods: AuthFnAuthMethod[];
  metadata?: Record<string, unknown>;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastAuthenticatedAt?: Date | null;
}

export interface AuthFnApiKeyRecord {
  id: string;
  userId?: string | null;
  secretHash: string;
  name?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnTwoFactorEnrollmentRecord {
  id: string;
  userId: string;
  secretEncrypted: string;
  lastUsedCounter?: number | null;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnTwoFactorRecoveryCodeRecord {
  id: string;
  enrollmentId: string;
  codeHash: string;
  usedAt?: Date | null;
  createdAt: Date;
}

export interface AuthFnTwoFactorChallengeRecord {
  id: string;
  userId: string;
  primaryMethod: Exclude<AuthFnAuthMethod, 'two-factor' | 'api-key'>;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnPasswordCredentialRecord {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnRegionProfileRecord {
  id: string;
  userId: string;
  regionId: string;
  authority: string;
  domain?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnNativeHandoffCodeRecord {
  id: string;
  codeHash: string;
  sourceSessionId: string;
  target: string;
  regionId: string;
  userId: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AuthFnOtpChallengeRecord {
  id: string;
  purpose: AuthFnOtpPurpose;
  email: string;
  codeHash: string;
  attemptCount: number;
  deliveryMetadata?: Record<string, unknown>;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFnAccountDeletionResult {
  deleted: true;
  userId: string;
  primaryEmail?: string;
  counts: Record<string, number>;
}

export interface AuthFnOtpChallengeLifecycleEvent {
  type: 'authfn.otp.sent' | 'authfn.otp.verified';
  challengeId: string;
  purpose: AuthFnOtpPurpose;
  email: string;
  outcome: 'sent' | 'verified';
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export type AuthFnEventType =
  | 'authfn.user.created'
  | 'authfn.account_linked'
  | 'authfn.account_linking.conflict'
  | 'authfn.account.deleted'
  | 'authfn.password.signup.rollback_failed'
  | 'authfn.session.issued'
  | 'authfn.session.revoked'
  | 'authfn.otp.sent'
  | 'authfn.otp.verified'
  | 'authfn.otp.signup.rollback_failed'
  | 'authfn.oauth.started'
  | 'authfn.oauth.completed'
  | 'authfn.oauth.failed'
  | 'authfn.api_key.created'
  | 'authfn.api_key.revoked'
  | 'authfn.2fa.enabled'
  | 'authfn.2fa.challenged'
  | 'authfn.region.lookup'
  | 'authfn.region.lookup.conflict'
  | 'authfn.handoff.started'
  | 'authfn.handoff.exchanged'
  | 'authfn.handoff.failed'
  | 'authfn.rate_limited'
  | 'authfn.request.failed'
  | 'authfn.plugin.failed';

export interface AuthFnEvent {
  type: AuthFnEventType;
  requestId: string;
  actorId?: string;
  sessionId?: string;
  userId?: string;
  regionId?: string;
  provider?: AuthFnSocialProviderId;
  pluginName?: string;
  hookName?: keyof AuthFnHooks | string;
  outcome?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthFnObservabilityConfig {
  emit?(event: AuthFnEvent): Promise<void> | void;
}

export interface AuthFnDeliveryRequest {
  channel: 'email';
  challengeId: string;
  purpose: AuthFnOtpPurpose;
  email: string;
  code: string;
  metadata?: Record<string, unknown>;
}

export interface AuthFnDeliveryResult {
  sent: boolean;
  metadata?: Record<string, unknown>;
}

export interface AuthFnDeliveryProvider {
  send(input: AuthFnDeliveryRequest): Promise<AuthFnDeliveryResult> | AuthFnDeliveryResult;
  emit?(event: AuthFnOtpChallengeLifecycleEvent): Promise<void> | void;
}

export interface AuthFnSocialProfile {
  providerAccountId: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  profile?: Record<string, unknown>;
}

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
  runtime?: AuthFnRuntimeResolution;
  fetcher?: OAuthFetchLike;
}

export type AuthFnSocialProfileResolver = (
  input: AuthFnSocialProfileResolverInput
) => Promise<AuthFnSocialProfile> | AuthFnSocialProfile;

export interface AuthFnPasswordCompromiseCheckInput {
  password: string;
  email?: string;
  purpose: 'sign-up' | 'reset-password' | 'update-password';
  request?: Request;
  runtime?: AuthFnRuntimeResolution;
}

export type AuthFnPasswordCompromiseCheckResult =
  | boolean
  | {
      compromised: boolean;
      count?: number;
    };

export type AuthFnPasswordCompromiseChecker = (
  input: AuthFnPasswordCompromiseCheckInput
) => Promise<AuthFnPasswordCompromiseCheckResult> | AuthFnPasswordCompromiseCheckResult;

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

export type AuthFnSocialHandoffMode = 'none' | 'session-token';

export interface AuthFnAccountLinkingConfig {
  /**
   * Link an OAuth identity to an existing AuthFn user when both sides prove the
   * same verified email address. Provider-level linkByVerifiedEmail overrides
   * this global policy.
   */
  oauthByVerifiedEmail?: boolean | {
    providers?: AuthFnSocialProviderId[];
    requireExistingEmailVerified?: boolean;
    requireProviderEmailVerified?: boolean;
  };
  /**
   * Treat OTP sign-up for an already registered email as sign-in/linking.
   * The OTP itself proves control of the email address.
   */
  otpSignUpExistingUser?: boolean;
  /**
   * Allow an already authenticated user to add a password credential for their
   * own email through the password sign-up endpoint when no password exists.
   */
  passwordForAuthenticatedUser?: boolean | {
    requireExistingEmailVerified?: boolean;
  };
}

export interface AuthFnSuccessEnvelope<TData = Record<string, unknown>> {
  ok: true;
  data: TData;
  requestId: string;
}

export interface AuthFnErrorEnvelope {
  ok: false;
  error: {
    code: AuthFnErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export interface AuthFnCookieConfig {
  prefix?: string;
  domain?: string | ((input: { request: Request; regionId?: string }) => string | undefined);
  secure?: boolean | ((request: Request) => boolean);
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  sessionMaxAgeSeconds?: number;
  csrfMaxAgeSeconds?: number;
}

export interface AuthFnRuntimeResolution {
  issuer: string;
  baseUrl: string;
  regionId?: string;
  cookie?: Partial<AuthFnCookieConfig>;
  oauth?: {
    google?: AuthFnSocialProviderRuntimeConfig;
    apple?: AuthFnSocialProviderRuntimeConfig;
    github?: AuthFnSocialProviderRuntimeConfig;
  };
}

export interface AuthFnRegionLookup {
  userId?: string;
  regionId: string;
  authority: string;
  domain?: string;
}

export interface AuthFnRegionLookupResult extends AuthFnRegionLookup {
  identifier: string;
  continueLocally: boolean;
  redirectTo?: string;
}

export interface AuthFnRuntimeResolver {
  resolve(request: Request): Promise<AuthFnRuntimeResolution> | AuthFnRuntimeResolution;
}

export interface AuthFnHookContext {
  config?: AuthFnConfig;
  request?: Request;
  runtime?: AuthFnRuntimeResolution;
  pluginName?: string;
  session?: AuthFnSession;
  actorId?: string;
}

export interface AuthFnHooks {
  beforeUserCreate(
    ctx: AuthFnHookContext,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  afterUserCreate(
    ctx: AuthFnHookContext,
    user: Record<string, unknown>
  ): Promise<void> | void;
  beforeSessionIssue(
    ctx: AuthFnHookContext,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  afterSessionIssue(
    ctx: AuthFnHookContext,
    session: AuthFnSession
  ): Promise<void> | void;
  beforeChallengeSend(
    ctx: AuthFnHookContext,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  afterChallengeSend(
    ctx: AuthFnHookContext,
    result: Record<string, unknown>
  ): Promise<void> | void;
  beforeOAuthStart(
    ctx: AuthFnHookContext,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  afterOAuthCallback(
    ctx: AuthFnHookContext,
    result: Record<string, unknown>
  ): Promise<void> | void;
  beforeAccountDelete(
    ctx: AuthFnHookContext,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  afterAccountDelete(
    ctx: AuthFnHookContext,
    result: AuthFnAccountDeletionResult
  ): Promise<void> | void;
}

export type AuthFnHookFailurePolicy = 'observe' | 'fail';

export interface AuthFnPluginRuntimeContext {
  config: AuthFnConfig;
  namespace: string;
  basePath: string;
  hooks: Partial<AuthFnHooks>;
  runtimeResolver?: AuthFnRuntimeResolver;
}

export interface AuthFnPlugin {
  name: string;
  schema?: (config: AuthFnConfig) => AuthFnSchemaDefinition['schemas'];
  routes?: (ctx: AuthFnPluginRuntimeContext) => Route[];
  hooks?: Partial<AuthFnHooks>;
  hookFailurePolicy?: Partial<Record<keyof AuthFnHooks, AuthFnHookFailurePolicy>>;
  validateConfig?: (config: AuthFnConfig) => void;
}

export interface AuthFnBundledPluginDescriptor<TArgs extends unknown[] = unknown[]> {
  __functionCall: string;
  __args?: TArgs;
}

export type AuthFnSchemaPluginInput = AuthFnPlugin | AuthFnBundledPluginDescriptor;

export interface AuthFnConfig {
  database: Adapter;
  cacheStore?: KVStoreAdapter;
  namespace?: string;
  basePath?: string;
  cookie?: AuthFnCookieConfig;
  accountLinking?: AuthFnAccountLinkingConfig;
  runtime?: AuthFnRuntimeResolver;
  hooks?: Partial<AuthFnHooks>;
  plugins: AuthFnPlugin[];
  openApi?: boolean | { title: string; version: string };
  observability?: AuthFnObservabilityConfig;
}

export interface AuthFnSchemaConfig extends Omit<AuthFnConfig, 'plugins'> {
  plugins: AuthFnSchemaPluginInput[];
}

export interface AuthFnInstance {
  router: Router;
  provider: AuthProvider<AuthFnSession>;
  getSchema(): AuthFnSchemaDefinition;
  openApi?(): Record<string, unknown>;
}

export interface AuthFnSocialPluginInternals {
  fetcher?: OAuthFetchLike;
  tokenHttpClient?: OAuthTokenHttpClient;
}
