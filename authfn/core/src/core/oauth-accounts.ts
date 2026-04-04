import { randomBytes } from 'node:crypto';
import type { AuthFnConfig, AuthFnSocialProfile, AuthFnSocialProviderId } from '../types.js';
import { AuthFnNotFoundError } from './errors.js';

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
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
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
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
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

export async function findOAuthAccountByConnectionId(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  connectionId: string
): Promise<AuthFnOAuthAccountRecord | null> {
  return config.database.findOne<AuthFnOAuthAccountRecord>({
    model: 'oauth_accounts',
    where: [{ field: 'connectionId', operator: 'eq', value: connectionId }],
    namespace: namespace(config)
  });
}

export async function upsertOAuthAccount(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  input: UpsertOAuthAccountInput
): Promise<AuthFnOAuthAccountRecord> {
  const existing = await findOAuthAccountByProviderAccountId(
    config,
    input.provider,
    input.providerAccountId
  );
  const timestamp = new Date();

  if (existing) {
    return config.database.update<AuthFnOAuthAccountRecord>({
      model: 'oauth_accounts',
      where: [{ field: 'id', operator: 'eq', value: existing.id }],
      data: {
        userId: input.userId,
        connectionId: input.connectionId,
        email: input.email,
        profile: input.profile,
        updatedAt: timestamp
      },
      namespace: namespace(config)
    });
  }

  const record: AuthFnOAuthAccountRecord = {
    id: createIdentifier('oauth'),
    userId: input.userId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    connectionId: input.connectionId,
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
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  connectionId: string
): Promise<void> {
  await config.database.deleteMany({
    model: 'oauth_accounts',
    where: [{ field: 'connectionId', operator: 'eq', value: connectionId }],
    namespace: namespace(config)
  });
}

export async function requireOAuthAccountForUser(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
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

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
