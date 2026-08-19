import type {
  AuthFnAccountDeletionResult,
  AuthFnRuntimeConfig,
  AuthFnHooks,
  AuthFnSession,
  AuthFnTwoFactorEnrollmentRecord,
  AuthFnSocialProviderId,
  AuthFnUserRecord
} from '../types.js';
import { getPasswordCredentialByUserId } from './passwords.js';
import { hasConfirmedTwoFactorEnrollment } from './two-factor.js';
import { listOAuthAccountsForUser, type AuthFnOAuthAccountRecord } from './oauth-accounts.js';
import { emitAuthEvent, eventRequestId } from './observability.js';
import {
  getMultiRegionPluginConfig,
  unregisterRegionLookupForIdentifier
} from './regions.js';

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
}

export async function getAccountDetailsForUser(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace' | 'plugins'>,
  user: AuthFnUserRecord
): Promise<AuthFnAccountDetails> {
  const hasPasswordPlugin = hasPlugin(config, 'password');
  const hasSocialOAuthPlugin = hasPlugin(config, 'socialOAuth');
  const hasEmailOtpPlugin = hasPlugin(config, 'emailOtp');
  const hasTwoFactorPlugin = hasPlugin(config, 'twoFactor');
  const [passwordCredential, oauthAccounts, twoFactorEnabled] = await Promise.all([
    hasPasswordPlugin ? getPasswordCredentialByUserId(config, user.id) : null,
    hasSocialOAuthPlugin ? listOAuthAccountsForUser(config, user.id) : [],
    hasTwoFactorPlugin ? hasConfirmedTwoFactorEnrollment(config, user.id) : false
  ]);
  const sanitizedOAuthAccounts = oauthAccounts
    .map(sanitizeOAuthAccount)
    .sort((left, right) => left.provider.localeCompare(right.provider));

  return {
    user: {
      id: user.id,
      primaryEmail: user.primaryEmail,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
      metadata: user.metadata,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    hasPassword: Boolean(passwordCredential),
    twoFactorEnabled,
    oauthAccounts: sanitizedOAuthAccounts,
    methods: {
      password: Boolean(passwordCredential),
      emailOtp: hasEmailOtpPlugin && Boolean(user.primaryEmail),
      oauth: sanitizedOAuthAccounts.map((account) => account.provider),
      twoFactor: twoFactorEnabled
    }
  };
}

export async function deleteAccountForUser(
  config: AuthFnRuntimeConfig,
  hooks: Partial<AuthFnHooks>,
  input: {
    user: AuthFnUserRecord;
    session?: AuthFnSession;
    request?: Request;
    actorId?: string;
  }
): Promise<AuthFnAccountDeletionResult> {
  const user = input.user;
  const actorId = input.actorId ?? user.id;
  const counts: Record<string, number> = {};

  await hooks.beforeAccountDelete?.({
    config,
    request: input.request,
    session: input.session,
    actorId
  }, {
    userId: user.id,
    primaryEmail: user.primaryEmail,
    sessionId: input.session?.id
  });

  if (hasPlugin(config, 'twoFactor')) {
    const enrollments = await config.database.findMany<AuthFnTwoFactorEnrollmentRecord>({
      model: 'two_factor_enrollments',
      where: [{ field: 'userId', operator: 'eq', value: user.id }],
      namespace: namespace(config)
    });
    let recoveryCodes = 0;
    for (const enrollment of enrollments) {
      recoveryCodes += await deleteMany(config, 'two_factor_recovery_codes', 'enrollmentId', enrollment.id);
    }
    counts.twoFactorRecoveryCodes = recoveryCodes;
    counts.twoFactorChallenges = await deleteMany(config, 'two_factor_challenges', 'userId', user.id);
    counts.twoFactorEnrollments = await deleteMany(config, 'two_factor_enrollments', 'userId', user.id);
  }

  if (hasPlugin(config, 'nativeHandoff')) {
    counts.nativeHandoffCodes = await deleteMany(config, 'native_handoff_codes', 'userId', user.id);
  }
  if (hasPlugin(config, 'apiKey')) {
    counts.apiKeys = await deleteMany(config, 'api_keys', 'userId', user.id);
  }
  if (hasPlugin(config, 'socialOAuth')) {
    counts.oauthAccounts = await deleteMany(config, 'oauth_accounts', 'userId', user.id);
  }
  if (hasPlugin(config, 'password')) {
    counts.passwordCredentials = await deleteMany(config, 'password_credentials', 'userId', user.id);
  }
  if (hasPlugin(config, 'emailOtp') && user.primaryEmail) {
    counts.otpChallenges = await deleteMany(config, 'otp_challenges', 'email', user.primaryEmail.trim().toLowerCase());
  }
  const multiRegion = getMultiRegionPluginConfig(config);
  if (multiRegion && user.primaryEmail) {
    await unregisterRegionLookupForIdentifier(config, multiRegion, user.primaryEmail);
  }
  if (multiRegion) {
    counts.regionProfiles = await deleteMany(config, 'region_profiles', 'userId', user.id);
  }

  counts.sessions = await deleteMany(config, 'sessions', 'userId', user.id);
  counts.users = await deleteMany(config, 'users', 'id', user.id);

  const result: AuthFnAccountDeletionResult = {
    deleted: true,
    userId: user.id,
    primaryEmail: user.primaryEmail,
    counts
  };

  try {
    await hooks.afterAccountDelete?.({
      config,
      request: input.request,
      session: input.session,
      actorId
    }, result);
  } catch {
    // The account is already deleted; post-delete hooks are observational cleanup.
  }

  try {
    await emitAuthEvent(config, {
      type: 'authfn.account.deleted',
      requestId: eventRequestId(input.request),
      actorId,
      sessionId: input.session?.id,
      userId: user.id,
      regionId: input.session?.regionId,
      outcome: 'deleted',
      metadata: {
        counts
      }
    });
  } catch {
    // Deletion should not be reported as failed if observability is unavailable.
  }

  return result;
}

function hasPlugin(config: Pick<AuthFnRuntimeConfig, 'plugins'>, name: string): boolean {
  return config.plugins.some((plugin) => plugin.name === name);
}

function sanitizeOAuthAccount(account: AuthFnOAuthAccountRecord): AuthFnAccountOAuthAccount {
  return {
    id: account.id,
    provider: account.provider,
    email: account.email,
    profile: account.profile,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

async function deleteMany(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  model: string,
  field: string,
  value: unknown
): Promise<number> {
  return config.database.deleteMany({
    model,
    where: [{ field, operator: 'eq', value }],
    namespace: namespace(config)
  });
}

function namespace(config: Pick<AuthFnRuntimeConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}
