import type { AuthFnTransportAuthOptions } from './transport-auth.js';
import type { HttpTransportAuthProvider } from '@superfunctions/http';

export type AuthFnActorType = 'user' | 'api-key';
export type AuthFnSocialProviderId = 'google' | 'apple' | 'github';
export type AuthFnOtpPurpose = 'verify-email' | 'sign-in' | 'sign-up' | 'reset-password';
export type AuthFnAuthMethod =
  | 'password'
  | 'email-otp'
  | 'oauth-google'
  | 'oauth-apple'
  | 'oauth-github'
  | 'api-key'
  | 'two-factor';

export interface AuthFnSession {
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
  resourceIds: string[];
  methods: AuthFnAuthMethod[];
  primaryEmail?: string;
  expiresAt?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface AuthFnSuccessEnvelope<TData = Record<string, unknown>> {
  ok: true;
  data: TData;
  requestId: string;
}

export interface AuthFnErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export interface AuthFnSessionEnvelope extends AuthFnSuccessEnvelope<{
  session: AuthFnSession | null;
  token?: string;
}> {}

export interface AuthFnListSessionsEnvelope extends AuthFnSuccessEnvelope<{
  sessions: AuthFnSession[];
  currentSessionId?: string;
}> {}

export interface AuthFnAccountOAuthAccount {
  id: string;
  provider: AuthFnSocialProviderId;
  email?: string;
  profile?: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuthFnAccountDetails {
  user: {
    id: string;
    primaryEmail?: string;
    emailVerifiedAt?: Date | string | null;
    metadata?: Record<string, unknown>;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  oauthAccounts: AuthFnAccountOAuthAccount[];
  methods: {
    password: boolean;
    emailOtp: boolean;
    oauth: AuthFnSocialProviderId[];
    twoFactor: boolean;
  };
  regionId?: string;
}

export interface AuthFnAccountDetailsEnvelope extends AuthFnSuccessEnvelope<AuthFnAccountDetails> {}

export interface AuthFnDeleteAccountEnvelope extends AuthFnSuccessEnvelope<{
  deleted: true;
  userId: string;
  primaryEmail?: string;
  counts: Record<string, number>;
}> {}

export interface AuthFnOtpEnvelope extends AuthFnSuccessEnvelope<{
  challengeId?: string;
  sent: boolean;
}> {}

export interface AuthFnVerifyOtpEnvelope extends AuthFnSuccessEnvelope<{
  verified: true;
}> {}

export interface AuthFnApiKeyRecord {
  id: string;
  userId?: string | null;
  name?: string | null;
  scopes?: string[] | null;
  metadata?: Record<string, unknown> | null;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  lastUsedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface AuthFnRegionLookupResult {
  identifier: string;
  userId?: string;
  regionId: string;
  authority: string;
  domain?: string;
  continueLocally: boolean;
  redirectTo?: string;
}

export type AuthFnEmailAuthFlow = 'sign-up' | 'sign-in' | 'password-reset';

export interface AuthFnRegionalEmailAuthPreparation {
  identifier: string;
  flow: AuthFnEmailAuthFlow;
  selectedRegionId: string;
  regionId: string;
  authority?: string;
  domain?: string;
  userId?: string;
  existingAccount: boolean;
  continueLocally: boolean;
  redirectTo?: string;
}

export interface AuthFnEnvironment {
  issuer: string;
  baseUrl: string;
  regionId: string | null;
  cookie: {
    prefix: string;
    domain: string | null;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    sessionCookieName: string;
    csrfCookieName: string;
  };
  oauth: Record<string, {
    clientId: string | null;
    hasClientSecret: boolean;
    hasClientSecretResolver: boolean;
    allowlistedRedirectUris: string[];
    allowlistedReturnTo: string[];
    scopes: string[];
  }>;
}

export interface AuthFnClient {
  createTransportAuth(input?: AuthFnTransportAuthOptions): HttpTransportAuthProvider;
  getSession(): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  getAccountDetails(): Promise<AuthFnAccountDetailsEnvelope | AuthFnErrorEnvelope>;
  deleteAccount(): Promise<AuthFnDeleteAccountEnvelope | AuthFnErrorEnvelope>;
  signUpWithPassword(input: {
    email: string;
    password: string;
    profile?: Record<string, unknown>;
    sessionMode?: 'cookie' | 'bearer' | 'hybrid';
  }): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  signInWithPassword(input: {
    email: string;
    password: string;
    sessionMode?: 'cookie' | 'bearer' | 'hybrid';
  }): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  signOut(input?: { allSessions?: boolean }): Promise<AuthFnSuccessEnvelope<{ revoked: boolean; allSessions: boolean; }> | AuthFnErrorEnvelope>;
  listSessions(): Promise<AuthFnListSessionsEnvelope | AuthFnErrorEnvelope>;
  revokeSession(input: { sessionId: string }): Promise<AuthFnSuccessEnvelope<{ revoked: boolean; sessionId: string; }> | AuthFnErrorEnvelope>;
  sendOtp(input: {
    purpose: AuthFnOtpPurpose;
    email: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthFnOtpEnvelope | AuthFnErrorEnvelope>;
  startPasswordReset(input: {
    email: string;
  }): Promise<AuthFnOtpEnvelope | AuthFnErrorEnvelope>;
  verifyOtp(input: {
    purpose: AuthFnOtpPurpose;
    email: string;
    code: string;
    profile?: Record<string, unknown>;
    sessionMode?: 'cookie' | 'bearer' | 'hybrid';
  }): Promise<AuthFnSessionEnvelope | AuthFnVerifyOtpEnvelope | AuthFnErrorEnvelope>;
  completePasswordReset(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<AuthFnSuccessEnvelope<{ passwordUpdated: true; }> | AuthFnErrorEnvelope>;
  startSocialSignIn(input: {
    provider: AuthFnSocialProviderId;
    returnTo?: string;
    callbackMode?: 'redirect' | 'json';
    handoffMode?: 'none' | 'session-token';
  }): Promise<AuthFnSuccessEnvelope<{
    provider: AuthFnSocialProviderId;
    redirectTo: string;
    stateId: string;
    expiresAt: string;
  }> | AuthFnErrorEnvelope>;
  disconnectSocialAccount(input: {
    provider: AuthFnSocialProviderId;
  }): Promise<AuthFnSuccessEnvelope<{
    disconnected: boolean;
    provider: AuthFnSocialProviderId;
  }> | AuthFnErrorEnvelope>;
  startNativeHandoff(): Promise<AuthFnSuccessEnvelope<{
    code: string;
    regionId: string;
    expiresAt: string;
  }> | AuthFnErrorEnvelope>;
  startWebHandoff(input?: {
    returnTo?: string;
  }): Promise<AuthFnSuccessEnvelope<{
    consumeUrl: string;
    code: string;
    expiresAt: string;
  }> | AuthFnErrorEnvelope>;
  createApiKey(input: {
    name?: string;
    scopes?: string[];
    metadata?: Record<string, unknown>;
    expiresAt?: string;
  }): Promise<AuthFnSuccessEnvelope<{
    keyId: string;
    secret: string;
    secretReturnedOnce: true;
  }> | AuthFnErrorEnvelope>;
  listApiKeys(): Promise<AuthFnSuccessEnvelope<{
    keys: AuthFnApiKeyRecord[];
  }> | AuthFnErrorEnvelope>;
  revokeApiKey(input: {
    keyId: string;
  }): Promise<AuthFnSuccessEnvelope<{
    revoked: boolean;
    keyId: string;
  }> | AuthFnErrorEnvelope>;
  enableTwoFactor(): Promise<AuthFnSuccessEnvelope<{
    enrollmentId: string;
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
  }> | AuthFnErrorEnvelope>;
  confirmTwoFactor(input: { code: string }): Promise<AuthFnSuccessEnvelope | AuthFnErrorEnvelope>;
  completeTwoFactorChallenge(input: {
    challengeId: string;
    code: string;
  }): Promise<AuthFnSuccessEnvelope<{
    twoFactorSatisfied: true;
    session: AuthFnSession;
  }> | AuthFnErrorEnvelope>;
  disableTwoFactor(input: {
    code: string;
  }): Promise<AuthFnSuccessEnvelope<{
    disabled: true;
  }> | AuthFnErrorEnvelope>;
  lookupRegion(input: {
    identifier: string;
  }): Promise<AuthFnSuccessEnvelope<AuthFnRegionLookupResult> | AuthFnErrorEnvelope>;
  getEnvironment(): Promise<AuthFnSuccessEnvelope<AuthFnEnvironment> | AuthFnErrorEnvelope>;
}

export interface AuthFnCachedRegion {
  identifier: string;
  regionId: string;
  authority: string;
  domain?: string;
  cachedAt: number;
  expiresAt: number;
}

export interface AuthFnRegionStorage {
  get(identifier: string): Promise<AuthFnCachedRegion | null>;
  set(identifier: string, value: AuthFnCachedRegion): Promise<void>;
  delete(identifier: string): Promise<void>;
}

export interface AuthFnRegionalClientOptions {
  defaultRegionId: string;
  resolveBaseUrl(regionId: string): string;
  storage?: AuthFnRegionStorage;
  cacheTtlMs?: number;
  onRegionChanged?(event: {
    identifier: string;
    fromRegionId?: string;
    toRegionId: string;
    authority: string;
  }): void;
  clientOptions?: Omit<AuthFnClientOptions, 'baseUrl'>;
}

export interface AuthFnRegionalClient extends AuthFnClient {
  prepareEmailAuth(input: {
    email: string;
    flow: AuthFnEmailAuthFlow;
    preferredRegionId?: string;
  }): Promise<AuthFnSuccessEnvelope<AuthFnRegionalEmailAuthPreparation> | AuthFnErrorEnvelope>;
  resolveRegion(input: { identifier: string; forceRefresh?: boolean }): Promise<AuthFnCachedRegion | null>;
  clearRegion(input: { identifier: string }): Promise<void>;
  getCurrentRegionId(): string;
  setCurrentRegionId(regionId: string): void;
}

export interface AuthFnClientRequestMetric {
  method: string;
  path: string;
  url: string;
  status?: number;
  ok: boolean;
  durationMs: number;
  requestId?: string;
  serverTiming?: string;
  dbDurationMs?: string;
  dbCallCount?: string;
  cacheDurationMs?: string;
  cacheCallCount?: string;
  lookupDurationMs?: string;
  lookupCallCount?: string;
  workerColo?: string;
  accountRegion?: string;
  error?: {
    name?: string;
    message: string;
  };
}

export interface AuthFnClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  bearerToken?: string | (() => string | undefined | null | Promise<string | undefined | null>);
  cookieAccessor?: () => string | undefined;
  cookiePrefix?: string;
  credentials?: RequestCredentials;
  onRequestMetric?(metric: AuthFnClientRequestMetric): void;
}

export type {
  AuthFnTransportAuthOptions
} from './transport-auth.js';
export type { AuthFnBearerTokenProvider } from './transport-auth-internal.js';
