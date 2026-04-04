import type { AuthFnConfig, AuthFnRuntimeResolution } from '../types.js';
import { resolveMultiRegionRuntimeOverride } from './regions.js';

export async function resolveRuntime(
  config: Pick<AuthFnConfig, 'runtime' | 'plugins'>,
  request: Request
): Promise<AuthFnRuntimeResolution> {
  const baseRuntime = await resolveBaseRuntime(config, request);
  const regionOverride = await resolveMultiRegionRuntimeOverride(config, request, baseRuntime);
  return mergeRuntimeResolutions(baseRuntime, regionOverride);
}

export function mergeRuntimeResolutions(
  baseRuntime: AuthFnRuntimeResolution,
  override?: Partial<AuthFnRuntimeResolution> | null
): AuthFnRuntimeResolution {
  if (!override) {
    return baseRuntime;
  }

  return {
    issuer: override.issuer ?? baseRuntime.issuer,
    baseUrl: override.baseUrl ?? baseRuntime.baseUrl,
    regionId: override.regionId ?? baseRuntime.regionId,
    cookie: mergeCookieConfig(baseRuntime.cookie, override.cookie),
    oauth: mergeOAuthConfig(baseRuntime.oauth, override.oauth)
  };
}

async function resolveBaseRuntime(
  config: Pick<AuthFnConfig, 'runtime'>,
  request: Request
): Promise<AuthFnRuntimeResolution> {
  if (config.runtime) {
    return config.runtime.resolve(request);
  }

  const url = new URL(request.url);
  return {
    issuer: url.origin,
    baseUrl: url.origin
  };
}

function mergeCookieConfig(
  baseCookie: AuthFnRuntimeResolution['cookie'],
  overrideCookie: AuthFnRuntimeResolution['cookie']
): AuthFnRuntimeResolution['cookie'] {
  if (!baseCookie && !overrideCookie) {
    return undefined;
  }

  return {
    ...(baseCookie ?? {}),
    ...(overrideCookie ?? {})
  };
}

function mergeOAuthConfig(
  baseOAuth: AuthFnRuntimeResolution['oauth'],
  overrideOAuth: AuthFnRuntimeResolution['oauth']
): AuthFnRuntimeResolution['oauth'] {
  if (!baseOAuth && !overrideOAuth) {
    return undefined;
  }

  return {
    ...(baseOAuth ?? {}),
    ...Object.fromEntries(
      Object.entries(overrideOAuth ?? {}).map(([providerId, value]) => [
        providerId,
        {
          ...((baseOAuth ?? {})[providerId as keyof NonNullable<typeof baseOAuth>] ?? {}),
          ...(value ?? {})
        }
      ])
    )
  };
}
