export type AuthFnActorType = 'user' | 'api-key';
export type AuthFnSocialProviderId = 'google' | 'apple' | 'github';
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
}> {}

export interface AuthFnListSessionsEnvelope extends AuthFnSuccessEnvelope<{
  sessions: AuthFnSession[];
  currentSessionId?: string;
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

export interface AuthFnRuntimeResolution {
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
  getSession(): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  signUpWithPassword(input: {
    email: string;
    password: string;
    profile?: Record<string, unknown>;
  }): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<AuthFnSessionEnvelope | AuthFnErrorEnvelope>;
  signOut(input?: { allSessions?: boolean }): Promise<AuthFnSuccessEnvelope<{ revoked: boolean; allSessions: boolean; }> | AuthFnErrorEnvelope>;
  listSessions(): Promise<AuthFnListSessionsEnvelope | AuthFnErrorEnvelope>;
  revokeSession(input: { sessionId: string }): Promise<AuthFnSuccessEnvelope<{ revoked: boolean; sessionId: string; }> | AuthFnErrorEnvelope>;
  sendOtp(input: {
    purpose: 'verify-email' | 'sign-in' | 'reset-password';
    email: string;
  }): Promise<AuthFnOtpEnvelope | AuthFnErrorEnvelope>;
  startPasswordReset(input: {
    email: string;
  }): Promise<AuthFnOtpEnvelope | AuthFnErrorEnvelope>;
  verifyOtp(input: {
    purpose: 'verify-email' | 'sign-in' | 'reset-password';
    email: string;
    code: string;
  }): Promise<AuthFnSessionEnvelope | AuthFnVerifyOtpEnvelope | AuthFnErrorEnvelope>;
  completePasswordReset(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<AuthFnSuccessEnvelope<{ passwordUpdated: true; }> | AuthFnErrorEnvelope>;
  startSocialSignIn(input: {
    provider: AuthFnSocialProviderId;
    returnTo?: string;
    callbackMode?: 'json';
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
  getRuntime(): Promise<AuthFnSuccessEnvelope<AuthFnRuntimeResolution> | AuthFnErrorEnvelope>;
}

export interface AuthFnClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  cookieAccessor?: () => string | undefined;
  cookiePrefix?: string;
  credentials?: RequestCredentials;
}
