import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ConditionalKVStoreAdapter } from '@superfunctions/db';
import type { Middleware } from '@superfunctions/http';
import type {
  AuthFnIdentityPlacement,
  AuthFnIdentityPlacementDirectoryAdapter,
  AuthFnIdentityPlacementState,
  AuthFnRoutingKeyring,
  AuthFnRoutingReplayStore,
  MultiRegionPluginRuntimeConfig
} from '../plugin-types.js';
import type { AuthFnEventInput, AuthFnRuntimeConfig } from '../types.js';
import {
  AuthFnConfigError,
  AuthFnPlacementDirectoryUnavailableError,
  AuthFnPlacementMovingError,
  AuthFnRegionMismatchError,
  AuthFnRegionNotFoundError,
  AuthFnRoutingAssertionInvalidError,
  AuthFnRoutingCellUnavailableError,
  AuthFnValidationError
} from './errors.js';
import { jsonError, resolveRequestId } from '../http/envelopes.js';
import { emitAuthEvent, eventRequestId } from './observability.js';

const ASSERTION_HEADER = 'x-authfn-routing-assertion';
const MISMATCH_HEADER = 'x-authfn-routing-mismatch';
const INTERNAL_HEADER_PREFIX = 'x-authfn-routing-';
const PLACEMENT_KEY_PREFIX = 'authfn:placement:';
const verifiedRoutingIdentityKeys = new WeakMap<Request, string>();

export type AuthFnRouteScope = 'global' | 'identity';

export interface AuthFnRouteClassification {
  scope: AuthFnRouteScope;
  family:
    | 'discovery'
    | 'region-lookup'
    | 'otp'
    | 'session'
    | 'api-key'
    | 'oauth'
    | 'handoff'
    | 'account'
    | 'auth';
}

export interface AuthFnGatewayIdentity {
  /** Stable, non-secret key such as a normalized email hash or user ID. */
  identityKey: string;
  preferredRegionId?: string;
  /** True only for a route explicitly allowed to create first-use placement. */
  allowInitialPlacement?: boolean;
}

export interface AuthFnGatewayCell<TTarget> {
  regionId: string;
  audience: string;
  /** Adapter-owned destination; never serialized into placement or public responses. */
  target: TTarget;
}

export interface AuthFnCanonicalGatewayOptions<TTarget> {
  publicAuthority: string;
  /** Public AuthFn route prefix. Defaults to `/auth`. */
  basePath?: string;
  placementDirectory: AuthFnIdentityPlacementDirectoryAdapter;
  keyring: AuthFnRoutingKeyring;
  resolveIdentity(
    request: Request,
    classification: AuthFnRouteClassification
  ): Promise<AuthFnGatewayIdentity | null> | AuthFnGatewayIdentity | null;
  selectInitialRegion(input: {
    identity: AuthFnGatewayIdentity;
    request: Request;
  }): Promise<string> | string;
  resolveCell(regionId: string): Promise<AuthFnGatewayCell<TTarget> | null> | AuthFnGatewayCell<TTarget> | null;
  dispatch(target: TTarget, request: Request): Promise<Response>;
  /** Global discovery/lookup routes terminate at the gateway and never reveal placement. */
  handleGlobal?: (
    request: Request,
    classification: AuthFnRouteClassification
  ) => Promise<Response> | Response;
  assertionTtlSeconds?: number;
  placementCacheTtlMs?: number;
  /** Maximum identities retained by the in-process placement cache. */
  placementCacheMaxEntries?: number;
  /** Allowed clock difference when verifying signed cell mismatch responses. */
  clockSkewSeconds?: number;
  now?: () => Date;
  onEvent?: (event: AuthFnEventInput) => Promise<void> | void;
}

export interface AuthFnCanonicalGateway {
  handle(request: Request): Promise<Response>;
  invalidate(identityKey: string): void;
}

interface RoutingAssertion {
  kind: 'request';
  keyId: string;
  identityKey: string;
  regionId: string;
  epoch: number;
  requestId: string;
  method: string;
  path: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  bodySha256: string;
}

interface RoutingMismatchAssertion {
  kind: 'mismatch';
  keyId: string;
  identityKey: string;
  requestId: string;
  receivedRegionId: string;
  receivedEpoch: number;
  expectedRegionId: string;
  expectedEpoch: number;
  executionStarted: false;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

type SignedRoutingPayload = RoutingAssertion | RoutingMismatchAssertion;

interface CachedPlacement {
  placement: AuthFnIdentityPlacement;
  expiresAt: number;
}

export function createInMemoryAuthFnPlacementDirectory(
  initial: AuthFnIdentityPlacement[] = []
): AuthFnIdentityPlacementDirectoryAdapter {
  for (const record of initial) validatePlacement(record);
  const records = new Map(initial.map((record) => [record.identityKey, clonePlacement(record)]));
  return {
    async get(identityKey) {
      const record = records.get(identityKey);
      return record ? clonePlacement(record) : null;
    },
    async putIfAbsent(placement) {
      validatePlacement(placement);
      const existing = records.get(placement.identityKey);
      if (existing) return { inserted: false, existing: clonePlacement(existing) };
      records.set(placement.identityKey, clonePlacement(placement));
      return { inserted: true };
    },
    async compareAndSet(input) {
      validatePlacement(input.placement);
      if (input.placement.identityKey !== input.identityKey) {
        throw new AuthFnValidationError('Placement identity key must match the compare-and-set key');
      }
      const existing = records.get(input.identityKey);
      if (
        !existing
        || existing.epoch !== input.expectedEpoch
        || existing.state !== input.expectedState
      ) {
        return { updated: false, existing: existing ? clonePlacement(existing) : undefined };
      }
      records.set(input.identityKey, clonePlacement(input.placement));
      return { updated: true };
    }
  };
}

/**
 * Composes placement semantics over any atomic KV adapter, including the
 * repository DynamoDB and Cloudflare Durable Object lookup-store adapters.
 */
export function createStoreBackedAuthFnPlacementDirectory(
  store: ConditionalKVStoreAdapter
): AuthFnIdentityPlacementDirectoryAdapter {
  if (!store.compareAndSet) {
    throw new AuthFnConfigError('AuthFn placement requires compareAndSet support');
  }
  return {
    async get(identityKey) {
      return parsePlacement(await store.get(placementKey(identityKey)));
    },
    async putIfAbsent(placement) {
      validatePlacement(placement);
      const result = await store.setIfAbsent({
        key: placementKey(placement.identityKey),
        value: serializePlacement(placement)
      });
      return {
        inserted: result.inserted,
        existing: parsePlacement(result.existing) ?? undefined
      };
    },
    async compareAndSet(input) {
      validatePlacement(input.placement);
      if (input.placement.identityKey !== input.identityKey) {
        throw new AuthFnValidationError('Placement identity key must match the compare-and-set key');
      }
      const key = placementKey(input.identityKey);
      const existingRaw = await store.get(key);
      const existing = parsePlacement(existingRaw);
      if (
        !existingRaw
        || !existing
        || existing.epoch !== input.expectedEpoch
        || existing.state !== input.expectedState
      ) {
        return { updated: false, existing: existing ?? undefined };
      }
      const result = await store.compareAndSet!({
        key,
        expected: existingRaw,
        value: serializePlacement(input.placement)
      });
      return {
        updated: result.updated,
        existing: parsePlacement(result.existing) ?? undefined
      };
    }
  };
}

export function createInMemoryAuthFnRoutingReplayStore(
  now: () => Date = () => new Date()
): AuthFnRoutingReplayStore {
  const claims = new Map<string, number>();
  return {
    async claim(nonce, expiresAt) {
      const current = Math.floor(now().getTime() / 1000);
      for (const [key, expiry] of claims) {
        if (expiry < current) claims.delete(key);
      }
      if (claims.has(nonce)) return false;
      claims.set(nonce, expiresAt);
      return true;
    }
  };
}

export function classifyAuthFnRoute(request: Request, basePath = '/auth'): AuthFnRouteClassification {
  const path = stripBasePath(new URL(request.url).pathname, basePath);
  if (
    request.method === 'GET'
    && (
      path === '/environment'
      || path === '/discovery'
      || path === '/.well-known'
      || path.startsWith('/.well-known/')
    )
  ) {
    return { scope: 'global', family: 'discovery' };
  }
  if (request.method === 'POST' && path === '/regions/lookup') {
    return { scope: 'global', family: 'region-lookup' };
  }
  if (path.startsWith('/otp/') || path.includes('password/reset')) return { scope: 'identity', family: 'otp' };
  if (path.startsWith('/sessions') || path === '/session' || path === '/sign-out') {
    return { scope: 'identity', family: 'session' };
  }
  if (path.startsWith('/api-keys')) return { scope: 'identity', family: 'api-key' };
  if (path.startsWith('/oauth') || path.startsWith('/social')) return { scope: 'identity', family: 'oauth' };
  if (path.startsWith('/handoff')) return { scope: 'identity', family: 'handoff' };
  if (path.startsWith('/account')) return { scope: 'identity', family: 'account' };
  return { scope: 'identity', family: 'auth' };
}

export function createAuthFnCanonicalGateway<TTarget>(
  options: AuthFnCanonicalGatewayOptions<TTarget>
): AuthFnCanonicalGateway {
  validateKeyring(options.keyring);
  const publicAuthority = normalizeAuthority(options.publicAuthority);
  const basePath = normalizeBasePath(options.basePath ?? '/auth');
  const now = options.now ?? (() => new Date());
  const assertionTtlSeconds = options.assertionTtlSeconds ?? 20;
  const placementCacheTtlMs = options.placementCacheTtlMs ?? 5_000;
  const placementCacheMaxEntries = options.placementCacheMaxEntries ?? 10_000;
  const clockSkewSeconds = options.clockSkewSeconds ?? 5;
  if (!Number.isSafeInteger(assertionTtlSeconds) || assertionTtlSeconds < 1 || assertionTtlSeconds > 300) {
    throw new AuthFnConfigError('AuthFn assertionTtlSeconds must be between 1 and 300');
  }
  if (!Number.isFinite(placementCacheTtlMs) || placementCacheTtlMs < 0) {
    throw new AuthFnConfigError('AuthFn placementCacheTtlMs must be non-negative');
  }
  if (!Number.isSafeInteger(placementCacheMaxEntries) || placementCacheMaxEntries < 1) {
    throw new AuthFnConfigError('AuthFn placementCacheMaxEntries must be a positive integer');
  }
  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 60) {
    throw new AuthFnConfigError('AuthFn clockSkewSeconds must be between 0 and 60');
  }
  const cache = new Map<string, CachedPlacement>();

  function cachePlacement(identityKey: string, placement: AuthFnIdentityPlacement): void {
    const currentTime = now().getTime();
    cache.delete(identityKey);
    while (cache.size >= placementCacheMaxEntries) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
    cache.set(identityKey, {
      placement: clonePlacement(placement),
      expiresAt: currentTime + placementCacheTtlMs
    });
  }

  async function loadPlacement(identityKey: string, bypassCache: boolean): Promise<AuthFnIdentityPlacement | null> {
    const cached = cache.get(identityKey);
    if (!bypassCache && cached && cached.expiresAt > now().getTime()) return cached.placement;
    let placement: AuthFnIdentityPlacement | null;
    try {
      placement = await options.placementDirectory.get(identityKey);
    } catch {
      throw new AuthFnPlacementDirectoryUnavailableError();
    }
    if (placement) cachePlacement(identityKey, placement);
    else cache.delete(identityKey);
    return placement;
  }

  async function resolveOrClaimPlacement(
    identity: AuthFnGatewayIdentity,
    request: Request,
    bypassCache: boolean
  ): Promise<AuthFnIdentityPlacement> {
    const existing = await loadPlacement(identity.identityKey, bypassCache);
    if (existing) return requireActivePlacement(existing);
    if (!identity.allowInitialPlacement) {
      throw new AuthFnRegionNotFoundError('Identity placement is not active');
    }
    let regionId: string;
    try {
      regionId = await options.selectInitialRegion({ identity, request });
    } catch {
      throw new AuthFnRoutingCellUnavailableError('Initial region selection failed');
    }
    if (!regionId) throw new AuthFnRoutingCellUnavailableError('Initial region selection returned no cell');
    const claimed: AuthFnIdentityPlacement = {
      identityKey: identity.identityKey,
      regionId,
      epoch: 1,
      state: 'active',
      updatedAt: now().toISOString()
    };
    let result: Awaited<ReturnType<AuthFnIdentityPlacementDirectoryAdapter['putIfAbsent']>>;
    try {
      result = await options.placementDirectory.putIfAbsent(claimed);
    } catch {
      throw new AuthFnPlacementDirectoryUnavailableError();
    }
    const placement = result.inserted ? claimed : result.existing;
    if (!placement) throw new AuthFnPlacementDirectoryUnavailableError('Placement claim returned no record');
    cachePlacement(identity.identityKey, placement);
    await emit(options, request, result.inserted ? 'authfn.routing.placement_claimed' : 'authfn.routing.placement_lookup', {
      outcome: result.inserted ? 'success' : 'validated',
      regionId: placement.regionId,
      epoch: placement.epoch
    });
    return requireActivePlacement(placement);
  }

  async function forward(
    request: Request,
    identity: AuthFnGatewayIdentity,
    placement: AuthFnIdentityPlacement,
    attempt: 0 | 1
  ): Promise<Response> {
    let cell: AuthFnGatewayCell<TTarget> | null;
    try {
      cell = await options.resolveCell(placement.regionId);
    } catch {
      cell = null;
    }
    if (!cell || cell.regionId !== placement.regionId) {
      await emit(options, request, 'authfn.routing.cell_unavailable', {
        outcome: 'rejected',
        regionId: placement.regionId,
        epoch: placement.epoch
      });
      return jsonError(request, new AuthFnRoutingCellUnavailableError());
    }
    const issuedAt = Math.floor(now().getTime() / 1000);
    const requestId = resolveRequestId(request);
    const requestUrl = new URL(request.url);
    const assertion: RoutingAssertion = {
      kind: 'request',
      keyId: options.keyring.active.keyId,
      identityKey: identity.identityKey,
      regionId: placement.regionId,
      epoch: placement.epoch,
      requestId,
      method: request.method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      audience: cell.audience,
      issuedAt,
      expiresAt: issuedAt + assertionTtlSeconds,
      nonce: randomBytes(16).toString('base64url'),
      bodySha256: await requestBodyDigest(request)
    };
    const routedRequest = withRoutingAssertion(
      request,
      signPayload(assertion, options.keyring),
      requestId
    );
    let response: Response;
    try {
      response = await options.dispatch(cell.target, routedRequest);
    } catch {
      await emit(options, request, 'authfn.routing.cell_unavailable', {
        outcome: 'unknown',
        regionId: placement.regionId,
        epoch: placement.epoch
      });
      return jsonError(request, new AuthFnRoutingCellUnavailableError());
    }
    await emit(options, request, 'authfn.routing.forwarded', {
      outcome: 'success',
      regionId: placement.regionId,
      epoch: placement.epoch,
      family: classifyAuthFnRoute(request, basePath).family,
      attempt
    });

    const mismatchToken = response.headers.get(MISMATCH_HEADER);
    if (attempt === 0 && mismatchToken) {
      let mismatch: RoutingMismatchAssertion | null = null;
      try {
        const verified = verifyPayload(mismatchToken, options.keyring, now, clockSkewSeconds);
        mismatch = verified.kind === 'mismatch' ? verified : null;
      } catch {
        mismatch = null;
      }
      if (
        mismatch
        && mismatch.executionStarted === false
        && mismatch.identityKey === identity.identityKey
        && mismatch.requestId === requestId
        && mismatch.receivedRegionId === placement.regionId
        && mismatch.receivedEpoch === placement.epoch
      ) {
        await emit(options, request, 'authfn.routing.mismatch', {
          outcome: 'pre-execution',
          receivedRegionId: mismatch.receivedRegionId,
          receivedEpoch: mismatch.receivedEpoch,
          expectedRegionId: mismatch.expectedRegionId,
          expectedEpoch: mismatch.expectedEpoch,
          executionStarted: false
        });
        cache.delete(identity.identityKey);
        const refreshed = await resolveOrClaimPlacement(identity, request, true);
        await emit(options, request, 'authfn.routing.retry', {
          outcome: 'started',
          regionId: refreshed.regionId,
          epoch: refreshed.epoch,
          attempt: 1
        });
        return forward(request, identity, refreshed, 1);
      }
    }
    return stripInternalResponseHeaders(response);
  }

  return {
    async handle(request) {
      if (new URL(request.url).origin !== publicAuthority) {
        return jsonError(request, new AuthFnValidationError('AuthFn gateway accepts only its public authority'));
      }
      const classification = classifyAuthFnRoute(request, basePath);
      try {
        const sanitizedRequest = stripClientRoutingHeaders(request);
        if (classification.scope === 'global') {
          if (!options.handleGlobal) {
            return jsonError(request, new AuthFnRegionNotFoundError('Global AuthFn route is not configured'));
          }
          const response = await options.handleGlobal(sanitizedRequest, classification);
          return stripInternalResponseHeaders(response);
        }
        const identity = await options.resolveIdentity(sanitizedRequest.clone(), classification);
        if (!identity?.identityKey?.trim()) {
          return jsonError(request, new AuthFnValidationError('A trusted identity routing key is required'));
        }
        const normalizedIdentity = { ...identity, identityKey: identity.identityKey.trim() };
        const placement = await resolveOrClaimPlacement(
          normalizedIdentity,
          sanitizedRequest,
          false
        );
        return forward(sanitizedRequest, normalizedIdentity, placement, 0);
      } catch (error) {
        const code = readErrorCode(error);
        const eventType = code === 'AUTHFN_PLACEMENT_DIRECTORY_UNAVAILABLE'
          ? 'authfn.routing.directory_unavailable'
          : code === 'AUTHFN_ROUTING_CELL_UNAVAILABLE'
            ? 'authfn.routing.cell_unavailable'
            : code === 'AUTHFN_PLACEMENT_MOVING' || code === 'AUTHFN_REGION_NOT_FOUND'
              ? 'authfn.routing.placement_lookup'
              : null;
        if (eventType) {
          await emit(options, request, eventType, {
            errorType: code,
            outcome: 'rejected'
          });
        }
        return jsonError(request, error);
      }
    },
    invalidate(identityKey) {
      cache.delete(identityKey);
    }
  };
}

/** Runs before rate limiting and every AuthFn route handler in a regional cell. */
export function createAuthFnCellPlacementMiddleware(
  config: Pick<AuthFnRuntimeConfig, 'basePath' | 'observability'>,
  pluginConfig: MultiRegionPluginRuntimeConfig
): Middleware | null {
  const routing = pluginConfig.routing;
  if (routing?.mode !== 'gateway') return null;
  const directory = routing.placementDirectory;
  if (!directory) {
    throw new AuthFnConfigError('Gateway-mode AuthFn requires placementDirectory configuration');
  }
  const cell = routing.cell;
  if (!cell) {
    return async (request, _context, next) => classifyAuthFnRoute(request, config.basePath).scope === 'global'
      ? next()
      : jsonError(request, new AuthFnRoutingCellUnavailableError());
  }
  validateKeyring(cell.keyring);
  if (!cell.regionId.trim() || !cell.audience.trim()) {
    throw new AuthFnConfigError('Gateway-mode AuthFn cells require regionId and audience');
  }
  const skew = cell.clockSkewSeconds ?? 5;
  if (!Number.isSafeInteger(skew) || skew < 0 || skew > 60) {
    throw new AuthFnConfigError('AuthFn cell clockSkewSeconds must be between 0 and 60');
  }
  return async (request, _context, next) => {
    if (classifyAuthFnRoute(request, config.basePath).scope === 'global') return next();
    try {
      const token = request.headers.get(ASSERTION_HEADER);
      if (!token) throw new AuthFnRoutingAssertionInvalidError('Gateway routing assertion is required');
      const assertion = verifyPayload(token, cell.keyring, () => new Date(), skew);
      if (assertion.kind !== 'request') throw new AuthFnRoutingAssertionInvalidError();
      await validateRequestAssertion(assertion, request, cell.audience);
      if (!await cell.replayStore.claim(assertion.nonce, assertion.expiresAt + skew)) {
        throw new AuthFnRoutingAssertionInvalidError('Gateway routing assertion was replayed');
      }
      let placement: AuthFnIdentityPlacement | null;
      try {
        placement = await directory.get(assertion.identityKey);
      } catch {
        throw new AuthFnPlacementDirectoryUnavailableError();
      }
      if (!placement || placement.state === 'tombstoned') {
        throw new AuthFnRegionNotFoundError('Identity placement is not active');
      }
      if (placement.state === 'moving' || placement.state === 'deleting') {
        throw new AuthFnPlacementMovingError(undefined, { executionStarted: false });
      }
      if (
        placement.regionId !== cell.regionId
        || assertion.regionId !== cell.regionId
        || assertion.epoch !== placement.epoch
      ) {
        const mismatch = createMismatchAssertion(assertion, placement, cell.keyring, () => new Date());
        const response = jsonError(request, new AuthFnRegionMismatchError(
          'Gateway routing placement is stale',
          { executionStarted: false }
        ));
        const headers = new Headers(response.headers);
        headers.set(MISMATCH_HEADER, signPayload(mismatch, cell.keyring));
        await emitAuthEvent(config, {
          type: 'authfn.routing.mismatch',
          requestId: eventRequestId(request),
          regionId: cell.regionId,
          outcome: 'pre-execution',
          metadata: {
            receivedEpoch: assertion.epoch,
            expectedEpoch: placement.epoch,
            executionStarted: false
          }
        });
        return new Response(response.body, { status: response.status, headers });
      }
      await emitAuthEvent(config, {
        type: 'authfn.routing.placement_lookup',
        requestId: eventRequestId(request),
        regionId: cell.regionId,
        outcome: 'validated',
        metadata: { epoch: placement.epoch }
      });
      verifiedRoutingIdentityKeys.set(request, assertion.identityKey);
      return next().finally(() => verifiedRoutingIdentityKeys.delete(request));
    } catch (error) {
      verifiedRoutingIdentityKeys.delete(request);
      const code = readErrorCode(error);
      await emitAuthEvent(config, {
        type: code === 'AUTHFN_ROUTING_ASSERTION_INVALID'
          ? 'authfn.routing.assertion_rejected'
          : code === 'AUTHFN_PLACEMENT_DIRECTORY_UNAVAILABLE'
            ? 'authfn.routing.directory_unavailable'
            : 'authfn.routing.placement_lookup',
        requestId: eventRequestId(request),
        regionId: cell.regionId,
        outcome: 'rejected',
        metadata: { errorType: code }
      });
      return jsonError(request, error);
    }
  };
}

/** Returns the identity key cryptographically bound to this routed request. */
export function authFnVerifiedRoutingIdentityKey(request?: Request): string | null {
  return request ? verifiedRoutingIdentityKeys.get(request) ?? null : null;
}

export interface AuthFnIdentityMoveCallbacks {
  quiesceSource(): Promise<void>;
  drainSource(): Promise<void>;
  copyToTarget(): Promise<void>;
  validateTarget(): Promise<void>;
  warmTarget(): Promise<void>;
  resumeTarget(): Promise<void>;
  resumeSource?(): Promise<void>;
}

/** Fences an identity with increasing epochs while migration side effects run. */
export async function moveAuthFnIdentityPlacement(
  directory: AuthFnIdentityPlacementDirectoryAdapter,
  input: {
    identityKey: string;
    sourceRegionId: string;
    targetRegionId: string;
    callbacks: AuthFnIdentityMoveCallbacks;
    now?: () => Date;
  }
): Promise<AuthFnIdentityPlacement> {
  const now = input.now ?? (() => new Date());
  const current = await directory.get(input.identityKey);
  if (!current || current.state !== 'active' || current.regionId !== input.sourceRegionId) {
    throw new AuthFnRegionMismatchError('Identity is not active in the migration source');
  }
  const moving: AuthFnIdentityPlacement = {
    ...current,
    epoch: current.epoch + 1,
    state: 'moving',
    movingToRegionId: input.targetRegionId,
    previousRegionId: input.sourceRegionId,
    updatedAt: now().toISOString()
  };
  const fenced = await directory.compareAndSet({
    identityKey: input.identityKey,
    expectedEpoch: current.epoch,
    expectedState: 'active',
    placement: moving
  });
  if (!fenced.updated) throw new AuthFnRegionMismatchError('Identity placement changed during migration');
  let targetResumeStarted = false;
  try {
    await input.callbacks.quiesceSource();
    await input.callbacks.drainSource();
    await input.callbacks.copyToTarget();
    await input.callbacks.validateTarget();
    await input.callbacks.warmTarget();
    targetResumeStarted = true;
    await input.callbacks.resumeTarget();
    const active: AuthFnIdentityPlacement = {
      identityKey: input.identityKey,
      regionId: input.targetRegionId,
      epoch: moving.epoch + 1,
      state: 'active',
      previousRegionId: input.sourceRegionId,
      updatedAt: now().toISOString()
    };
    const activationResult = await directory.compareAndSet({
      identityKey: input.identityKey,
      expectedEpoch: moving.epoch,
      expectedState: 'moving',
      placement: active
    });
    if (!activationResult.updated) throw new AuthFnRegionMismatchError('Identity placement changed before activation');
    return active;
  } catch (error) {
    if (targetResumeStarted) throw error;
    if (!input.callbacks.resumeSource) throw error;
    await input.callbacks.resumeSource();
    const rollback: AuthFnIdentityPlacement = {
      identityKey: input.identityKey,
      regionId: input.sourceRegionId,
      epoch: moving.epoch + 1,
      state: 'active',
      previousRegionId: input.targetRegionId,
      updatedAt: now().toISOString()
    };
    const rolledBack = await directory.compareAndSet({
      identityKey: input.identityKey,
      expectedEpoch: moving.epoch,
      expectedState: 'moving',
      placement: rollback
    });
    if (!rolledBack.updated) {
      throw new AuthFnRegionMismatchError('Identity placement rollback lost its compare-and-set race');
    }
    throw error;
  }
}

export async function tombstoneAuthFnIdentityPlacement(
  directory: AuthFnIdentityPlacementDirectoryAdapter,
  identityKey: string,
  now: () => Date = () => new Date()
): Promise<AuthFnIdentityPlacement | null> {
  const current = await directory.get(identityKey);
  if (!current || current.state === 'tombstoned') return current;
  const tombstoned: AuthFnIdentityPlacement = {
    ...current,
    epoch: current.epoch + 1,
    state: 'tombstoned',
    movingToRegionId: undefined,
    updatedAt: now().toISOString()
  };
  const result = await directory.compareAndSet({
    identityKey,
    expectedEpoch: current.epoch,
    expectedState: current.state,
    placement: tombstoned
  });
  if (!result.updated) throw new AuthFnRegionMismatchError('Identity placement changed before tombstoning');
  return tombstoned;
}

/** Fences an identity before destructive account deletion begins. */
export async function fenceAuthFnIdentityDeletion(
  directory: AuthFnIdentityPlacementDirectoryAdapter,
  identityKey: string,
  now: () => Date = () => new Date()
): Promise<AuthFnIdentityPlacement> {
  const current = await directory.get(identityKey);
  if (current?.state === 'deleting') {
    throw new AuthFnRegionMismatchError(
      'Identity placement is already fenced for account deletion',
      { deletionFenceAcquired: false }
    );
  }
  if (!current || current.state !== 'active') {
    throw new AuthFnRegionMismatchError(
      'Identity placement is not active before account deletion',
      { deletionFenceAcquired: false }
    );
  }
  const deleting: AuthFnIdentityPlacement = {
    ...current,
    epoch: current.epoch + 1,
    state: 'deleting',
    movingToRegionId: undefined,
    updatedAt: now().toISOString()
  };
  const result = await directory.compareAndSet({
    identityKey,
    expectedEpoch: current.epoch,
    expectedState: 'active',
    placement: deleting
  });
  if (!result.updated) {
    throw new AuthFnRegionMismatchError(
      'Identity placement changed while fencing account deletion',
      { deletionFenceAcquired: false }
    );
  }
  return deleting;
}

/** Finalizes a durable deletion fence after the account cascade succeeds. */
export async function finalizeAuthFnIdentityDeletion(
  directory: AuthFnIdentityPlacementDirectoryAdapter,
  identityKey: string,
  now: () => Date = () => new Date()
): Promise<AuthFnIdentityPlacement> {
  const current = await directory.get(identityKey);
  if (current?.state === 'tombstoned') return current;
  if (!current || current.state !== 'deleting') {
    throw new AuthFnRegionMismatchError('Identity placement is not fenced for account deletion');
  }
  const tombstoned: AuthFnIdentityPlacement = {
    ...current,
    epoch: current.epoch + 1,
    state: 'tombstoned',
    movingToRegionId: undefined,
    updatedAt: now().toISOString()
  };
  const result = await directory.compareAndSet({
    identityKey,
    expectedEpoch: current.epoch,
    expectedState: 'deleting',
    placement: tombstoned
  });
  if (!result.updated) {
    throw new AuthFnRegionMismatchError('Identity placement changed before deletion finalization');
  }
  return tombstoned;
}

/** Restores ownership when destructive account deletion aborts. */
export async function restoreAuthFnIdentityDeletion(
  directory: AuthFnIdentityPlacementDirectoryAdapter,
  identityKey: string,
  now: () => Date = () => new Date()
): Promise<AuthFnIdentityPlacement> {
  const current = await directory.get(identityKey);
  if (current?.state === 'active') return current;
  if (!current || current.state !== 'deleting') {
    throw new AuthFnRegionMismatchError('Identity placement is not fenced for account deletion');
  }
  const active: AuthFnIdentityPlacement = {
    ...current,
    epoch: current.epoch + 1,
    state: 'active',
    movingToRegionId: undefined,
    updatedAt: now().toISOString()
  };
  const result = await directory.compareAndSet({
    identityKey,
    expectedEpoch: current.epoch,
    expectedState: 'deleting',
    placement: active
  });
  if (!result.updated) {
    throw new AuthFnRegionMismatchError('Identity placement changed before deletion rollback');
  }
  return active;
}

function createMismatchAssertion(
  assertion: RoutingAssertion,
  placement: AuthFnIdentityPlacement,
  keyring: AuthFnRoutingKeyring,
  now: () => Date
): RoutingMismatchAssertion {
  const issuedAt = Math.floor(now().getTime() / 1000);
  return {
    kind: 'mismatch',
    keyId: keyring.active.keyId,
    identityKey: assertion.identityKey,
    requestId: assertion.requestId,
    receivedRegionId: assertion.regionId,
    receivedEpoch: assertion.epoch,
    expectedRegionId: placement.regionId,
    expectedEpoch: placement.epoch,
    executionStarted: false,
    issuedAt,
    expiresAt: issuedAt + 20,
    nonce: randomBytes(16).toString('base64url')
  };
}

async function validateRequestAssertion(
  assertion: RoutingAssertion,
  request: Request,
  audience: string
): Promise<void> {
  if (
    assertion.audience !== audience
    || assertion.requestId !== resolveRequestId(request)
    || assertion.method !== request.method
    || assertion.path !== requestPathAndQuery(request)
    || assertion.bodySha256 !== await requestBodyDigest(request)
  ) {
    throw new AuthFnRoutingAssertionInvalidError('Gateway routing assertion does not match the request');
  }
}

function signPayload(payload: SignedRoutingPayload, keyring: AuthFnRoutingKeyring): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', keyring.active.secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyPayload(
  token: string,
  keyring: AuthFnRoutingKeyring,
  now: () => Date,
  clockSkewSeconds = 0
): SignedRoutingPayload {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) throw new AuthFnRoutingAssertionInvalidError();
  let payload: SignedRoutingPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedRoutingPayload;
  } catch {
    throw new AuthFnRoutingAssertionInvalidError();
  }
  if (!isSignedRoutingPayload(payload)) throw new AuthFnRoutingAssertionInvalidError();
  const key = [keyring.active, ...(keyring.previous ?? [])].find((candidate) => candidate.keyId === payload.keyId);
  if (!key) throw new AuthFnRoutingAssertionInvalidError('Gateway routing assertion key is unknown');
  const expected = createHmac('sha256', key.secret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuthFnRoutingAssertionInvalidError();
  }
  const current = Math.floor(now().getTime() / 1000);
  if (payload.issuedAt > current + clockSkewSeconds || payload.expiresAt < current - clockSkewSeconds) {
    throw new AuthFnRoutingAssertionInvalidError('Gateway routing assertion is expired');
  }
  return payload;
}

function withRoutingAssertion(request: Request, assertion: string, requestId: string): Request {
  const headers = strippedRoutingHeaders(request.headers);
  headers.set(ASSERTION_HEADER, assertion);
  headers.set('x-request-id', requestId);
  return new Request(request.clone(), { headers });
}

function stripClientRoutingHeaders(request: Request): Request {
  return new Request(request.clone(), { headers: strippedRoutingHeaders(request.headers) });
}

function strippedRoutingHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  const keys: string[] = [];
  headers.forEach((_value, key) => keys.push(key));
  for (const key of keys) {
    if (key.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) headers.delete(key);
  }
  return headers;
}

function stripInternalResponseHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const keys: string[] = [];
  headers.forEach((_value, key) => keys.push(key));
  for (const key of keys) {
    if (key.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) headers.delete(key);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function requestBodyDigest(request: Request): Promise<string> {
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? new Uint8Array()
    : new Uint8Array(await request.clone().arrayBuffer());
  return createHash('sha256').update(body).digest('base64url');
}

function requestPathAndQuery(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

function requireActivePlacement(placement: AuthFnIdentityPlacement): AuthFnIdentityPlacement {
  if (placement.state === 'moving' || placement.state === 'deleting') {
    throw new AuthFnPlacementMovingError(undefined, { executionStarted: false });
  }
  if (placement.state !== 'active') throw new AuthFnRegionNotFoundError('Identity placement is not active');
  return placement;
}

function validatePlacement(placement: AuthFnIdentityPlacement): void {
  if (
    !placement.identityKey.trim()
    || !placement.regionId.trim()
    || !Number.isSafeInteger(placement.epoch)
    || placement.epoch < 1
    || !isPlacementState(placement.state)
    || (typeof placement.updatedAt !== 'string' && !(placement.updatedAt instanceof Date))
  ) {
    throw new AuthFnValidationError('Identity placement is invalid');
  }
}

function clonePlacement(placement: AuthFnIdentityPlacement): AuthFnIdentityPlacement {
  return { ...placement };
}

function placementKey(identityKey: string): string {
  return `${PLACEMENT_KEY_PREFIX}${encodeURIComponent(identityKey)}`;
}

function serializePlacement(placement: AuthFnIdentityPlacement): string {
  return JSON.stringify(placement);
}

function parsePlacement(value: string | null | undefined): AuthFnIdentityPlacement | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthFnIdentityPlacement>;
    if (
      typeof parsed.identityKey !== 'string'
      || typeof parsed.regionId !== 'string'
      || !Number.isSafeInteger(parsed.epoch)
      || !isPlacementState(parsed.state)
      || (typeof parsed.updatedAt !== 'string' && !(parsed.updatedAt instanceof Date))
    ) return null;
    const placement = parsed as AuthFnIdentityPlacement;
    validatePlacement(placement);
    return placement;
  } catch {
    return null;
  }
}

function isPlacementState(value: unknown): value is AuthFnIdentityPlacementState {
  return value === 'active' || value === 'moving' || value === 'deleting' || value === 'tombstoned';
}

function isSignedRoutingPayload(value: unknown): value is SignedRoutingPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.keyId !== 'string'
    || typeof payload.issuedAt !== 'number'
    || !Number.isSafeInteger(payload.issuedAt)
    || typeof payload.expiresAt !== 'number'
    || !Number.isSafeInteger(payload.expiresAt)
    || typeof payload.nonce !== 'string'
    || payload.nonce.length < 16
    || (payload.expiresAt as number) < (payload.issuedAt as number)
    || (payload.expiresAt as number) - (payload.issuedAt as number) > 300
  ) return false;
  if (payload.kind === 'request') {
    return typeof payload.identityKey === 'string'
      && typeof payload.regionId === 'string'
      && typeof payload.epoch === 'number'
      && Number.isSafeInteger(payload.epoch)
      && (payload.epoch as number) >= 1
      && typeof payload.requestId === 'string'
      && typeof payload.method === 'string'
      && typeof payload.path === 'string'
      && typeof payload.audience === 'string'
      && typeof payload.bodySha256 === 'string';
  }
  if (payload.kind === 'mismatch') {
    return typeof payload.identityKey === 'string'
      && typeof payload.requestId === 'string'
      && typeof payload.receivedRegionId === 'string'
      && typeof payload.receivedEpoch === 'number'
      && Number.isSafeInteger(payload.receivedEpoch)
      && typeof payload.expectedRegionId === 'string'
      && typeof payload.expectedEpoch === 'number'
      && Number.isSafeInteger(payload.expectedEpoch)
      && payload.executionStarted === false;
  }
  return false;
}

function stripBasePath(path: string, basePath: string): string {
  const normalizedBase = normalizeBasePath(basePath);
  if (normalizedBase === '/') return path;
  return path === normalizedBase || path.startsWith(`${normalizedBase}/`)
    ? path.slice(normalizedBase.length) || '/'
    : path;
}

function normalizeBasePath(basePath: string): string {
  const normalized = basePath.length > 1 && basePath.endsWith('/')
    ? basePath.slice(0, -1)
    : basePath;
  if (!normalized.startsWith('/') || normalized.includes('?') || normalized.includes('#')) {
    throw new AuthFnConfigError('AuthFn basePath must be an absolute URL path');
  }
  return normalized;
}

function normalizeAuthority(authority: string): string {
  try {
    return new URL(authority).origin;
  } catch {
    throw new AuthFnConfigError('AuthFn publicAuthority must be a valid origin');
  }
}

function validateKeyring(keyring: AuthFnRoutingKeyring): void {
  const keys = [keyring.active, ...(keyring.previous ?? [])];
  const ids = new Set<string>();
  for (const key of keys) {
    const byteLength = typeof key.secret === 'string'
      ? Buffer.byteLength(key.secret)
      : key.secret.byteLength;
    if (!key.keyId.trim() || byteLength < 32) {
      throw new AuthFnConfigError('AuthFn routing keys require a keyId and at least 32 bytes of secret material');
    }
    if (ids.has(key.keyId)) {
      throw new AuthFnConfigError('AuthFn routing key IDs must be unique');
    }
    ids.add(key.keyId);
  }
}

async function emit<TTarget>(
  options: AuthFnCanonicalGatewayOptions<TTarget>,
  request: Request,
  type: AuthFnEventInput['type'],
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { outcome, ...eventMetadata } = metadata;
    await options.onEvent?.({
      type,
      requestId: resolveRequestId(request),
      outcome: typeof outcome === 'string' ? outcome : undefined,
      metadata: eventMetadata
    });
  } catch {
    // Routing correctness must not depend on telemetry availability.
  }
}

function readErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'AUTHFN_INTERNAL_ERROR';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'AUTHFN_INTERNAL_ERROR';
}
