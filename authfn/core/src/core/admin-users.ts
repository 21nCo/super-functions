import type {
  AuthFnAccountDeletionResult,
  AuthFnConfig,
  AuthFnHooks,
  AuthFnRegionProfileRecord,
  AuthFnUserRecord
} from '../types.js';
import {
  AuthFnAdminAmbiguousUserError,
  AuthFnNotFoundError,
  AuthFnValidationError
} from './errors.js';
import { deleteAccountForUser } from './account.js';
import { findUserById } from './users.js';

export type AuthFnAdminListUsersDirection = 'asc' | 'desc';

export interface AuthFnAdminUserSummary {
  id: string;
  primaryEmail?: string;
  emailVerifiedAt?: Date | string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
  regionProfile?: {
    regionId: string;
    authority: string;
    domain?: string | null;
  };
}

export interface AuthFnAdminListUsersInput {
  limit?: number;
  cursor?: string;
  email?: string;
  regionId?: string;
  direction?: AuthFnAdminListUsersDirection;
}

export interface AuthFnAdminListUsersResult {
  users: AuthFnAdminUserSummary[];
  pageInfo: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface AuthFnAdminDeleteUserInput {
  userId: string;
  request?: Request;
  actorId?: string;
}

export interface AuthFnAdminDeleteUsersByEmailInput {
  email: string;
  deleteAllMatches?: boolean;
  request?: Request;
  actorId?: string;
}

export interface AuthFnAdminDeleteUsersByEmailResult {
  deleted: true;
  primaryEmail: string;
  deletedCount: number;
  users: AuthFnAccountDeletionResult[];
}

interface DecodedUserCursor {
  createdAt: string;
  id: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const BATCH_SIZE = 250;
const MAX_SCANNED_USERS = 10_000;

export async function listAuthFnAdminUsers(
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  input: AuthFnAdminListUsersInput = {}
): Promise<AuthFnAdminListUsersResult> {
  const limit = normalizeLimit(input.limit);
  const direction = input.direction ?? 'desc';
  const cursor = input.cursor ? decodeUserCursor(input.cursor) : null;
  const email = normalizeEmail(input.email);
  const regionId = normalizeOptionalString(input.regionId);
  const where = email
    ? [{ field: 'primaryEmail', operator: 'eq' as const, value: email }]
    : [];

  const selected: AuthFnAdminUserSummary[] = [];
  let offset = 0;
  let scanned = 0;
  let exhausted = false;

  while (selected.length <= limit && scanned < MAX_SCANNED_USERS && !exhausted) {
    const batch = await config.database.findMany<AuthFnUserRecord>({
      model: 'users',
      where,
      orderBy: [
        { field: 'createdAt', direction },
        { field: 'id', direction }
      ],
      limit: BATCH_SIZE,
      offset,
      namespace: namespace(config)
    });

    exhausted = batch.length < BATCH_SIZE;
    offset += batch.length;
    scanned += batch.length;

    const regionProfiles = await findRegionProfilesForUsers(config, batch);
    for (const user of batch) {
      if (cursor && !isAfterCursor(user, cursor, direction)) {
        continue;
      }

      const regionProfile = regionProfiles.get(user.id);
      if (regionId && regionProfile?.regionId !== regionId) {
        continue;
      }

      selected.push(toAdminUserSummary(user, regionProfile));
      if (selected.length > limit) {
        break;
      }
    }
  }

  const users = selected.slice(0, limit);
  const last = users.at(-1);
  const hasMore = selected.length > limit || (!exhausted && scanned >= MAX_SCANNED_USERS);

  return {
    users,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeUserCursor(last) : undefined
    }
  };
}

export async function deleteAuthFnAdminUserById(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  input: AuthFnAdminDeleteUserInput
): Promise<AuthFnAccountDeletionResult> {
  const user = await findUserById(config, input.userId);
  if (!user) {
    throw new AuthFnNotFoundError('User not found', {
      userId: input.userId
    });
  }

  return deleteAccountForUser(config, hooks, {
    user,
    request: input.request,
    actorId: input.actorId
  });
}

export async function deleteAuthFnAdminUsersByEmail(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  input: AuthFnAdminDeleteUsersByEmailInput
): Promise<AuthFnAdminDeleteUsersByEmailResult> {
  const primaryEmail = normalizeEmail(input.email);
  if (!primaryEmail) {
    throw new AuthFnValidationError('Email is required', {
      field: 'email'
    });
  }

  const users = await config.database.findMany<AuthFnUserRecord>({
    model: 'users',
    where: [{ field: 'primaryEmail', operator: 'eq', value: primaryEmail }],
    orderBy: [
      { field: 'createdAt', direction: 'asc' },
      { field: 'id', direction: 'asc' }
    ],
    namespace: namespace(config)
  });

  if (users.length === 0) {
    throw new AuthFnNotFoundError('User not found', {
      primaryEmail
    });
  }

  if (users.length > 1 && input.deleteAllMatches !== true) {
    throw new AuthFnAdminAmbiguousUserError('Multiple users matched this email', {
      primaryEmail,
      count: users.length,
      userIds: users.map((user) => user.id)
    });
  }

  const deletedUsers: AuthFnAccountDeletionResult[] = [];
  for (const user of users) {
    deletedUsers.push(await deleteAccountForUser(config, hooks, {
      user,
      request: input.request,
      actorId: input.actorId
    }));
  }

  return {
    deleted: true,
    primaryEmail,
    deletedCount: deletedUsers.length,
    users: deletedUsers
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new AuthFnValidationError('limit must be a positive integer', {
      field: 'limit'
    });
  }

  return Math.min(limit, MAX_LIMIT);
}

function decodeUserCursor(cursor: string): DecodedUserCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<DecodedUserCursor>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor payload');
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id
    };
  } catch (error) {
    throw new AuthFnValidationError('Invalid users cursor', {
      field: 'cursor',
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function encodeUserCursor(user: Pick<AuthFnAdminUserSummary, 'createdAt' | 'id'>): string {
  return Buffer.from(JSON.stringify({
    createdAt: toIsoDateString(user.createdAt),
    id: user.id
  } satisfies DecodedUserCursor)).toString('base64url');
}

function isAfterCursor(
  user: AuthFnUserRecord,
  cursor: DecodedUserCursor,
  direction: AuthFnAdminListUsersDirection
): boolean {
  const userCreatedAt = Date.parse(toIsoDateString(user.createdAt));
  const cursorCreatedAt = Date.parse(cursor.createdAt);

  if (Number.isNaN(userCreatedAt) || Number.isNaN(cursorCreatedAt)) {
    return false;
  }

  if (userCreatedAt !== cursorCreatedAt) {
    return direction === 'desc'
      ? userCreatedAt < cursorCreatedAt
      : userCreatedAt > cursorCreatedAt;
  }

  return direction === 'desc'
    ? user.id < cursor.id
    : user.id > cursor.id;
}

async function findRegionProfilesForUsers(
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  users: AuthFnUserRecord[]
): Promise<Map<string, AuthFnRegionProfileRecord>> {
  if (!hasPlugin(config, 'multiRegion') || users.length === 0) {
    return new Map();
  }

  const profiles = await config.database.findMany<AuthFnRegionProfileRecord>({
    model: 'region_profiles',
    where: [{ field: 'userId', operator: 'in', value: users.map((user) => user.id) }],
    namespace: namespace(config)
  });

  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

function toAdminUserSummary(
  user: AuthFnUserRecord,
  regionProfile?: AuthFnRegionProfileRecord
): AuthFnAdminUserSummary {
  return {
    id: user.id,
    primaryEmail: user.primaryEmail,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    regionProfile: regionProfile
      ? {
          regionId: regionProfile.regionId,
          authority: regionProfile.authority,
          domain: regionProfile.domain
        }
      : undefined
  };
}

function hasPlugin(config: Pick<AuthFnConfig, 'plugins'>, name: string): boolean {
  return config.plugins.some((plugin) => plugin.name === name);
}

function toIsoDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
