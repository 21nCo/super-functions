import type { AtomicKVStoreAdapter, KVStoreAdapter } from '@superfunctions/db';
import type { Middleware } from '@superfunctions/http';
import { AuthFnRateLimitedError } from './errors.js';
import type {
  AuthFnRateLimitCategory,
  AuthFnRateLimitConfig,
  AuthFnRateLimitMode,
  AuthFnRuntimeConfig
} from '../types.js';

interface RateLimitCheck {
  key: string;
  limit: number;
  windowSeconds: number;
  dimension: string;
  scope: AuthFnRateLimitScope;
}

type AuthFnRateLimitScope = keyof NonNullable<AuthFnRateLimitConfig['policies']>;

const defaultPolicies: Record<AuthFnRateLimitScope, AuthFnRateLimitCategory> = {
  password: { ipLimit: 30, identifierLimit: 10, windowSeconds: 60 },
  'otp-send': { ipLimit: 20, identifierLimit: 5, windowSeconds: 300 },
  'otp-verify': { ipLimit: 30, identifierLimit: 10, windowSeconds: 300 },
  'password-reset': { ipLimit: 20, identifierLimit: 5, windowSeconds: 300 },
  'social-start': { ipLimit: 60, windowSeconds: 60 },
  handoff: { ipLimit: 30, windowSeconds: 60 },
  'region-lookup': { ipLimit: 120, identifierLimit: 60, windowSeconds: 60 },
  account: { ipLimit: 120, windowSeconds: 60 },
};

export function createAuthFnRateLimitMiddleware(config: AuthFnRuntimeConfig): Middleware | undefined {
  const rateLimit = config.rateLimit;
  if (!rateLimit?.enabled) {
    return undefined;
  }
  const mode = resolveMode(rateLimit.mode, config);
  if (mode === 'strict' && !config.stores?.atomicKv) {
    throw new Error('AUTHFN_ATOMIC_STORE_REQUIRED: rateLimit strict mode requires stores.atomicKv');
  }

  return async (request, _context, next) => {
    const path = new URL(request.url).pathname;
    const scope = scopeForPath(path);
    const policy = policyForScope(config, scope);
    const identifier = await readIdentifier(request.clone());
    const ip = (await rateLimit.resolveClientIp?.(request))?.trim() || 'unknown';
    const checks = await buildChecks(scope, policy, ip, identifier);

    for (const check of checks) {
      const count = await incrementCheck(config, mode, check);
      if (count > check.limit) {
        throw new AuthFnRateLimitedError(undefined, {
          path,
          scope,
          dimension: check.dimension,
          resetAt: new Date(Date.now() + check.windowSeconds * 1000).toISOString()
        });
      }
    }

    return next();
  };
}

function resolveMode(
  mode: AuthFnRateLimitMode | undefined,
  config: AuthFnRuntimeConfig
): AuthFnRateLimitMode {
  return mode ?? (config.stores?.atomicKv ? 'strict' : config.stores?.kv ? 'best-effort' : 'local');
}

function policyForScope(
  config: AuthFnRuntimeConfig,
  scope: AuthFnRateLimitScope
): AuthFnRateLimitCategory {
  const policies = {
    ...defaultPolicies,
    ...config.rateLimit?.policies
  };
  return policies[scope] ?? defaultPolicies.account;
}

function scopeForPath(path: string): AuthFnRateLimitScope {
  if (path.endsWith('/sign-in/password') || path.endsWith('/sign-up/password')) return 'password';
  if (path.endsWith('/otp/send')) return 'otp-send';
  if (path.endsWith('/otp/verify')) return 'otp-verify';
  if (
    path.endsWith('/password/reset/start')
    || path.endsWith('/password/reset/complete')
  ) return 'password-reset';
  if (path.endsWith('/social/start')) return 'social-start';
  if (path.includes('/handoff/')) return 'handoff';
  if (path.endsWith('/regions/lookup')) return 'region-lookup';
  return 'account';
}

async function buildChecks(
  scope: AuthFnRateLimitScope,
  policy: AuthFnRateLimitCategory,
  ip: string,
  identifier: string | null
): Promise<RateLimitCheck[]> {
  const checks: RateLimitCheck[] = [
    {
      key: `ip:${hashKeyPart(ip)}`,
      limit: policy.ipLimit,
      windowSeconds: policy.windowSeconds,
      dimension: 'ip',
      scope
    }
  ];

  if (identifier && policy.identifierLimit) {
    checks.push({
      key: `identifier:${await hashIdentifier(identifier)}`,
      limit: policy.identifierLimit,
      windowSeconds: policy.windowSeconds,
      dimension: 'identifier',
      scope
    });
  }

  return checks;
}

async function incrementCheck(
  config: AuthFnRuntimeConfig,
  mode: AuthFnRateLimitMode,
  check: RateLimitCheck
): Promise<number> {
  const windowId = Math.floor(Date.now() / (check.windowSeconds * 1000));
  const key = `authfn:${config.namespace ?? 'authfn'}:ratelimit:${check.scope}:${check.key}:${windowId}`;
  if (mode === 'strict') {
    return incrementAtomic(config.stores!.atomicKv!, key, check.windowSeconds);
  }
  if (mode === 'best-effort' && config.stores?.kv) {
    return incrementCache(config.stores.kv, key, check.windowSeconds);
  }
  return incrementLocal(key, check.windowSeconds);
}

async function incrementAtomic(
  store: AtomicKVStoreAdapter,
  key: string,
  windowSeconds: number
): Promise<number> {
  return (await store.incr({ key, by: 1, ttlSeconds: windowSeconds })).value;
}

const localWindows = new Map<string, { count: number; expiresAt: number }>();
const MAX_LOCAL_RATE_LIMIT_WINDOWS = 10_000;
const LOCAL_SWEEP_INTERVAL = 128;
let localIncrementCount = 0;

async function incrementCache(
  store: KVStoreAdapter,
  key: string,
  windowSeconds: number
): Promise<number> {
  const current = Number(await store.get(key) ?? '0');
  const next = current + 1;
  await store.set({
    key,
    value: String(next),
    ttlSeconds: windowSeconds
  });
  return next;
}

function incrementLocal(key: string, windowSeconds: number): number {
  const now = Date.now();
  localIncrementCount += 1;
  if (localIncrementCount % LOCAL_SWEEP_INTERVAL === 0) {
    sweepExpiredLocalWindows(now);
  }
  const existing = localWindows.get(key);
  if (!existing || existing.expiresAt <= now) {
    if (!existing && localWindows.size >= MAX_LOCAL_RATE_LIMIT_WINDOWS) {
      sweepExpiredLocalWindows(now);
      while (localWindows.size >= MAX_LOCAL_RATE_LIMIT_WINDOWS) {
        const oldestKey = localWindows.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        localWindows.delete(oldestKey);
      }
    }
    localWindows.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function sweepExpiredLocalWindows(now: number): void {
  for (const [key, window] of localWindows) {
    if (window.expiresAt <= now) {
      localWindows.delete(key);
    }
  }
}

function hashKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 128);
}

async function hashIdentifier(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identifier));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readIdentifier(request: Request): Promise<string | null> {
  if (request.method !== 'POST') {
    return null;
  }

  try {
    const body = await request.json() as { email?: unknown; identifier?: unknown };
    const value = typeof body.email === 'string'
      ? body.email
      : typeof body.identifier === 'string'
        ? body.identifier
        : undefined;
    return value?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}
