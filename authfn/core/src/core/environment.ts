import type { AuthFnRuntimeConfig, AuthFnEnvironment } from '../types.js';

export async function resolveEnvironment(
  config: Pick<AuthFnRuntimeConfig, 'environment'>,
  request: Request
): Promise<AuthFnEnvironment> {
  return resolveBaseEnvironment(config, request);
}

export function mergeEnvironments(
  baseEnvironment: AuthFnEnvironment,
  override?: Partial<AuthFnEnvironment> | null
): AuthFnEnvironment {
  if (!override) {
    return baseEnvironment;
  }

  return {
    issuer: override.issuer ?? baseEnvironment.issuer,
    baseUrl: override.baseUrl ?? baseEnvironment.baseUrl,
    regionId: override.regionId ?? baseEnvironment.regionId,
    cookie: mergeCookieConfig(baseEnvironment.cookie, override.cookie),
    oauth: mergeOAuthConfig(baseEnvironment.oauth, override.oauth)
  };
}

async function resolveBaseEnvironment(
  config: Pick<AuthFnRuntimeConfig, 'environment'>,
  request: Request
): Promise<AuthFnEnvironment> {
  if (config.environment) {
    return config.environment.resolve(request);
  }

  const url = new URL(request.url);
  return {
    issuer: url.origin,
    baseUrl: url.origin
  };
}

function mergeCookieConfig(
  baseCookie: AuthFnEnvironment['cookie'],
  overrideCookie: AuthFnEnvironment['cookie']
): AuthFnEnvironment['cookie'] {
  if (!baseCookie && !overrideCookie) {
    return undefined;
  }

  return {
    ...(baseCookie ?? {}),
    ...(overrideCookie ?? {})
  };
}

function mergeOAuthConfig(
  baseOAuth: AuthFnEnvironment['oauth'],
  overrideOAuth: AuthFnEnvironment['oauth']
): AuthFnEnvironment['oauth'] {
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
