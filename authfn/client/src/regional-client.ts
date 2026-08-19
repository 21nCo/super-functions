import { createAuthFnClient } from './client.js';
import type {
  AuthFnCachedRegion,
  AuthFnClient,
  AuthFnEmailAuthFlow,
  AuthFnErrorEnvelope,
  AuthFnRegionStorage,
  AuthFnRegionalClient,
  AuthFnRegionalEmailAuthPreparation,
  AuthFnRegionalClientOptions
} from './types.js';

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STORAGE_KEY = 'authfn:user-region-map';

export function createAuthFnRegionalClient(
  options: AuthFnRegionalClientOptions
): AuthFnRegionalClient {
  const storage = options.storage ?? createLocalStorageRegionStorage();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const clients = new Map<string, AuthFnClient>();
  let currentRegionId = options.defaultRegionId;

  const clientFor = (regionId: string): AuthFnClient => {
    const existing = clients.get(regionId);
    if (existing) {
      return existing;
    }

    const client = createAuthFnClient({
      ...(options.clientOptions ?? {}),
      baseUrl: options.resolveBaseUrl(regionId)
    });
    clients.set(regionId, client);
    return client;
  };

  const resolveRegion = async (input: {
    identifier: string;
    forceRefresh?: boolean;
  }): Promise<AuthFnCachedRegion | null> => {
    const identifier = normalizeIdentifier(input.identifier);
    if (!input.forceRefresh) {
      const cached = await storage.get(identifier);
      if (cached && cached.expiresAt > Date.now()) {
        return cached;
      }
    }

    const lookup = await clientFor(currentRegionId).lookupRegion({ identifier });
    if (!lookup.ok) {
      const mismatch = regionFromMismatch(identifier, lookup, cacheTtlMs);
      if (mismatch) {
        await saveRegion(storage, cacheTtlMs, options, mismatch);
        return mismatch;
      }
      await storage.delete(identifier);
      return null;
    }

    const region = {
      identifier,
      regionId: lookup.data.regionId,
      authority: lookup.data.authority,
      domain: lookup.data.domain,
      cachedAt: Date.now(),
      expiresAt: Date.now() + cacheTtlMs
    };
    await saveRegion(storage, cacheTtlMs, options, region);
    return region;
  };

  const regionIdForIdentifier = async (identifier: string): Promise<string> => {
    const region = await resolveRegion({ identifier });
    return region?.regionId ?? options.defaultRegionId;
  };

  const lookupCurrentRegion = async (identifierInput: string) => {
    const identifier = normalizeIdentifier(identifierInput);
    const lookupRegionId = currentRegionId;
    const lookup = await clientFor(lookupRegionId).lookupRegion({ identifier });
    if (!lookup.ok) {
      const mismatch = regionFromMismatch(identifier, lookup, cacheTtlMs);
      if (mismatch) {
        await saveRegion(storage, cacheTtlMs, options, mismatch, lookupRegionId);
        const retry = await clientFor(mismatch.regionId).lookupRegion({ identifier });
        if (retry.ok) {
          await saveRegion(storage, cacheTtlMs, options, {
            identifier,
            regionId: retry.data.regionId,
            authority: retry.data.authority,
            domain: retry.data.domain,
            cachedAt: Date.now(),
            expiresAt: Date.now() + cacheTtlMs
          }, lookupRegionId);
        }
        return retry;
      } else {
        await storage.delete(identifier);
      }
      return lookup;
    }

    await saveRegion(storage, cacheTtlMs, options, {
      identifier,
      regionId: lookup.data.regionId,
      authority: lookup.data.authority,
      domain: lookup.data.domain,
      cachedAt: Date.now(),
      expiresAt: Date.now() + cacheTtlMs
    }, lookupRegionId);
    return lookup;
  };

  const prepareEmailAuth = async (input: {
    email: string;
    flow: AuthFnEmailAuthFlow;
    preferredRegionId?: string;
  }) => {
    if (input.preferredRegionId) {
      currentRegionId = input.preferredRegionId;
    }

    const selectedRegionId = currentRegionId;
    const identifier = normalizeIdentifier(input.email);
    const lookup = await lookupCurrentRegion(identifier);
    if (!lookup.ok) {
      return lookup;
    }

    const existingAccount = Boolean(lookup.data.userId) || lookup.data.continueLocally === false;
    if (input.flow === 'sign-up' && existingAccount) {
      return accountExistsError(identifier, lookup.data, lookup.requestId);
    }

    if (input.flow !== 'sign-up') {
      currentRegionId = lookup.data.regionId;
    }

    return successEmailPreparation({
      identifier,
      flow: input.flow,
      selectedRegionId,
      regionId: lookup.data.regionId,
      authority: lookup.data.authority,
      domain: lookup.data.domain,
      userId: lookup.data.userId,
      existingAccount,
      continueLocally: lookup.data.continueLocally,
      redirectTo: lookup.data.redirectTo
    }, lookup.requestId);
  };

  const assertCanSignUp = async (email: string): Promise<AuthFnErrorEnvelope | null> => {
    const prepared = await prepareEmailAuth({
      email,
      flow: 'sign-up'
    });
    return prepared.ok ? null : prepared;
  };

  const runWithRegionRetry = async <T extends { ok: true } | AuthFnErrorEnvelope>(
    identifier: string,
    operation: (client: AuthFnClient) => Promise<T>
  ): Promise<T> => {
    let regionId = await regionIdForIdentifier(identifier);
    let response = await operation(clientFor(regionId));
    const nextRegion = regionFromMismatch(normalizeIdentifier(identifier), response, cacheTtlMs);
    if (!nextRegion || response.ok) {
      currentRegionId = regionId;
      return response;
    }

    await saveRegion(storage, cacheTtlMs, options, nextRegion, regionId);
    regionId = nextRegion.regionId;
    currentRegionId = regionId;
    return operation(clientFor(regionId));
  };

  const regionalClient: AuthFnRegionalClient = {
    createTransportAuth: (input) =>
      createAuthFnClient(options.clientOptions ?? {}).createTransportAuth(input),
    getSession: () => clientFor(currentRegionId).getSession(),
    getAccountDetails: () => clientFor(currentRegionId).getAccountDetails(),
    deleteAccount: () => clientFor(currentRegionId).deleteAccount(),
    signUpWithPassword: async (input) => {
      const signUpError = await assertCanSignUp(input.email);
      if (signUpError) {
        return signUpError;
      }
      const response = await clientFor(currentRegionId).signUpWithPassword(input);
      const mismatch = regionFromMismatch(normalizeIdentifier(input.email), response, cacheTtlMs);
      if (mismatch) {
        await saveRegion(storage, cacheTtlMs, options, mismatch, currentRegionId);
      }
      return response;
    },
    signInWithPassword: (input) =>
      runWithRegionRetry(input.email, (client) => client.signInWithPassword(input)),
    signOut: (input) => clientFor(currentRegionId).signOut(input),
    listSessions: () => clientFor(currentRegionId).listSessions(),
    revokeSession: (input) => clientFor(currentRegionId).revokeSession(input),
    sendOtp: async (input) => {
      if (input.purpose === 'sign-up') {
        const signUpError = await assertCanSignUp(input.email);
        if (signUpError) {
          return signUpError;
        }
        return clientFor(currentRegionId).sendOtp(input);
      }
      const regionId = await regionIdForIdentifier(input.email);
      currentRegionId = regionId;
      return clientFor(regionId).sendOtp(input);
    },
    startPasswordReset: (input) =>
      runWithRegionRetry(input.email, (client) => client.startPasswordReset(input)),
    verifyOtp: async (input) => {
      if (input.purpose !== 'sign-up') {
        return runWithRegionRetry(input.email, (client) => client.verifyOtp(input));
      }
      const signUpError = await assertCanSignUp(input.email);
      if (signUpError) {
        return signUpError;
      }
      const response = await clientFor(currentRegionId).verifyOtp(input);
      const mismatch = regionFromMismatch(normalizeIdentifier(input.email), response, cacheTtlMs);
      if (mismatch) {
        await saveRegion(storage, cacheTtlMs, options, mismatch, currentRegionId);
      }
      return response;
    },
    completePasswordReset: async (input) => {
      const regionId = await regionIdForIdentifier(input.email);
      currentRegionId = regionId;
      return clientFor(regionId).completePasswordReset(input);
    },
    startSocialSignIn: (input) => clientFor(currentRegionId).startSocialSignIn(input),
    disconnectSocialAccount: (input) => clientFor(currentRegionId).disconnectSocialAccount(input),
    startNativeHandoff: () => clientFor(currentRegionId).startNativeHandoff(),
    startWebHandoff: (input) => clientFor(currentRegionId).startWebHandoff(input),
    createApiKey: (input) => clientFor(currentRegionId).createApiKey(input),
    listApiKeys: () => clientFor(currentRegionId).listApiKeys(),
    revokeApiKey: (input) => clientFor(currentRegionId).revokeApiKey(input),
    enableTwoFactor: () => clientFor(currentRegionId).enableTwoFactor(),
    confirmTwoFactor: (input) => clientFor(currentRegionId).confirmTwoFactor(input),
    completeTwoFactorChallenge: (input) => clientFor(currentRegionId).completeTwoFactorChallenge(input),
    disableTwoFactor: (input) => clientFor(currentRegionId).disableTwoFactor(input),
    lookupRegion: (input) => lookupCurrentRegion(input.identifier),
    getEnvironment: () => clientFor(currentRegionId).getEnvironment(),
    prepareEmailAuth,
    resolveRegion,
    clearRegion: async (input) => {
      await storage.delete(normalizeIdentifier(input.identifier));
    },
    getCurrentRegionId: () => currentRegionId,
    setCurrentRegionId: (regionId) => {
      currentRegionId = regionId;
    }
  };

  return regionalClient;
}

function createLocalStorageRegionStorage(): AuthFnRegionStorage {
  return {
    async get(identifier) {
      const map = readStorageMap();
      return map[identifier] ?? null;
    },
    async set(identifier, value) {
      const map = readStorageMap();
      map[identifier] = value;
      writeStorageMap(map);
    },
    async delete(identifier) {
      const map = readStorageMap();
      delete map[identifier];
      writeStorageMap(map);
    }
  };
}

function readStorageMap(): Record<string, AuthFnCachedRegion> {
  const localStorageLike = globalThis.localStorage as Storage | undefined;
  if (!localStorageLike) {
    return {};
  }

  try {
    const raw = localStorageLike.getItem(DEFAULT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, AuthFnCachedRegion> : {};
  } catch {
    return {};
  }
}

function writeStorageMap(value: Record<string, AuthFnCachedRegion>): void {
  const localStorageLike = globalThis.localStorage as Storage | undefined;
  if (!localStorageLike) {
    return;
  }

  try {
    localStorageLike.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in private or restricted browser contexts.
  }
}

async function saveRegion(
  storage: AuthFnRegionStorage,
  cacheTtlMs: number,
  options: AuthFnRegionalClientOptions,
  region: AuthFnCachedRegion,
  fromRegionId?: string
): Promise<void> {
  const value = {
    ...region,
    cachedAt: Date.now(),
    expiresAt: Date.now() + cacheTtlMs
  };
  await storage.set(region.identifier, value);
  options.onRegionChanged?.({
    identifier: region.identifier,
    fromRegionId,
    toRegionId: region.regionId,
    authority: region.authority
  });
}

function regionFromMismatch(
  identifier: string,
  response: unknown,
  cacheTtlMs: number
): AuthFnCachedRegion | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const envelope = response as AuthFnErrorEnvelope;
  if (envelope.ok !== false || envelope.error.code !== 'AUTHFN_REGION_MISMATCH') {
    return null;
  }

  const details = envelope.error.details ?? {};
  const regionId = typeof details.regionId === 'string' ? details.regionId : undefined;
  const authority = typeof details.authority === 'string'
    ? details.authority
    : typeof details.redirectTo === 'string'
      ? details.redirectTo
      : undefined;
  if (!regionId || !authority) {
    return null;
  }

  return {
    identifier,
    regionId,
    authority,
    domain: typeof details.domain === 'string' ? details.domain : undefined,
    cachedAt: Date.now(),
    expiresAt: Date.now() + cacheTtlMs
  };
}

function successEmailPreparation(
  data: AuthFnRegionalEmailAuthPreparation,
  requestId = 'authfn-regional-client'
) {
  return {
    ok: true as const,
    data,
    requestId
  };
}

function accountExistsError(
  identifier: string,
  lookup: {
    userId?: string;
    regionId: string;
    authority: string;
    domain?: string;
    continueLocally: boolean;
    redirectTo?: string;
  },
  requestId: string
): AuthFnErrorEnvelope {
  return {
    ok: false,
    error: {
      code: 'AUTHFN_ACCOUNT_ALREADY_EXISTS',
      message: 'Account already exists. Please sign in instead.',
      retryable: false,
      details: {
        identifier,
        userId: lookup.userId,
        regionId: lookup.regionId,
        authority: lookup.authority,
        domain: lookup.domain,
        redirectTo: lookup.redirectTo ?? lookup.authority,
        continueLocally: lookup.continueLocally
      }
    },
    requestId
  };
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}
