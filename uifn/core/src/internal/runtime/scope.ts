import { createUIFnError } from '../../errors';
import { createRuntimeScheduler } from './scheduler';
import type { RuntimeScope, RuntimeScopeOptions } from './types';

const INVALID_ID_CHARACTERS = /[^a-zA-Z0-9_-]+/g;
const REPEATED_DASHES = /-+/g;

function normalizeIdPart(value: string): string {
  return value
    .trim()
    .replace(INVALID_ID_CHARACTERS, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(/^-|-$/g, '') || 'scope';
}

export function createRuntimeScope(options: RuntimeScopeOptions): RuntimeScope {
  const scopeId = normalizeIdPart(options.id);
  const hydrationSeed = normalizeIdPart(options.hydrationSeed ?? '0');
  const scheduler = options.scheduler ?? createRuntimeScheduler();
  const claimedIds = new Set<string>();
  const counters = new Map<string, number>();
  const capabilities = options.capabilities ?? {};

  const scope: RuntimeScope = {
    id: scopeId,
    hydrationSeed,
    mode: options.mode ?? 'production',
    scheduler,
    traceLimit: Math.max(0, Math.min(options.traceLimit ?? 200, 10_000)),
    traceSink: options.traceSink,
    instrumentation: options.instrumentation,
    maxEventSteps: Math.max(1, Math.min(options.maxEventSteps ?? 100, 10_000)),
    nextId(token) {
      const normalizedToken = normalizeIdPart(token);
      const next = (counters.get(normalizedToken) ?? 0) + 1;
      counters.set(normalizedToken, next);
      return scope.claimId(`${scopeId}-${hydrationSeed}-${normalizedToken}-${next}`);
    },
    claimId(id) {
      const normalized = normalizeIdPart(id);
      if (claimedIds.has(normalized)) {
        throw createUIFnError({
          code: 'UIFN_SCOPE_ID_COLLISION',
          package: '@uifn/core',
          component: 'RuntimeScope',
          message: 'Runtime scope attempted to claim a duplicate deterministic id.',
          details: { scopeId, id: normalized },
        });
      }
      claimedIds.add(normalized);
      return normalized;
    },
    getCapability<T>(name: string) {
      return capabilities[name] as T | undefined;
    },
    requireCapability<T>(name: string) {
      const capability = scope.getCapability<T>(name);
      if (capability === undefined || capability === null) {
        throw createUIFnError({
          code: 'UIFN_ENV_CAPABILITY_MISSING',
          package: '@uifn/core',
          component: 'RuntimeScope',
          message: 'A required injected runtime capability is unavailable.',
          details: { scopeId, capability: name },
        });
      }
      return capability;
    },
    child(key) {
      return createRuntimeScope({
        ...options,
        id: `${scopeId}-${normalizeIdPart(key)}`,
        hydrationSeed,
        scheduler,
        capabilities,
      });
    },
  };

  return Object.freeze(scope);
}
