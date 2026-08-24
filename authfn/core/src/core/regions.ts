import { randomBytes } from 'node:crypto';
import { instrumentMethods, normalizeObservability } from '@superfunctions/observability';
import type {
  MultiRegionPluginRuntimeConfig,
  AuthFnMultiRegionRegionConfig,
  AuthFnRegionLookupRecord
} from '../plugin-types.js';
import type {
  AuthFnRuntimeConfig,
  AuthFnRegionLookup,
  AuthFnRegionLookupResult,
  AuthFnRegionProfileRecord,
  AuthFnEnvironment,
  AuthFnEnvironmentResolver,
  AuthFnUserRecord
} from '../types.js';
import {
  AUTHFN_CACHE_TTL_SECONDS,
  createAuthFnCacheKey,
  getAuthFnCacheStore,
  getCachedJson,
  setCachedJson
} from './cache.js';
import {
  AuthFnConfigError,
  AuthFnRegionMismatchError,
  AuthFnValidationError
} from './errors.js';
import { emitAuthEvent, eventRequestId } from './observability.js';
import { findUserById, findUserByPrimaryEmail } from './users.js';

const multiRegionEnvironmentConfig = Symbol.for('authfn.multiRegionEnvironmentConfig');

export interface AuthFnMultiRegionEnvironmentResolver extends AuthFnEnvironmentResolver {
  readonly [multiRegionEnvironmentConfig]: MultiRegionPluginRuntimeConfig;
}

/**
 * Creates an AuthFn request environment resolver from multi-region routing config.
 */
export function authFnMultiRegionEnvironment(
  config: MultiRegionPluginRuntimeConfig
): AuthFnMultiRegionEnvironmentResolver {
  const observability = normalizeObservability(config.observability)?.child({ component: 'authfn.lookup' });
  const resolvedConfig: MultiRegionPluginRuntimeConfig = {
    ...config,
    routing: config.routing?.placementDirectory
      ? {
          ...config.routing,
          placementDirectory: instrumentMethods({
            target: config.routing.placementDirectory,
            observability: observability?.child({ component: 'authfn.placement' }),
            kind: 'placement',
            component: 'authfn.placement',
            extract: ({ property }) => ({ operation: String(property) })
          })
        }
      : config.routing,
    lookupStore: config.lookupStore
      ? instrumentMethods({
          target: config.lookupStore,
          observability,
          kind: 'lookup',
          component: 'authfn.lookup',
          extract: ({ property, args }) => ({
            operation: String(property),
            resource: typeof args[0] === 'string'
              ? args[0]
              : readLookupIdentifier(args[0])
          })
        })
      : undefined
  };
  const resolver: AuthFnMultiRegionEnvironmentResolver = {
    [multiRegionEnvironmentConfig]: resolvedConfig,
    resolve(request) {
      const url = new URL(request.url);
      if (resolvedConfig.routing?.mode === 'gateway') {
        const publicAuthority = resolvedConfig.routing.publicAuthority;
        if (!publicAuthority) {
          throw new AuthFnConfigError('Gateway-mode multi-region AuthFn requires publicAuthority');
        }
        const authority = normalizeAuthority(publicAuthority);
        const cellRegionId = resolvedConfig.routing.cell?.regionId;
        const selectedRegion = cellRegionId
          ? findConfiguredRegion(resolvedConfig, cellRegionId)
          : resolveRegionForRequest(resolvedConfig, request, {
              issuer: authority,
              baseUrl: authority
            });
        if (cellRegionId && !selectedRegion) {
          throw new AuthFnConfigError('Gateway cell region must be present in configured regions');
        }
        return {
          issuer: authority,
          baseUrl: authority,
          regionId: cellRegionId ?? selectedRegion?.regionId,
          cookie: resolvedConfig.routing.canonicalCookie,
          oauth: resolvedConfig.routing.canonicalOAuth
        };
      }
      const baseEnvironment: AuthFnEnvironment = {
        issuer: url.origin,
        baseUrl: url.origin
      };
      const region = resolveRegionForRequest(resolvedConfig, request, baseEnvironment);
      if (!region) {
        return baseEnvironment;
      }
      return {
        issuer: region.issuer ?? region.authority,
        baseUrl: region.baseUrl ?? region.authority,
        regionId: region.regionId,
        cookie: {
          ...(region.cookie ?? {}),
          ...(region.domain && !region.cookie?.domain ? { domain: region.domain } : {})
        },
        oauth: region.oauth
      };
    }
  };
  return resolver;
}

export function getMultiRegionPluginConfig(
  config: Pick<AuthFnRuntimeConfig, 'plugins' | 'environment'>
): MultiRegionPluginRuntimeConfig | null {
  if (!config.plugins.some((plugin) => plugin.name === 'multiRegion')) {
    return null;
  }

  return readMultiRegionEnvironmentConfig(config.environment);
}

function readMultiRegionEnvironmentConfig(
  environment: AuthFnEnvironmentResolver | undefined
): MultiRegionPluginRuntimeConfig | null {
  return isMultiRegionEnvironmentResolver(environment)
    ? environment[multiRegionEnvironmentConfig]
    : null;
}

function isMultiRegionEnvironmentResolver(
  environment: AuthFnEnvironmentResolver | undefined
): environment is AuthFnMultiRegionEnvironmentResolver {
  return environment !== undefined
    && multiRegionEnvironmentConfig in environment;
}

export async function lookupRegionByIdentifier(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'stores' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  input: {
    identifier: string;
    request?: Request;
    environment: AuthFnEnvironment;
    bypassCache?: boolean;
  }
): Promise<AuthFnRegionLookup | null> {
  const identifier = normalizeIdentifier(input.identifier);
  const cacheKey = createAuthFnCacheKey(config, 'region', identifier);
  if (!input.bypassCache) {
    const cached = await getCachedJson<CachedRegionLookup>(getAuthFnCacheStore(config), cacheKey);
    if (cached) {
      return cached.found ? cached.lookup : null;
    }
  }

  if (pluginConfig.lookupStore) {
    const record = await readLookupStoreRecord(pluginConfig.lookupStore, identifier);
    if (record) {
      const lookup = lookupFromRecord(record);
      await setCachedJson(getAuthFnCacheStore(config), {
        key: cacheKey,
        value: {
          found: true,
          lookup
        } satisfies CachedRegionLookup,
        ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionHit
      });
      return lookup;
    }
  }

  const user = await findUserByPrimaryEmail(config, identifier);
  if (!user) {
    await setCachedJson(getAuthFnCacheStore(config), {
      key: cacheKey,
      value: {
        found: false
      } satisfies CachedRegionLookup,
      ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionMiss
    });
    return null;
  }

  const profile = await findRegionProfileByUserId(config, user.id);
  if (!profile) {
    await setCachedJson(getAuthFnCacheStore(config), {
      key: cacheKey,
      value: {
        found: false
      } satisfies CachedRegionLookup,
      ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionMiss
    });
    return null;
  }

  const lookup = {
    userId: user.id,
    regionId: profile.regionId,
    authority: profile.authority,
    domain: profile.domain ?? undefined
  };
  await setCachedJson(getAuthFnCacheStore(config), {
    key: cacheKey,
    value: {
      found: true,
      lookup
    } satisfies CachedRegionLookup,
    ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionHit
  });
  return lookup;
}

export async function buildLookupResult(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'stores' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  input: {
    identifier: string;
    request?: Request;
    environment: AuthFnEnvironment;
  }
): Promise<AuthFnRegionLookupResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    ...input,
    identifier
  });
  if (!lookup) {
    return {
      identifier,
      regionId: input.environment.regionId ?? pluginConfig.defaultRegionId ?? 'unknown',
      authority: normalizeAuthority(input.environment.baseUrl),
      domain: undefined,
      continueLocally: true,
      redirectTo: undefined
    };
  }

  const currentRegionId = input.environment.regionId ?? pluginConfig.defaultRegionId;
  const currentAuthority = normalizeAuthority(input.environment.baseUrl);
  const targetAuthority = resolveLookupAuthorityForRequest(pluginConfig, lookup, input.request, input.environment);
  const continueLocally = lookup.regionId === currentRegionId || currentAuthority === targetAuthority;

  return {
    identifier,
    userId: lookup.userId,
    regionId: lookup.regionId,
    authority: targetAuthority,
    domain: lookup.domain,
    continueLocally,
    redirectTo: continueLocally ? undefined : targetAuthority
  };
}

export async function ensureRegionAlignmentForUser(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'stores' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  input: {
    userId: string;
    environment: AuthFnEnvironment;
    request?: Request;
  }
): Promise<{ regionId?: string }> {
  const user = await findUserById(config, input.userId);
  if (!user?.primaryEmail) {
    return {
      regionId: input.environment.regionId
    };
  }

  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    identifier: user.primaryEmail,
    request: input.request,
    environment: input.environment,
    bypassCache: true
  });
  if (!lookup) {
    return {
      regionId: input.environment.regionId
    };
  }

  const currentAuthority = normalizeAuthority(input.environment.baseUrl);
  const targetAuthority = resolveLookupAuthorityForRequest(pluginConfig, lookup, input.request, input.environment);
  if (lookup.regionId !== input.environment.regionId && currentAuthority !== targetAuthority) {
    throw new AuthFnRegionMismatchError('Request must continue on a different region authority', {
      userId: user.id,
      regionId: lookup.regionId,
      authority: targetAuthority,
      redirectTo: targetAuthority,
      continueLocally: false
    });
  }

  return {
    regionId: lookup.regionId
  };
}

export async function ensureRegionAlignmentForIdentifier(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'stores' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  input: {
    identifier: string;
    environment: AuthFnEnvironment;
    request?: Request;
  }
): Promise<{ regionId?: string }> {
  const identifier = normalizeIdentifier(input.identifier);
  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    identifier,
    request: input.request,
    environment: input.environment,
    bypassCache: true
  });
  if (!lookup) {
    return {
      regionId: input.environment.regionId
    };
  }

  const currentAuthority = normalizeAuthority(input.environment.baseUrl);
  const targetAuthority = resolveLookupAuthorityForRequest(pluginConfig, lookup, input.request, input.environment);
  if (lookup.regionId !== input.environment.regionId && currentAuthority !== targetAuthority) {
    throw new AuthFnRegionMismatchError('Request must continue on a different region authority', {
      identifier,
      userId: lookup.userId,
      regionId: lookup.regionId,
      authority: targetAuthority,
      redirectTo: targetAuthority,
      continueLocally: false
    });
  }

  return {
    regionId: lookup.regionId
  };
}

export async function registerUserRegion(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'stores' | 'namespace' | 'observability'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  input: {
    user: Pick<AuthFnUserRecord, 'id' | 'primaryEmail'>;
    environment: AuthFnEnvironment;
    request?: Request;
  }
): Promise<AuthFnRegionProfileRecord | null> {
  const currentRegion = deriveCurrentRegion(pluginConfig, input.request, input.environment);
  if (!currentRegion) {
    return null;
  }

  const now = new Date();
  const existing = await findRegionProfileByUserId(config, input.user.id);
  const record: AuthFnRegionProfileRecord = {
    id: existing?.id ?? createIdentifier('region'),
    userId: input.user.id,
    regionId: currentRegion.regionId,
    authority: currentRegion.authority,
    domain: currentRegion.domain ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  let insertedLookup = false;
  if (input.user.primaryEmail) {
    const identifier = normalizeIdentifier(input.user.primaryEmail);
    const cacheKey = createAuthFnCacheKey(config, 'region', identifier);
    const lookupRecord: AuthFnRegionLookupRecord = {
      identifier,
      userId: input.user.id,
      regionId: record.regionId,
      authority: record.authority,
      domain: record.domain ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };

    if (pluginConfig.lookupStore && pluginConfig.routing?.mode !== 'gateway') {
      const migratedRecord = await readLookupStoreRecord(pluginConfig.lookupStore, identifier);
      const result = migratedRecord
        ? { inserted: false, existing: serializeLookupRecord(migratedRecord) }
        : await pluginConfig.lookupStore.setIfAbsent({
            key: regionLookupStoreKey(identifier),
            value: serializeLookupRecord(lookupRecord)
          });
      const existingRecord = parseLookupRecord(result.existing);
      insertedLookup = result.inserted;
      if (!result.inserted && existingRecord && !recordsReferToSameRegionUser(existingRecord, lookupRecord)) {
        const existing = lookupFromRecord(existingRecord);
        await setCachedJson(getAuthFnCacheStore(config), {
          key: cacheKey,
          value: {
            found: true,
            lookup: existing
          } satisfies CachedRegionLookup,
          ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionHit
        });
        await emitAuthEvent(config, {
          type: 'authfn.region.lookup.conflict',
          requestId: eventRequestId(input.request),
          actorId: input.user.id,
          userId: input.user.id,
          regionId: existing.regionId,
          outcome: 'conflict',
          metadata: {
            identifier,
            attemptedRegionId: record.regionId,
            attemptedAuthority: record.authority,
            authority: existing.authority
          }
        });
        throw new AuthFnRegionMismatchError('Identifier is already registered in another region authority', {
          identifier,
          userId: existing.userId,
          regionId: existing.regionId,
          authority: existing.authority,
          redirectTo: existing.authority,
          continueLocally: false
        });
      }
      if (!result.inserted && existingRecord && shouldRefreshExistingLookup(existingRecord, lookupRecord)) {
        await pluginConfig.lookupStore.set({
          key: regionLookupStoreKey(identifier),
          value: serializeLookupRecord(lookupRecord)
        });
      }
    }
  }

  try {
    if (existing) {
      await config.database.update<AuthFnRegionProfileRecord>({
        model: 'region_profiles',
        where: [{ field: 'id', operator: 'eq', value: existing.id }],
        data: {
          regionId: record.regionId,
          authority: record.authority,
          domain: record.domain,
          updatedAt: now
        },
        namespace: namespace(config)
      });
    } else {
      await config.database.create<AuthFnRegionProfileRecord>({
        model: 'region_profiles',
        data: record,
        namespace: namespace(config)
      });
    }
  } catch (error) {
    if (insertedLookup && input.user.primaryEmail) {
      const identifier = normalizeIdentifier(input.user.primaryEmail);
      await pluginConfig.lookupStore?.delete(regionLookupStoreKey(identifier));
      await getAuthFnCacheStore(config)?.delete(createAuthFnCacheKey(config, 'region', identifier));
    }
    throw error;
  }

  if (input.user.primaryEmail) {
    const identifier = normalizeIdentifier(input.user.primaryEmail);
    const cacheKey = createAuthFnCacheKey(config, 'region', identifier);
    const lookupRecord: AuthFnRegionLookupRecord = {
      identifier,
      userId: input.user.id,
      regionId: record.regionId,
      authority: record.authority,
      domain: record.domain ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
    if (pluginConfig.lookupStore && pluginConfig.routing?.mode === 'gateway') {
      // Gateway placement already settled ownership before execution. This is
      // a post-commit lookup projection only and never participates in routing.
      try {
        await pluginConfig.lookupStore.set({
          key: regionLookupStoreKey(identifier),
          value: serializeLookupRecord(lookupRecord)
        });
      } catch (error) {
        await emitAuthEvent(config, {
          type: 'authfn.region.lookup',
          requestId: eventRequestId(input.request),
          userId: input.user.id,
          regionId: record.regionId,
          outcome: 'projection-failed',
          metadata: {
            identifier,
            errorCode: readErrorCode(error)
          }
        });
      }
    }
    await setCachedJson(getAuthFnCacheStore(config), {
      key: cacheKey,
      value: {
        found: true,
        lookup: lookupFromRecord(lookupRecord)
      } satisfies CachedRegionLookup,
      ttlSeconds: AUTHFN_CACHE_TTL_SECONDS.regionHit
    });
  }

  return record;
}

function recordsReferToSameRegionUser(
  existing: AuthFnRegionLookupRecord,
  expected: AuthFnRegionLookupRecord
): boolean {
  return normalizeIdentifier(existing.identifier) === expected.identifier
    && existing.regionId === expected.regionId
    && (!existing.userId || existing.userId === expected.userId);
}

function resolveLookupAuthorityForRequest(
  pluginConfig: MultiRegionPluginRuntimeConfig,
  lookup: AuthFnRegionLookup,
  request: Request | undefined,
  runtime: AuthFnEnvironment
): string {
  const productPeer = request
    ? findRegionPeerForRequest(pluginConfig, lookup.regionId, request, runtime)
    : undefined;
  return normalizeAuthority(productPeer?.baseUrl ?? productPeer?.authority ?? lookup.authority);
}

function findRegionPeerForRequest(
  pluginConfig: MultiRegionPluginRuntimeConfig,
  targetRegionId: string,
  request: Request,
  runtime: AuthFnEnvironment
): AuthFnMultiRegionRegionConfig | undefined {
  const currentRegion = resolveRegionForRequest(pluginConfig, request, runtime);
  if (!currentRegion) {
    return findConfiguredRegion(pluginConfig, targetRegionId);
  }

  const currentDomain = normalizeOptionalString(currentRegion.domain ?? currentRegion.cookie?.domain);
  const sameProduct = (pluginConfig.regions ?? []).find((candidate) => {
    const candidateDomain = normalizeOptionalString(candidate.domain ?? candidate.cookie?.domain);
    return candidate.regionId === targetRegionId
      && currentDomain
      && candidateDomain === currentDomain;
  });

  return sameProduct ?? findConfiguredRegion(pluginConfig, targetRegionId);
}

function shouldRefreshExistingLookup(
  existing: AuthFnRegionLookupRecord,
  expected: AuthFnRegionLookupRecord
): boolean {
  return !existing.userId && Boolean(expected.userId);
}

export async function unregisterRegionLookupForIdentifier(
  config: Pick<AuthFnRuntimeConfig, 'stores' | 'namespace'>,
  pluginConfig: MultiRegionPluginRuntimeConfig,
  identifier: string
): Promise<void> {
  const normalized = normalizeIdentifier(identifier);
  await pluginConfig.lookupStore?.delete(regionLookupStoreKey(normalized));
  // Keep the legacy bare-key namespace from resurrecting a lookup after the
  // prefixed record is removed during a rolling migration.
  await pluginConfig.lookupStore?.delete(normalized);
  await getAuthFnCacheStore(config)?.delete(createAuthFnCacheKey(config, 'region', normalized));
}

export async function findRegionProfileByUserId(
  config: Pick<AuthFnRuntimeConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnRegionProfileRecord | null> {
  return config.database.findOne<AuthFnRegionProfileRecord>({
    model: 'region_profiles',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export function resolveRegionForRequest(
  pluginConfig: MultiRegionPluginRuntimeConfig,
  request: Request,
  runtime: AuthFnEnvironment
): AuthFnMultiRegionRegionConfig | null {
  const host = new URL(request.url).hostname.toLowerCase();
  const regionByHost = (pluginConfig.regions ?? []).find((candidate) =>
    collectRegionHosts(candidate).some((entry) => hostMatches(host, entry))
  );
  if (regionByHost) {
    return regionByHost;
  }

  if (runtime.regionId) {
    const regionById = findConfiguredRegion(pluginConfig, runtime.regionId);
    if (regionById) {
      return regionById;
    }
  }

  if (pluginConfig.defaultRegionId) {
    return findConfiguredRegion(pluginConfig, pluginConfig.defaultRegionId) ?? null;
  }

  return null;
}

function deriveCurrentRegion(
  pluginConfig: MultiRegionPluginRuntimeConfig,
  request: Request | undefined,
  runtime: AuthFnEnvironment
): AuthFnRegionLookup | null {
  const configured = request ? resolveRegionForRequest(pluginConfig, request, runtime) : undefined;
  const regionId = configured?.regionId ?? runtime.regionId;
  const authority = normalizeOptionalString(configured?.authority ?? runtime.baseUrl);
  if (!regionId || !authority) {
    return null;
  }

  return {
    regionId,
    authority: normalizeAuthority(authority),
    domain: normalizeOptionalString(configured?.domain)
  };
}

function findConfiguredRegion(
  pluginConfig: MultiRegionPluginRuntimeConfig,
  regionId: string
): AuthFnMultiRegionRegionConfig | undefined {
  return (pluginConfig.regions ?? []).find((region) => region.regionId === regionId);
}

function collectRegionHosts(region: AuthFnMultiRegionRegionConfig): string[] {
  const authorityHost = safeHostname(region.authority);
  return [
    ...(region.hosts ?? []),
    ...(authorityHost ? [authorityHost] : [])
  ]
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function hostMatches(host: string, candidate: string): boolean {
  return host === candidate || host.endsWith(`.${candidate.replace(/^\./, '')}`);
}

function safeHostname(authority: string): string | null {
  try {
    return new URL(authority).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new AuthFnValidationError('A valid identifier is required', {
      field: 'identifier'
    });
  }
  return normalized;
}

function normalizeAuthority(authority: string): string {
  try {
    return new URL(authority).origin;
  } catch {
    throw new AuthFnValidationError('A valid region authority is required', {
      authority
    });
  }
}

function readErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN';
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

type CachedRegionLookup =
  | {
      found: true;
      lookup: AuthFnRegionLookup;
    }
  | {
      found: false;
    };

function lookupFromRecord(record: AuthFnRegionLookupRecord): AuthFnRegionLookup {
  return {
    userId: record.userId,
    regionId: record.regionId,
    authority: normalizeAuthority(record.authority),
    domain: normalizeOptionalString(record.domain)
  };
}

function regionLookupStoreKey(identifier: string): string {
  return `authfn:region:${identifier}`;
}

async function readLookupStoreRecord(
  lookupStore: NonNullable<MultiRegionPluginRuntimeConfig['lookupStore']>,
  identifier: string
): Promise<AuthFnRegionLookupRecord | null> {
  const currentKey = regionLookupStoreKey(identifier);
  const current = parseLookupRecord(await lookupStore.get(currentKey));
  if (current) return current;

  // Releases before the generic conditional-KV contract used the normalized
  // identifier itself as the key. Read that location once and lazily claim the
  // prefixed key so existing users remain routable throughout rollout.
  const legacy = parseLookupRecord(await lookupStore.get(identifier));
  if (!legacy) return null;

  const migration = await lookupStore.setIfAbsent({
    key: currentKey,
    value: serializeLookupRecord(legacy)
  });
  return migration.inserted
    ? legacy
    : parseLookupRecord(migration.existing) ?? legacy;
}

function serializeLookupRecord(record: AuthFnRegionLookupRecord): string {
  return JSON.stringify(record);
}

function parseLookupRecord(value: string | undefined | null): AuthFnRegionLookupRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthFnRegionLookupRecord>;
    return typeof parsed.identifier === 'string'
      && typeof parsed.regionId === 'string'
      && typeof parsed.authority === 'string'
      && typeof parsed.createdAt === 'string'
      && typeof parsed.updatedAt === 'string'
      ? {
          identifier: parsed.identifier,
          userId: normalizeOptionalString(parsed.userId),
          regionId: parsed.regionId,
          authority: parsed.authority,
          domain: normalizeOptionalString(parsed.domain),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      : null;
  } catch {
    return null;
  }
}

function namespace(config: Pick<AuthFnRuntimeConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function readLookupIdentifier(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const identifier = (value as { identifier?: unknown }).identifier;
  return typeof identifier === 'string' ? identifier : undefined;
}
