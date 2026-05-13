import { randomBytes } from 'node:crypto';
import type { Adapter } from '@superfunctions/db';
import type { AuthFnConfig, AuthFnUserRecord } from '../types.js';
import { AuthFnConflictError } from './errors.js';

export interface CreateUserInput {
  id?: string;
  primaryEmail?: string;
  emailVerifiedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export async function createUser(
  config: AuthFnConfig,
  input: CreateUserInput
): Promise<AuthFnUserRecord> {
  const now = new Date();
  const primaryEmail = normalizeEmail(input.primaryEmail);
  if (primaryEmail) {
    const existingUser = await findUserByPrimaryEmail(config, primaryEmail);
    if (existingUser) {
      throw new AuthFnConflictError('A user with this email already exists', {
        primaryEmail,
        emailExists: true
      });
    }
  }

  const user: AuthFnUserRecord = {
    id: input.id ?? createIdentifier('user'),
    primaryEmail,
    emailVerifiedAt: input.emailVerifiedAt ?? null,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now
  };

  return createRecord(
    config.database,
    namespace(config),
    'users',
    user as unknown as Record<string, unknown>
  ) as unknown as Promise<AuthFnUserRecord>;
}

export async function findUserById(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnUserRecord | null> {
  return config.database.findOne<AuthFnUserRecord>({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export async function findUserByPrimaryEmail(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  primaryEmail: string
): Promise<AuthFnUserRecord | null> {
  const email = normalizeEmail(primaryEmail);
  if (!email) {
    return null;
  }

  return config.database.findOne<AuthFnUserRecord>({
    model: 'users',
    where: [{ field: 'primaryEmail', operator: 'eq', value: email }],
    namespace: namespace(config)
  });
}

export async function markUserEmailVerified(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string,
  verifiedAt: Date = new Date()
): Promise<AuthFnUserRecord> {
  return config.database.update<AuthFnUserRecord>({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: userId }],
    data: {
      emailVerifiedAt: verifiedAt,
      updatedAt: verifiedAt
    },
    namespace: namespace(config)
  });
}

async function createRecord<TRecord extends Record<string, unknown>>(
  database: Adapter,
  namespaceValue: string,
  model: string,
  data: TRecord
): Promise<TRecord> {
  return database.create<TRecord>({
    model,
    data,
    namespace: namespaceValue
  });
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}
