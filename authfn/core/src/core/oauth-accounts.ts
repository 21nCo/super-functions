import { randomBytes } from 'node:crypto';
import type { AuthFnRuntimeConfig, AuthFnSocialProfile, AuthFnSocialProviderId } from '../types.js';
import { AuthFnNotFoundError } from './errors.js';
import {
  AUTHFN_DATABASE_KEY_MAX_LENGTH,
  AUTHFN_LEGACY_USER_REFERENCE_MAX_LENGTH,
  assertAuthFnDatabaseKeyLength
} from './limits.js';
import { findUserById } from './users.js';

export interface AuthFnOAuthAccountRecord {
  id: string;
  userId: string;
  provider: AuthFnSocialProviderId;
  providerAccountId: string;
  connectionId: string;
  email?: string;
  profile?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertOAuthAccountInput {
  userId: string;
  provider: AuthFnSocialProviderId;
  providerAccountId: string;
  connectionId: string;
  email?: string;
  profile?: Record<string, unknown>;
}

export async function findOAuthAccountByProviderAccountId(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  provider: AuthFnSocialProviderId,
  providerAccountId: string
): Promise<AuthFnOAuthAccountRecord | null> {
  return config.database.findOne<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    where: [
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerAccountId', operator: 'eq', value: providerAccountId }
    ],
    namespace: namespace(config)
  });
}

export async function findOAuthAccountForUser(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  userId: string,
  provider: AuthFnSocialProviderId
): Promise<AuthFnOAuthAccountRecord | null> {
  return config.database.findOne<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    where: [
      { field: 'userId', operator: 'eq', value: userId },
      { field: 'provider', operator: 'eq', value: provider }
    ],
    namespace: namespace(config)
  });
}

export async function listOAuthAccountsForUser(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnOAuthAccountRecord[]> {
  return config.database.findMany<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export async function findOAuthAccountByConnectionId(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  connectionId: string
): Promise<AuthFnOAuthAccountRecord | null> {
  return config.database.findOne<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    where: [{ field: 'connectionId', operator: 'eq', value: connectionId }],
    namespace: namespace(config)
  });
}

export async function upsertOAuthAccount(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  input: UpsertOAuthAccountInput
): Promise<AuthFnOAuthAccountRecord> {
  const provider = assertAuthFnDatabaseKeyLength(input.provider, 'provider') as AuthFnSocialProviderId;
  const existing = await findOAuthAccountByProviderAccountId(
    config,
    provider,
    input.providerAccountId
  );
  const providerAccountId = existing?.providerAccountId === input.providerAccountId
    ? input.providerAccountId
    : assertAuthFnDatabaseKeyLength(input.providerAccountId, 'providerAccountId');
  const legacyUser = !existing &&
    Array.from(input.userId).length > AUTHFN_DATABASE_KEY_MAX_LENGTH
    ? await findUserById(config, input.userId)
    : null;
  const userId = existing?.userId === input.userId
    ? input.userId
    : legacyUser
      ? assertAuthFnDatabaseKeyLength(
          input.userId,
          'userId',
          AUTHFN_LEGACY_USER_REFERENCE_MAX_LENGTH
        )
      : assertAuthFnDatabaseKeyLength(input.userId, 'userId');
  const connectionId = existing?.connectionId === input.connectionId
    ? input.connectionId
    : assertAuthFnDatabaseKeyLength(input.connectionId, 'connectionId', 768);
  const timestamp = new Date();

  if (existing) {
    return config.database.update<AuthFnOAuthAccountRecord>({
      model: 'oauth_accounts',
      where: [{ field: 'id', operator: 'eq', value: existing.id }],
      data: {
        userId,
        connectionId,
        email: input.email,
        profile: input.profile,
        updatedAt: timestamp
      },
      namespace: namespace(config)
    });
  }

  const record: AuthFnOAuthAccountRecord = {
    id: createIdentifier('oauth'),
    userId,
    provider,
    providerAccountId,
    connectionId,
    email: input.email,
    profile: input.profile,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return config.database.create<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    data: record,
    namespace: namespace(config)
  });
}

export async function deleteOAuthAccountByConnectionId(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  connectionId: string
): Promise<void> {
  await config.database.deleteMany({
    model: 'oauth_accounts',
    where: [{ field: 'connectionId', operator: 'eq', value: connectionId }],
    namespace: namespace(config)
  });
}

export async function requireOAuthAccountForUser(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  userId: string,
  provider: AuthFnSocialProviderId
): Promise<AuthFnOAuthAccountRecord> {
  const account = await findOAuthAccountForUser(config, userId, provider);
  if (!account) {
    throw new AuthFnNotFoundError('OAuth account not found', {
      userId,
      provider
    });
  }

  return account;
}

export function buildOAuthAccountProfile(
  provider: AuthFnSocialProviderId,
  profile: AuthFnSocialProfile
): Record<string, unknown> {
  return {
    provider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
    emailVerified: profile.emailVerified ?? false,
    name: profile.name,
    ...(profile.profile ?? {})
  };
}

function namespace(config: Pick<AuthFnRuntimeConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
