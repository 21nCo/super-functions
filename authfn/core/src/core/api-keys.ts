import { randomBytes } from 'node:crypto';
import type { AuthFnApiKeyRecord, AuthFnConfig, AuthFnSession } from '../types.js';
import { AuthFnApiKeyRevokedError, AuthFnNotFoundError, AuthFnValidationError } from './errors.js';
import { hashSecret } from './sessions.js';

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface CreatedApiKey {
  keyId: string;
  secret: string;
  record: AuthFnApiKeyRecord;
}

export interface SanitizedApiKey {
  id: string;
  userId?: string | null;
  name?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createApiKey(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  input: CreateApiKeyInput,
  options?: { now?: () => Date; secretPrefix?: string }
): Promise<CreatedApiKey> {
  assertValidApiKeyName(input.name);
  assertValidApiKeyExpiry(input.expiresAt);
  const now = options?.now?.() ?? new Date();
  const secret = createApiKeySecret(options?.secretPrefix);
  const record: AuthFnApiKeyRecord = {
    id: createIdentifier('key'),
    userId: input.userId,
    name: input.name,
    secretHash: hashSecret(secret),
    scopes: input.scopes,
    metadata: input.metadata,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now
  };

  await config.database.create<AuthFnApiKeyRecord>({
    model: 'api_keys',
    data: record,
    namespace: namespace(config)
  });

  return {
    keyId: record.id,
    secret,
    record
  };
}

export async function listApiKeysForUser(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<SanitizedApiKey[]> {
  const records = await config.database.findMany<AuthFnApiKeyRecord>({
    model: 'api_keys',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    orderBy: [
      { field: 'createdAt', direction: 'asc' },
      { field: 'id', direction: 'asc' }
    ],
    namespace: namespace(config)
  });

  return records.map((record) => sanitizeApiKeyRecord(record));
}

export async function findApiKeyById(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  keyId: string
): Promise<AuthFnApiKeyRecord | null> {
  return config.database.findOne<AuthFnApiKeyRecord>({
    model: 'api_keys',
    where: [{ field: 'id', operator: 'eq', value: keyId }],
    namespace: namespace(config)
  });
}

export async function revokeApiKeyById(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  keyId: string,
  options?: { userId?: string; now?: () => Date }
): Promise<AuthFnApiKeyRecord> {
  const record = await findApiKeyById(config, keyId);
  if (!record || (options?.userId && record.userId !== options.userId)) {
    throw new AuthFnNotFoundError('API key not found', { keyId });
  }

  if (record.revokedAt) {
    return record;
  }

  const revokedAt = options?.now?.() ?? new Date();
  return config.database.update<AuthFnApiKeyRecord>({
    model: 'api_keys',
    where: [{ field: 'id', operator: 'eq', value: keyId }],
    data: {
      revokedAt,
      updatedAt: revokedAt
    },
    namespace: namespace(config)
  });
}

export async function authenticateApiKey(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  secret: string,
  options?: { now?: () => Date }
): Promise<AuthFnSession | null> {
  const record = await config.database.findOne<AuthFnApiKeyRecord>({
    model: 'api_keys',
    where: [{ field: 'secretHash', operator: 'eq', value: hashSecret(secret) }],
    namespace: namespace(config)
  });

  if (!record) {
    return null;
  }

  if (record.revokedAt) {
    throw new AuthFnApiKeyRevokedError('API key has been revoked', {
      keyId: record.id
    });
  }

  const now = options?.now?.() ?? new Date();
  if (record.expiresAt && record.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const updatedRecord = await config.database.update<AuthFnApiKeyRecord>({
    model: 'api_keys',
    where: [{ field: 'id', operator: 'eq', value: record.id }],
    data: {
      lastUsedAt: now,
      updatedAt: now
    },
    namespace: namespace(config)
  });

  return {
    id: updatedRecord.id,
    type: 'api-key',
    subject: {
      actorId: updatedRecord.id,
      actorType: 'api-key'
    },
    actorType: 'api-key',
    actorId: updatedRecord.id,
    resourceIds: [],
    methods: ['api-key'],
    expiresAt: updatedRecord.expiresAt ?? undefined,
    metadata: {
      ...(updatedRecord.metadata ?? {}),
      ownerUserId: updatedRecord.userId ?? undefined,
      scopes: updatedRecord.scopes ?? []
    }
  };
}

export function sanitizeApiKeyRecord(record: AuthFnApiKeyRecord): SanitizedApiKey {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    scopes: record.scopes,
    metadata: record.metadata,
    expiresAt: record.expiresAt ?? null,
    revokedAt: record.revokedAt ?? null,
    lastUsedAt: record.lastUsedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function createApiKeySecret(prefix: string = 'ak'): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function assertValidApiKeyName(name: string): void {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new AuthFnValidationError('API key name is required', {
      field: 'name'
    });
  }

  const bytes = Buffer.byteLength(name, 'utf8');
  if (bytes > 128) {
    throw new AuthFnValidationError('API key name must be 128 UTF-8 bytes or fewer', {
      field: 'name',
      maxBytes: 128,
      receivedBytes: bytes
    });
  }
}

function assertValidApiKeyExpiry(expiresAt: Date | undefined): void {
  if (!expiresAt) {
    return;
  }

  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new AuthFnValidationError('API key expiry must be a valid date', {
      field: 'expiresAt'
    });
  }
}
