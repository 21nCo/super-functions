import { randomBytes } from 'node:crypto';
import type { MultiRegionPluginConfig, AuthFnMultiRegionRegionConfig } from '../plugin-types.js';
import type {
  AuthFnConfig,
  AuthFnRegionLookup,
  AuthFnRegionLookupResult,
  AuthFnRegionProfileRecord,
  AuthFnRuntimeResolution,
  AuthFnUserRecord
} from '../types.js';
import {
  AuthFnRegionMismatchError,
  AuthFnRegionNotFoundError,
  AuthFnValidationError
} from './errors.js';
import { findUserById, findUserByPrimaryEmail } from './users.js';

const multiRegionPluginConfigs = new WeakMap<object, MultiRegionPluginConfig>();

export function rememberMultiRegionPluginConfig(
  plugin: object,
  config: MultiRegionPluginConfig
): void {
  multiRegionPluginConfigs.set(plugin, config);
}

export function getMultiRegionPluginConfig(
  config: Pick<AuthFnConfig, 'plugins'>
): MultiRegionPluginConfig | null {
  for (const plugin of config.plugins) {
    if (plugin.name !== 'multiRegion') {
      continue;
    }

    return multiRegionPluginConfigs.get(plugin) ?? {};
  }

  return null;
}

export function resolveMultiRegionRuntimeOverride(
  config: Pick<AuthFnConfig, 'plugins'>,
  request: Request,
  baseRuntime: AuthFnRuntimeResolution
): Partial<AuthFnRuntimeResolution> | null {
  const pluginConfig = getMultiRegionPluginConfig(config);
  if (!pluginConfig) {
    return null;
  }

  const region = resolveRegionForRequest(pluginConfig, request, baseRuntime);
  if (!region) {
    return null;
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

export async function lookupRegionByIdentifier(
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginConfig,
  input: {
    identifier: string;
    request?: Request;
    runtime: AuthFnRuntimeResolution;
  }
): Promise<AuthFnRegionLookup | null> {
  const identifier = normalizeIdentifier(input.identifier);
  if (pluginConfig.directory) {
    const external = await pluginConfig.directory.lookupByIdentifier({
      identifier,
      request: input.request,
      runtime: input.runtime
    });
    if (external) {
      return {
        userId: external.userId,
        regionId: external.regionId,
        authority: normalizeAuthority(external.authority),
        domain: normalizeOptionalString(external.domain)
      };
    }
  }

  const user = await findUserByPrimaryEmail(config, identifier);
  if (!user) {
    return null;
  }

  const profile = await findRegionProfileByUserId(config, user.id);
  if (!profile) {
    return null;
  }

  return {
    userId: user.id,
    regionId: profile.regionId,
    authority: profile.authority,
    domain: profile.domain ?? undefined
  };
}

export async function buildLookupResult(
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginConfig,
  input: {
    identifier: string;
    request?: Request;
    runtime: AuthFnRuntimeResolution;
  }
): Promise<AuthFnRegionLookupResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    ...input,
    identifier
  });
  if (!lookup) {
    throw new AuthFnRegionNotFoundError('Region routing information not found', {
      identifier
    });
  }

  const currentAuthority = normalizeAuthority(input.runtime.baseUrl);
  const targetAuthority = normalizeAuthority(lookup.authority);
  const continueLocally = currentAuthority === targetAuthority;

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
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginConfig,
  input: {
    userId: string;
    runtime: AuthFnRuntimeResolution;
    request?: Request;
  }
): Promise<{ regionId?: string }> {
  const user = await findUserById(config, input.userId);
  if (!user?.primaryEmail) {
    return {
      regionId: input.runtime.regionId
    };
  }

  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    identifier: user.primaryEmail,
    request: input.request,
    runtime: input.runtime
  });
  if (!lookup) {
    return {
      regionId: input.runtime.regionId
    };
  }

  const currentAuthority = normalizeAuthority(input.runtime.baseUrl);
  const targetAuthority = normalizeAuthority(lookup.authority);
  if (currentAuthority !== targetAuthority) {
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
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'plugins'>,
  pluginConfig: MultiRegionPluginConfig,
  input: {
    identifier: string;
    runtime: AuthFnRuntimeResolution;
    request?: Request;
  }
): Promise<{ regionId?: string }> {
  const identifier = normalizeIdentifier(input.identifier);
  const lookup = await lookupRegionByIdentifier(config, pluginConfig, {
    identifier,
    request: input.request,
    runtime: input.runtime
  });
  if (!lookup) {
    return {
      regionId: input.runtime.regionId
    };
  }

  const currentAuthority = normalizeAuthority(input.runtime.baseUrl);
  const targetAuthority = normalizeAuthority(lookup.authority);
  if (currentAuthority !== targetAuthority) {
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
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  pluginConfig: MultiRegionPluginConfig,
  input: {
    user: Pick<AuthFnUserRecord, 'id' | 'primaryEmail'>;
    runtime: AuthFnRuntimeResolution;
    request?: Request;
  }
): Promise<AuthFnRegionProfileRecord | null> {
  const currentRegion = deriveCurrentRegion(pluginConfig, input.request, input.runtime);
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

  await pluginConfig.directory?.registerUser?.({
    userId: input.user.id,
    primaryEmail: input.user.primaryEmail,
    regionId: record.regionId,
    authority: record.authority,
    domain: record.domain ?? undefined,
    request: input.request,
    runtime: input.runtime
  });

  return record;
}

export async function findRegionProfileByUserId(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnRegionProfileRecord | null> {
  return config.database.findOne<AuthFnRegionProfileRecord>({
    model: 'region_profiles',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export function resolveRegionForRequest(
  pluginConfig: MultiRegionPluginConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution
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
  pluginConfig: MultiRegionPluginConfig,
  request: Request | undefined,
  runtime: AuthFnRuntimeResolution
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
  pluginConfig: MultiRegionPluginConfig,
  regionId: string
): AuthFnMultiRegionRegionConfig | undefined {
  return (pluginConfig.regions ?? []).find((region) => region.regionId === regionId);
}

function collectRegionHosts(region: AuthFnMultiRegionRegionConfig): string[] {
  const authorityHost = safeHostname(region.authority);
  return [
    ...(region.hosts ?? []),
    ...(authorityHost ? [authorityHost] : []),
    ...(region.domain ? [region.domain] : [])
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

function normalizeIdentifier(identifier: string): string {
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

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
