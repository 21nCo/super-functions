import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ConditionalKVStoreAdapter } from "@superfunctions/db";

export type DatafnPlacementState = "active" | "moving" | "tombstoned";

export interface DatafnNamespacePlacement {
  namespace: string;
  regionId: string;
  epoch: number;
  state: DatafnPlacementState;
  updatedAt: string;
  cacheExpiresAt?: string;
  destinationRef?: string;
  movingToRegionId?: string;
  previousRegionId?: string;
  migration?: DatafnNamespaceMigrationState;
}

export interface DatafnNamespaceMigrationState {
  phase: "moving" | "resume-target";
  sourceRegionId: string;
  targetRegionId: string;
  sourceEpoch: number;
  movingEpoch: number;
  recoveryOwnerId?: string;
  recoveryLeaseExpiresAt?: number;
  sourceDestinationRef?: string;
  targetDestinationRef?: string;
  sourcePreviousRegionId?: string;
}

export interface DatafnPlacementWriteResult {
  updated: boolean;
  placement: DatafnNamespacePlacement;
}

/**
 * Authoritative namespace-placement directory.
 *
 * Implementations must make get, putIfAbsent, and compareAndSet linearizable
 * for one namespace. Permission-directory projections deliberately use a
 * separate adapter and never decide database ownership.
 */
export interface DatafnPlacementDirectoryAdapter {
  get(namespace: string): Promise<DatafnNamespacePlacement | null>;
  putIfAbsent(
    placement: DatafnNamespacePlacement,
  ): Promise<{ inserted: boolean; placement: DatafnNamespacePlacement }>;
  compareAndSet(input: {
    namespace: string;
    expectedEpoch: number;
    expectedState?: DatafnPlacementState;
    next: DatafnNamespacePlacement;
  }): Promise<DatafnPlacementWriteResult>;
}

export interface DatafnRoutingAssertionClaims {
  version: 1;
  namespace: string;
  regionId: string;
  epoch: number;
  requestId: string;
  method: string;
  path: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  bodyDigest?: string;
}

export interface DatafnRoutingAssertionSigner {
  sign(claims: DatafnRoutingAssertionClaims): Promise<string> | string;
}

export interface DatafnRoutingAssertionVerifier {
  verify(assertion: string): Promise<DatafnRoutingAssertionClaims> | DatafnRoutingAssertionClaims;
}

/** Atomically claims a signed request nonce until the assertion expires. */
export interface DatafnRoutingReplayStore {
  claim(nonce: string, expiresAt: number): Promise<boolean> | boolean;
}

export type DatafnRoutingEventType =
  | "placement_lookup"
  | "cache_hit"
  | "forward"
  | "mismatch"
  | "retry"
  | "moving"
  | "directory_unavailable"
  | "destination_unavailable"
  | "epoch_conflict"
  | "assertion_invalid";

export interface DatafnRoutingEvent {
  type: DatafnRoutingEventType;
  requestId?: string;
  namespaceHash?: string;
  sourceRegion?: string;
  targetRegion?: string;
  epoch?: number;
  state?: DatafnPlacementState;
  attempt?: number;
  retryable?: boolean;
  durationMs?: number;
  outcome?: string;
}

export interface DatafnPlacementRuntimeConfig {
  directory: DatafnPlacementDirectoryAdapter;
  requireRoutingAssertion?: boolean;
  assertionVerifier?: DatafnRoutingAssertionVerifier;
  replayStore?: DatafnRoutingReplayStore;
  assertionAudience?: string;
  assertionHeader?: string;
  /** Maximum signed request body size. Defaults to 5 MiB. */
  maxBodyBytes?: number;
  now?: () => number;
  onEvent?: (event: DatafnRoutingEvent) => void | Promise<void>;
}

export const DATAFN_ROUTING_ASSERTION_HEADER = "x-datafn-routing-assertion";
export const DATAFN_ROUTING_INTERNAL_HEADERS = [
  DATAFN_ROUTING_ASSERTION_HEADER,
  "x-datafn-routing-namespace",
  "x-datafn-routing-region",
  "x-datafn-routing-epoch",
] as const;

const PLACEMENT_KEY_PREFIX = "datafn:placement:";
const DEFAULT_ROUTING_MAX_BODY_BYTES = 5 * 1024 * 1024;
const DEFAULT_GATEWAY_CACHE_MAX_ENTRIES = 10_000;
const DEFAULT_MIGRATION_RECOVERY_LEASE_MS = 30_000;

export class DatafnRoutingError extends Error {
  readonly code:
    | "DATAFN_PLACEMENT_NOT_FOUND"
    | "DATAFN_PLACEMENT_UNAVAILABLE"
    | "DATAFN_REGION_MISMATCH"
    | "DATAFN_NAMESPACE_MOVING"
    | "DATAFN_CELL_UNAVAILABLE"
    | "DATAFN_ROUTING_ASSERTION_INVALID"
    | "DATAFN_ROUTING_RETRY_EXHAUSTED"
    | "DATAFN_PAYLOAD_TOO_LARGE";
  readonly status: number;
  readonly retryable: boolean;
  readonly executionStarted: boolean;
  readonly placement?: DatafnNamespacePlacement;
  readonly internal: boolean;

  constructor(input: {
    code: DatafnRoutingError["code"];
    message: string;
    status: number;
    retryable: boolean;
    placement?: DatafnNamespacePlacement;
    internal?: boolean;
    executionStarted?: boolean;
  }) {
    super(input.message);
    this.name = "DatafnRoutingError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.executionStarted = input.executionStarted ?? false;
    this.placement = input.placement;
    this.internal = input.internal ?? false;
  }

  toResponse(): Response {
    const safePlacement = this.internal && this.placement
      ? {
          regionId: this.placement.regionId,
          epoch: this.placement.epoch,
          state: this.placement.state,
        }
      : undefined;
    return Response.json(
      {
        ok: false,
        error: {
          code: this.code,
          message: this.message,
          details: {
            retryable: this.retryable,
            executionStarted: this.executionStarted,
            ...(safePlacement ? { placement: safePlacement } : {}),
          },
        },
      },
      {
        status: this.status,
        headers: {
          "cache-control": "no-store",
          ...(this.internal && this.code === "DATAFN_REGION_MISMATCH"
            ? { "x-datafn-region-mismatch": "1" }
            : {}),
        },
      },
    );
  }
}

export function createConditionalKvDatafnPlacementDirectory(
  store: ConditionalKVStoreAdapter,
  options: {
    /** Explicit acknowledgement that authoritative reads are linearizable. */
    consistencyModel: "linearizable";
    keyPrefix?: string;
  },
): DatafnPlacementDirectoryAdapter {
  if (options.consistencyModel !== "linearizable") {
    throw new Error("DATAFN_PLACEMENT_LINEARIZABLE_READS_REQUIRED");
  }
  if (typeof store.compareAndSet !== "function") {
    throw new Error(
      "DATAFN_PLACEMENT_CAS_REQUIRED: placement moves require compareAndSet",
    );
  }
  const prefix = options.keyPrefix ?? PLACEMENT_KEY_PREFIX;
  const key = (namespace: string) => `${prefix}${encodeURIComponent(namespace)}`;

  return {
    async get(namespace) {
      return parsePlacement(await store.get(key(namespace)), namespace);
    },
    async putIfAbsent(placement) {
      assertPlacement(placement);
      const value = serializePlacement(placement);
      const result = await store.setIfAbsent({ key: key(placement.namespace), value });
      if (result.inserted) return { inserted: true, placement };
      const existing = parsePlacement(result.existing ?? await store.get(key(placement.namespace)), placement.namespace);
      if (!existing) {
        throw new Error("DATAFN_PLACEMENT_CORRUPT: conditional store returned an invalid placement");
      }
      return { inserted: false, placement: existing };
    },
    async compareAndSet(input) {
      assertPlacement(input.next);
      if (input.next.namespace !== input.namespace) {
        throw new Error("DATAFN_PLACEMENT_NAMESPACE_IMMUTABLE");
      }
      const existingValue = await store.get(key(input.namespace));
      const existing = parsePlacement(existingValue, input.namespace);
      if (!existing) {
        return { updated: false, placement: input.next };
      }
      if (
        existing.epoch !== input.expectedEpoch ||
        (input.expectedState !== undefined && existing.state !== input.expectedState)
      ) {
        return { updated: false, placement: existing };
      }
      if (input.next.epoch <= existing.epoch) {
        throw new Error("DATAFN_PLACEMENT_EPOCH_NON_MONOTONIC");
      }
      const result = await store.compareAndSet!({
        key: key(input.namespace),
        expected: existingValue,
        value: serializePlacement(input.next),
      });
      if (result.updated) return { updated: true, placement: input.next };
      const current = parsePlacement(result.existing ?? await store.get(key(input.namespace)), input.namespace);
      return { updated: false, placement: current ?? existing };
    },
  };
}

export function createMemoryDatafnPlacementDirectory(): DatafnPlacementDirectoryAdapter {
  const placements = new Map<string, DatafnNamespacePlacement>();
  return {
    async get(namespace) {
      const placement = placements.get(namespace);
      return placement ? clonePlacement(placement) : null;
    },
    async putIfAbsent(placement) {
      assertPlacement(placement);
      const existing = placements.get(placement.namespace);
      if (existing) return { inserted: false, placement: clonePlacement(existing) };
      placements.set(placement.namespace, clonePlacement(placement));
      return { inserted: true, placement: clonePlacement(placement) };
    },
    async compareAndSet(input) {
      assertPlacement(input.next);
      if (input.next.namespace !== input.namespace) {
        throw new Error("DATAFN_PLACEMENT_NAMESPACE_IMMUTABLE");
      }
      const existing = placements.get(input.namespace);
      if (
        !existing ||
        existing.epoch !== input.expectedEpoch ||
        (input.expectedState !== undefined && existing.state !== input.expectedState)
      ) {
        return { updated: false, placement: clonePlacement(existing ?? input.next) };
      }
      if (input.next.epoch <= existing.epoch) {
        throw new Error("DATAFN_PLACEMENT_EPOCH_NON_MONOTONIC");
      }
      placements.set(input.namespace, clonePlacement(input.next));
      return { updated: true, placement: clonePlacement(input.next) };
    },
  };
}

export async function claimDatafnNamespacePlacement(input: {
  directory: DatafnPlacementDirectoryAdapter;
  namespace: string;
  regionId: string;
  destinationRef?: string;
  cacheExpiresAt?: string;
  now?: () => number;
}): Promise<{ claimed: boolean; placement: DatafnNamespacePlacement }> {
  const placement: DatafnNamespacePlacement = {
    namespace: requiredString(input.namespace, "namespace"),
    regionId: requiredString(input.regionId, "regionId"),
    epoch: 1,
    state: "active",
    updatedAt: new Date((input.now ?? Date.now)()).toISOString(),
    ...(input.destinationRef ? { destinationRef: input.destinationRef } : {}),
    ...(input.cacheExpiresAt ? { cacheExpiresAt: input.cacheExpiresAt } : {}),
  };
  const result = await input.directory.putIfAbsent(placement);
  return { claimed: result.inserted, placement: result.placement };
}

export interface DatafnPlacementValidationResult {
  placement: DatafnNamespacePlacement;
  assertion?: DatafnRoutingAssertionClaims;
}

export async function validateDatafnPlacement(input: {
  namespace: string;
  regionId: string;
  runtime: DatafnPlacementRuntimeConfig;
  request?: Request;
  /** Trusted in-process execution has no externally supplied assertion. */
  trustedInternal?: boolean;
}): Promise<DatafnPlacementValidationResult> {
  const startedAt = Date.now();
  const requestId = input.request?.headers.get("x-request-id") ?? undefined;
  let placement: DatafnNamespacePlacement | null;
  try {
    placement = await input.runtime.directory.get(input.namespace);
    await emitRoutingEvent(input.runtime, {
      type: "placement_lookup",
      requestId,
      sourceRegion: input.regionId,
      targetRegion: placement?.regionId,
      epoch: placement?.epoch,
      state: placement?.state,
      durationMs: Date.now() - startedAt,
      outcome: placement ? "hit" : "miss",
    });
  } catch (cause) {
    await emitRoutingEvent(input.runtime, {
      type: "directory_unavailable",
      requestId,
      sourceRegion: input.regionId,
      retryable: true,
      durationMs: Date.now() - startedAt,
      outcome: String(cause),
    });
    throw new DatafnRoutingError({
      code: "DATAFN_PLACEMENT_UNAVAILABLE",
      message: "Namespace placement directory is unavailable",
      status: 503,
      retryable: true,
    });
  }

  if (!placement) {
    throw new DatafnRoutingError({
      code: "DATAFN_PLACEMENT_NOT_FOUND",
      message: "Namespace placement was not found",
      status: 404,
      retryable: false,
    });
  }

  const assertion = await validateRoutingAssertion({
    namespace: input.namespace,
    regionId: input.regionId,
    placement,
    runtime: input.runtime,
    request: input.request,
    trustedInternal: input.trustedInternal,
  });

  if (isPlacementTrafficFenced(placement)) {
    await emitRoutingEvent(input.runtime, {
      type: "moving",
      requestId,
      sourceRegion: input.regionId,
      targetRegion: placement.movingToRegionId,
      epoch: placement.epoch,
      state: placement.state,
      retryable: true,
    });
    throw new DatafnRoutingError({
      code: "DATAFN_NAMESPACE_MOVING",
      message: "Namespace placement is fenced for migration",
      status: 409,
      retryable: true,
      placement,
      internal: Boolean(assertion),
    });
  }
  if (placement.state === "tombstoned") {
    throw new DatafnRoutingError({
      code: "DATAFN_PLACEMENT_NOT_FOUND",
      message: "Namespace placement is tombstoned",
      status: 404,
      retryable: false,
      placement,
      internal: Boolean(assertion),
    });
  }
  if (placement.regionId !== input.regionId) {
    await emitRoutingEvent(input.runtime, {
      type: "mismatch",
      requestId,
      sourceRegion: input.regionId,
      targetRegion: placement.regionId,
      epoch: placement.epoch,
      state: placement.state,
      retryable: true,
    });
    throw new DatafnRoutingError({
      code: "DATAFN_REGION_MISMATCH",
      message: "Request reached a cell that does not own this namespace",
      status: 409,
      retryable: true,
      placement,
      internal: Boolean(assertion),
    });
  }
  if (assertion && assertion.epoch !== placement.epoch) {
    await emitRoutingEvent(input.runtime, {
      type: "mismatch",
      requestId,
      sourceRegion: input.regionId,
      targetRegion: placement.regionId,
      epoch: placement.epoch,
      state: placement.state,
      retryable: true,
      outcome: "stale-epoch",
    });
    throw new DatafnRoutingError({
      code: "DATAFN_REGION_MISMATCH",
      message: "Routing assertion uses a stale placement epoch",
      status: 409,
      retryable: true,
      placement,
      internal: true,
    });
  }
  return { placement, ...(assertion ? { assertion } : {}) };
}

export interface DatafnGatewayCellRegistry<TTarget> {
  resolve(input: {
    regionId: string;
    destinationRef?: string;
    placement: DatafnNamespacePlacement;
  }): Promise<TTarget> | TTarget;
}

export interface DatafnGatewayDispatcher<TTarget> {
  dispatch(input: {
    target: TTarget;
    request: Request;
    assertion: string;
    placement: DatafnNamespacePlacement;
    attempt: 0 | 1;
  }): Promise<Response>;
}

export interface DatafnGatewayRouterConfig<TTarget> {
  directory: DatafnPlacementDirectoryAdapter;
  deriveNamespace(request: Request): Promise<string> | string;
  cellRegistry: DatafnGatewayCellRegistry<TTarget>;
  dispatcher: DatafnGatewayDispatcher<TTarget>;
  assertionSigner: DatafnRoutingAssertionSigner;
  assertionAudience?: string;
  assertionTtlMs?: number;
  cacheTtlMs?: number;
  /** Maximum namespace placements retained by a gateway. Defaults to 10,000. */
  maxCacheEntries?: number;
  /** Maximum request body size accepted before dispatch. Defaults to 5 MiB. */
  maxBodyBytes?: number;
  now?: () => number;
  onEvent?: (event: DatafnRoutingEvent) => void | Promise<void>;
}

export interface DatafnGatewayRouter {
  handle(request: Request): Promise<Response>;
  invalidate(namespace: string): void;
  clear(): void;
}

export function createDatafnGatewayRouter<TTarget>(
  config: DatafnGatewayRouterConfig<TTarget>,
): DatafnGatewayRouter {
  const maxBodyBytes = validateDatafnRoutingBodyLimit(config.maxBodyBytes);
  const maxCacheEntries = routingCacheMaxEntries(config.maxCacheEntries);
  const cache = new Map<string, { placement: DatafnNamespacePlacement; expiresAt: number }>();
  const now = config.now ?? Date.now;
  const runtime: Pick<DatafnPlacementRuntimeConfig, "onEvent"> = { onEvent: config.onEvent };

  const resolvePlacement = async (
    namespace: string,
    requestId: string,
    force: boolean,
  ): Promise<DatafnNamespacePlacement> => {
    const cached = cache.get(namespace);
    if (!force && cached && cached.expiresAt > now()) {
      await emitRoutingEvent(runtime, {
        type: "cache_hit",
        requestId,
        targetRegion: cached.placement.regionId,
        epoch: cached.placement.epoch,
        state: cached.placement.state,
      });
      return clonePlacement(cached.placement);
    }
    if (cached) cache.delete(namespace);
    const startedAt = now();
    let placement: DatafnNamespacePlacement | null;
    try {
      placement = await config.directory.get(namespace);
    } catch (cause) {
      await emitRoutingEvent(runtime, {
        type: "directory_unavailable",
        requestId,
        retryable: true,
        durationMs: now() - startedAt,
        outcome: String(cause),
      });
      throw new DatafnRoutingError({
        code: "DATAFN_PLACEMENT_UNAVAILABLE",
        message: "Namespace placement directory is unavailable",
        status: 503,
        retryable: true,
      });
    }
    await emitRoutingEvent(runtime, {
      type: "placement_lookup",
      requestId,
      targetRegion: placement?.regionId,
      epoch: placement?.epoch,
      state: placement?.state,
      durationMs: now() - startedAt,
      outcome: placement ? "hit" : "miss",
    });
    if (!placement || placement.state === "tombstoned") {
      throw new DatafnRoutingError({
        code: "DATAFN_PLACEMENT_NOT_FOUND",
        message: "Namespace placement was not found",
        status: 404,
        retryable: false,
      });
    }
    if (isPlacementTrafficFenced(placement)) {
      throw new DatafnRoutingError({
        code: "DATAFN_NAMESPACE_MOVING",
        message: "Namespace placement is fenced for migration",
        status: 409,
        retryable: true,
      });
    }
    const parsedExpiry = placement.cacheExpiresAt
      ? Date.parse(placement.cacheExpiresAt)
      : Number.POSITIVE_INFINITY;
    const configuredExpiry = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Number.POSITIVE_INFINITY;
    setBoundedPlacementCache(cache, namespace, {
      placement: clonePlacement(placement),
      expiresAt: Math.min(now() + (config.cacheTtlMs ?? 5_000), configuredExpiry),
    }, maxCacheEntries, now());
    return placement;
  };

  const handle = async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
    let prepared: PreparedDatafnGatewayRequest;
    try {
      prepared = await prepareDatafnGatewayRequest(request, requestId, maxBodyBytes);
    } catch (error) {
      if (error instanceof DatafnRequestBodyTooLargeError) {
        return payloadTooLargeError(error.limit).toResponse();
      }
      throw error;
    }
    let namespace: string;
    let resolvedNamespace: string;
    try {
      resolvedNamespace = await config.deriveNamespace(prepared.createRequest());
    } catch {
      return new DatafnRoutingError({
        code: "DATAFN_CELL_UNAVAILABLE",
        message: "Trusted namespace resolution is unavailable",
        status: 503,
        retryable: true,
      }).toResponse();
    }
    try {
      namespace = requiredString(resolvedNamespace, "namespace");
    } catch {
      return new DatafnRoutingError({
        code: "DATAFN_PLACEMENT_NOT_FOUND",
        message: "A trusted namespace could not be derived",
        status: 400,
        retryable: false,
      }).toResponse();
    }
    const cleanRequest = prepared.createRequest();
    const bodyDigest = prepared.bodyDigest;

    for (const attempt of [0, 1] as const) {
      try {
        const placement = await resolvePlacement(namespace, requestId, attempt === 1);
        let target: TTarget;
        try {
          target = await config.cellRegistry.resolve({
            regionId: placement.regionId,
            destinationRef: placement.destinationRef,
            placement,
          });
        } catch (cause) {
          await emitRoutingEvent(runtime, {
            type: "destination_unavailable",
            requestId,
            targetRegion: placement.regionId,
            epoch: placement.epoch,
            attempt,
            retryable: true,
            outcome: String(cause),
          });
          throw new DatafnRoutingError({
            code: "DATAFN_CELL_UNAVAILABLE",
            message: "The owning regional cell is unavailable",
            status: 503,
            retryable: true,
          });
        }
        const issuedAt = now();
        const assertion = await config.assertionSigner.sign({
          version: 1,
          namespace,
          regionId: placement.regionId,
          epoch: placement.epoch,
          requestId,
          method: cleanRequest.method.toUpperCase(),
          path: requestTarget(cleanRequest.url),
          audience: config.assertionAudience ?? "datafn-cell",
          issuedAt,
          expiresAt: issuedAt + (config.assertionTtlMs ?? 30_000),
          nonce: crypto.randomUUID(),
          ...(bodyDigest ? { bodyDigest } : {}),
        });
        await emitRoutingEvent(runtime, {
          type: "forward",
          requestId,
          targetRegion: placement.regionId,
          epoch: placement.epoch,
          state: placement.state,
          attempt,
        });
        let response: Response;
        try {
          response = await config.dispatcher.dispatch({
            target,
            request: cleanRequest.clone(),
            assertion,
            placement,
            attempt,
          });
        } catch (cause) {
          if (cause instanceof DatafnRoutingError) throw cause;
          throw new DatafnRoutingError({
            code: "DATAFN_CELL_UNAVAILABLE",
            message: "The owning regional cell dispatch outcome is ambiguous",
            status: 503,
            retryable: false,
            executionStarted: true,
          });
        }
        const mismatch = await readPreExecutionMismatch(response);
        if (!mismatch) return response;
        cache.delete(namespace);
        if (attempt === 0) {
          await emitRoutingEvent(runtime, {
            type: "retry",
            requestId,
            targetRegion: placement.regionId,
            epoch: placement.epoch,
            attempt: 1,
            retryable: true,
          });
          continue;
        }
        throw new DatafnRoutingError({
          code: "DATAFN_ROUTING_RETRY_EXHAUSTED",
          message: "Regional routing retry was exhausted",
          status: 409,
          retryable: true,
        });
      } catch (error) {
        if (error instanceof DatafnRoutingError) return error.toResponse();
        return new DatafnRoutingError({
          code: "DATAFN_CELL_UNAVAILABLE",
          message: "Regional routing failed",
          status: 503,
          retryable: true,
        }).toResponse();
      }
    }
    return new DatafnRoutingError({
      code: "DATAFN_ROUTING_RETRY_EXHAUSTED",
      message: "Regional routing retry was exhausted",
      status: 409,
      retryable: true,
    }).toResponse();
  };

  return {
    handle,
    invalidate(namespace) {
      cache.delete(namespace);
    },
    clear() {
      cache.clear();
    },
  };
}

export interface DatafnNamespaceMigrationHooks {
  quiesceSource(input: DatafnNamespaceMigrationContext): Promise<void>;
  drainPermissionDirectory(input: DatafnNamespaceMigrationContext): Promise<void>;
  copyTenantData(input: DatafnNamespaceMigrationContext): Promise<void>;
  validateTenantData(input: DatafnNamespaceMigrationContext): Promise<void>;
  rebuildPermissionDirectory(input: DatafnNamespaceMigrationContext): Promise<void>;
  warmTarget(input: DatafnNamespaceMigrationContext): Promise<void>;
  resumeTarget(input: DatafnNamespaceMigrationContext): Promise<void>;
  rollbackSource?(input: DatafnNamespaceMigrationContext & { cause: unknown }): Promise<void>;
}

export interface DatafnNamespaceMigrationContext {
  namespace: string;
  sourceRegionId: string;
  targetRegionId: string;
  sourceEpoch: number;
  movingEpoch: number;
  /** Durable lease owner that hook implementations may use as a fencing token. */
  recoveryOwnerId: string;
  recoveryLeaseExpiresAt: number;
  /** True when replaying idempotent hooks for a persisted recovery state. */
  recovery?: boolean;
}

/**
 * Minimal fenced move protocol. The directory enters `moving` before hooks run,
 * so every cell fails closed while source writes are quiesced and data/outbox
 * state is copied. A second CAS activates the target with explicit recovery
 * state and a final CAS clears that state after the idempotent resume hook.
 */
export async function migrateDatafnNamespace(input: {
  directory: DatafnPlacementDirectoryAdapter;
  namespace: string;
  targetRegionId: string;
  targetDestinationRef?: string;
  hooks: DatafnNamespaceMigrationHooks;
  now?: () => number;
  /** Exclusive recovery lease duration. Defaults to 30 seconds. */
  recoveryLeaseMs?: number;
  onEvent?: (event: DatafnRoutingEvent) => void | Promise<void>;
}): Promise<DatafnNamespacePlacement> {
  const now = input.now ?? Date.now;
  const recoveryLeaseMs = migrationRecoveryLeaseMs(input.recoveryLeaseMs);
  const recoveryOwnerId = crypto.randomUUID();
  const observed = await input.directory.get(input.namespace);
  if (!observed) {
    throw new Error("DATAFN_MIGRATION_REQUIRES_ACTIVE_PLACEMENT");
  }

  if (observed.state === "active" && observed.migration?.phase === "resume-target") {
    if (
      observed.regionId !== input.targetRegionId ||
      observed.migration.targetRegionId !== input.targetRegionId ||
      (input.targetDestinationRef !== undefined &&
        input.targetDestinationRef !== observed.migration.targetDestinationRef)
    ) {
      throw new Error("DATAFN_MIGRATION_RECOVERY_REQUIRED");
    }
    const pendingResume = await claimDatafnMigrationRecovery({
      directory: input.directory,
      placement: observed,
      expectedState: "active",
      recoveryOwnerId,
      recoveryLeaseMs,
      now,
    });
    const recoveryContext = migrationContext(
      pendingResume.namespace,
      pendingResume.migration!,
      true,
    );
    await input.hooks.resumeTarget(recoveryContext);
    return finalizeDatafnMigrationResume({
      directory: input.directory,
      placement: pendingResume,
      now,
    });
  }

  if (observed.state === "active" && observed.regionId === input.targetRegionId) {
    if (
      input.targetDestinationRef !== undefined &&
      input.targetDestinationRef !== observed.destinationRef
    ) {
      throw new Error("DATAFN_MIGRATION_DESTINATION_UPDATE_REQUIRES_MOVE");
    }
    return observed;
  }

  let moving: DatafnNamespacePlacement;
  let migration: DatafnNamespaceMigrationState;
  let recovery = false;

  if (observed.state === "moving") {
    migration = observed.migration ?? legacyMovingMigration(observed);
    if (
      migration.targetRegionId !== input.targetRegionId ||
      (input.targetDestinationRef !== undefined &&
        input.targetDestinationRef !== migration.targetDestinationRef)
    ) {
      throw new Error("DATAFN_MIGRATION_ALREADY_IN_PROGRESS");
    }
    moving = await claimDatafnMigrationRecovery({
      directory: input.directory,
      placement: { ...observed, migration },
      expectedState: "moving",
      recoveryOwnerId,
      recoveryLeaseMs,
      now,
    });
    migration = moving.migration!;
    recovery = true;
  } else if (observed.state === "active") {
    migration = {
      phase: "moving",
      sourceRegionId: observed.regionId,
      targetRegionId: requiredString(input.targetRegionId, "targetRegionId"),
      sourceEpoch: observed.epoch,
      movingEpoch: observed.epoch + 1,
      recoveryOwnerId,
      recoveryLeaseExpiresAt: now() + recoveryLeaseMs,
      ...(observed.destinationRef
        ? { sourceDestinationRef: observed.destinationRef }
        : {}),
      ...(input.targetDestinationRef
        ? { targetDestinationRef: input.targetDestinationRef }
        : {}),
      ...(observed.previousRegionId
        ? { sourcePreviousRegionId: observed.previousRegionId }
        : {}),
    };
    moving = {
      ...observed,
      epoch: migration.movingEpoch,
      state: "moving",
      movingToRegionId: migration.targetRegionId,
      previousRegionId: migration.sourceRegionId,
      updatedAt: new Date(now()).toISOString(),
      migration,
    };
    const fenced = await input.directory.compareAndSet({
      namespace: observed.namespace,
      expectedEpoch: observed.epoch,
      expectedState: "active",
      next: moving,
    });
    if (!fenced.updated) {
      await input.onEvent?.({
        type: "epoch_conflict",
        sourceRegion: observed.regionId,
        targetRegion: input.targetRegionId,
        epoch: fenced.placement.epoch,
        state: fenced.placement.state,
        retryable: true,
      });
      throw new Error("DATAFN_PLACEMENT_EPOCH_CONFLICT");
    }
  } else {
    throw new Error("DATAFN_MIGRATION_REQUIRES_ACTIVE_PLACEMENT");
  }

  const context = migrationContext(observed.namespace, migration, recovery);
  try {
    await input.hooks.quiesceSource(context);
    await input.hooks.drainPermissionDirectory(context);
    await input.hooks.copyTenantData(context);
    await input.hooks.validateTenantData(context);
    await input.hooks.rebuildPermissionDirectory(context);
    await input.hooks.warmTarget(context);
  } catch (cause) {
    const rollback: DatafnNamespacePlacement = {
      namespace: moving.namespace,
      regionId: migration.sourceRegionId,
      epoch: moving.epoch + 1,
      state: "active",
      updatedAt: new Date(now()).toISOString(),
      ...(migration.sourceDestinationRef
        ? { destinationRef: migration.sourceDestinationRef }
        : {}),
      ...(migration.sourcePreviousRegionId
        ? { previousRegionId: migration.sourcePreviousRegionId }
        : {}),
    };
    const restored = await input.directory.compareAndSet({
      namespace: moving.namespace,
      expectedEpoch: moving.epoch,
      expectedState: "moving",
      next: rollback,
    });
    if (!restored.updated) {
      await input.onEvent?.({
        type: "epoch_conflict",
        sourceRegion: migration.sourceRegionId,
        targetRegion: input.targetRegionId,
        epoch: restored.placement.epoch,
        state: restored.placement.state,
        retryable: true,
        outcome: "rollback-cas-lost",
      });
      const conflict = new Error("DATAFN_MIGRATION_ROLLBACK_EPOCH_CONFLICT") as Error & {
        cause?: unknown;
      };
      conflict.cause = cause;
      throw conflict;
    }
    await input.hooks.rollbackSource?.({ ...context, cause });
    throw cause;
  }
  const activePendingResume: DatafnNamespacePlacement = {
    namespace: moving.namespace,
    regionId: migration.targetRegionId,
    epoch: moving.epoch + 1,
    state: "active",
    updatedAt: new Date(now()).toISOString(),
    previousRegionId: migration.sourceRegionId,
    ...(migration.targetDestinationRef
      ? { destinationRef: migration.targetDestinationRef }
      : {}),
    migration: {
      ...migration,
      phase: "resume-target",
      recoveryOwnerId,
      recoveryLeaseExpiresAt: now() + recoveryLeaseMs,
    },
  };
  const activated = await input.directory.compareAndSet({
    namespace: moving.namespace,
    expectedEpoch: moving.epoch,
    expectedState: "moving",
    next: activePendingResume,
  });
  if (!activated.updated) {
    throw new Error("DATAFN_PLACEMENT_EPOCH_CONFLICT");
  }
  await input.hooks.resumeTarget(migrationContext(
    activePendingResume.namespace,
    activePendingResume.migration!,
    recovery,
  ));
  return finalizeDatafnMigrationResume({
    directory: input.directory,
    placement: activePendingResume,
    now,
  });
}

async function claimDatafnMigrationRecovery(input: {
  directory: DatafnPlacementDirectoryAdapter;
  placement: DatafnNamespacePlacement;
  expectedState: "active" | "moving";
  recoveryOwnerId: string;
  recoveryLeaseMs: number;
  now: () => number;
}): Promise<DatafnNamespacePlacement> {
  const migration = input.placement.migration;
  if (!migration) throw new Error("DATAFN_MIGRATION_STATE_INVALID");
  const currentTime = input.now();
  if (
    migration.recoveryOwnerId &&
    migration.recoveryLeaseExpiresAt !== undefined &&
    migration.recoveryLeaseExpiresAt > currentTime
  ) {
    throw new Error("DATAFN_MIGRATION_ALREADY_IN_PROGRESS");
  }
  const claimed: DatafnNamespacePlacement = {
    ...input.placement,
    epoch: input.placement.epoch + 1,
    updatedAt: new Date(currentTime).toISOString(),
    migration: {
      ...migration,
      recoveryOwnerId: input.recoveryOwnerId,
      recoveryLeaseExpiresAt: currentTime + input.recoveryLeaseMs,
    },
  };
  const result = await input.directory.compareAndSet({
    namespace: input.placement.namespace,
    expectedEpoch: input.placement.epoch,
    expectedState: input.expectedState,
    next: claimed,
  });
  if (!result.updated) {
    throw new Error("DATAFN_MIGRATION_RECOVERY_EPOCH_CONFLICT");
  }
  return claimed;
}

async function finalizeDatafnMigrationResume(input: {
  directory: DatafnPlacementDirectoryAdapter;
  placement: DatafnNamespacePlacement;
  now: () => number;
}): Promise<DatafnNamespacePlacement> {
  const { migration: _migration, movingToRegionId: _movingToRegionId, ...rest } = input.placement;
  const finalized: DatafnNamespacePlacement = {
    ...rest,
    epoch: input.placement.epoch + 1,
    updatedAt: new Date(input.now()).toISOString(),
  };
  const result = await input.directory.compareAndSet({
    namespace: input.placement.namespace,
    expectedEpoch: input.placement.epoch,
    expectedState: "active",
    next: finalized,
  });
  if (!result.updated) throw new Error("DATAFN_MIGRATION_RESUME_EPOCH_CONFLICT");
  return finalized;
}

function legacyMovingMigration(
  placement: DatafnNamespacePlacement,
): DatafnNamespaceMigrationState {
  if (!placement.previousRegionId || !placement.movingToRegionId || placement.epoch < 2) {
    throw new Error("DATAFN_MIGRATION_STATE_INVALID");
  }
  return {
    phase: "moving",
    sourceRegionId: placement.previousRegionId,
    targetRegionId: placement.movingToRegionId,
    sourceEpoch: placement.epoch - 1,
    movingEpoch: placement.epoch,
    ...(placement.destinationRef
      ? { sourceDestinationRef: placement.destinationRef }
      : {}),
  };
}

function migrationContext(
  namespace: string,
  migration: DatafnNamespaceMigrationState,
  recovery: boolean,
): DatafnNamespaceMigrationContext {
  const recoveryOwnerId = requiredString(
    migration.recoveryOwnerId,
    "migration_recovery_owner",
  );
  if (
    !Number.isSafeInteger(migration.recoveryLeaseExpiresAt) ||
    migration.recoveryLeaseExpiresAt! < 1
  ) {
    throw new Error("DATAFN_MIGRATION_RECOVERY_LEASE_INVALID");
  }
  return {
    namespace,
    sourceRegionId: migration.sourceRegionId,
    targetRegionId: migration.targetRegionId,
    sourceEpoch: migration.sourceEpoch,
    movingEpoch: migration.movingEpoch,
    recoveryOwnerId,
    recoveryLeaseExpiresAt: migration.recoveryLeaseExpiresAt!,
    ...(recovery ? { recovery: true } : {}),
  };
}

export function createDatafnHmacRoutingAssertions(input: {
  activeKeyId: string;
  keys: Record<string, string | Uint8Array>;
  now?: () => number;
  clockSkewMs?: number;
}): DatafnRoutingAssertionSigner & DatafnRoutingAssertionVerifier {
  const activeKey = input.keys[input.activeKeyId];
  if (!activeKey) throw new Error("DATAFN_ROUTING_ASSERTION_ACTIVE_KEY_MISSING");
  const now = input.now ?? Date.now;
  return {
    sign(claims) {
      const payload = base64UrlEncode(JSON.stringify(claims));
      return `${input.activeKeyId}.${payload}.${hmac(payload, activeKey)}`;
    },
    verify(assertion) {
      const parts = assertion.split(".");
      if (parts.length !== 3) throw new Error("invalid routing assertion");
      const [keyId, payload, signature] = parts;
      const key = input.keys[keyId];
      if (!key || !safeEqual(signature, hmac(payload, key))) {
        throw new Error("invalid routing assertion signature");
      }
      const claims = JSON.parse(base64UrlDecode(payload)) as DatafnRoutingAssertionClaims;
      if (!validClaims(claims)) throw new Error("invalid routing assertion claims");
      const skew = input.clockSkewMs ?? 5_000;
      if (claims.issuedAt > now() + skew || claims.expiresAt < now() - skew) {
        throw new Error("expired routing assertion");
      }
      return claims;
    },
  };
}

/** In-memory replay protection for tests and single-process deployments. */
export function createMemoryDatafnRoutingReplayStore(
  options: { now?: () => number } = {},
): DatafnRoutingReplayStore {
  const claimed = new Map<string, number>();
  const expiries: Array<{ nonce: string; expiresAt: number }> = [];
  const now = options.now ?? Date.now;
  return {
    claim(nonce, expiresAt) {
      const current = now();
      while (expiries[0]?.expiresAt !== undefined && expiries[0].expiresAt <= current) {
        const expired = replayHeapPop(expiries)!;
        if (claimed.get(expired.nonce) === expired.expiresAt) {
          claimed.delete(expired.nonce);
        }
      }
      if (expiresAt <= current || claimed.has(nonce)) return false;
      claimed.set(nonce, expiresAt);
      replayHeapPush(expiries, { nonce, expiresAt });
      return true;
    },
  };
}

export function withDatafnRoutingAssertion(
  request: Request,
  assertion: string,
  header = DATAFN_ROUTING_ASSERTION_HEADER,
): Request {
  const headers = new Headers(request.headers);
  for (const name of DATAFN_ROUTING_INTERNAL_HEADERS) headers.delete(name);
  headers.set(header, assertion);
  return new Request(request, { headers });
}

async function validateRoutingAssertion(input: {
  namespace: string;
  regionId: string;
  placement: DatafnNamespacePlacement;
  runtime: DatafnPlacementRuntimeConfig;
  request?: Request;
  trustedInternal?: boolean;
}): Promise<DatafnRoutingAssertionClaims | undefined> {
  const header = input.runtime.assertionHeader ?? DATAFN_ROUTING_ASSERTION_HEADER;
  const assertion = input.request?.headers.get(header)?.trim();
  const hasForbiddenAuxiliaryHeader = Boolean(input.request) && DATAFN_ROUTING_INTERNAL_HEADERS
    .filter((name) => name !== header)
    .some((name) => input.request!.headers.has(name));
  if (hasForbiddenAuxiliaryHeader) {
    throw await invalidAssertion(input.runtime, "Untrusted internal routing headers were supplied");
  }
  if (!assertion) {
    if (input.runtime.requireRoutingAssertion && !input.trustedInternal) {
      throw await invalidAssertion(input.runtime, "A trusted routing assertion is required");
    }
    return undefined;
  }
  if (!input.runtime.assertionVerifier) {
    throw await invalidAssertion(input.runtime, "No routing assertion verifier is configured");
  }
  if (!input.runtime.replayStore) {
    throw await invalidAssertion(input.runtime, "No routing assertion replay store is configured");
  }
  try {
    const claims = await input.runtime.assertionVerifier.verify(assertion);
    const request = input.request;
    if (
      claims.namespace !== input.namespace ||
      claims.regionId !== input.regionId ||
      claims.audience !== (input.runtime.assertionAudience ?? "datafn-cell") ||
      (request && claims.method !== request.method.toUpperCase()) ||
      (request && claims.path !== requestTarget(request.url)) ||
      (request?.headers.get("x-request-id") &&
        claims.requestId !== request.headers.get("x-request-id"))
    ) {
      throw new Error("routing assertion does not match the request or placement");
    }
    if (request) {
      let digest: string | undefined;
      try {
        digest = await requestBodyDigest(
          request.clone(),
          validateDatafnRoutingBodyLimit(input.runtime.maxBodyBytes),
        );
      } catch (error) {
        if (error instanceof DatafnRequestBodyTooLargeError) {
          throw payloadTooLargeError(error.limit);
        }
        throw error;
      }
      if (digest !== claims.bodyDigest) throw new Error("routing assertion body digest mismatch");
    }
    if (!(await input.runtime.replayStore.claim(claims.nonce, claims.expiresAt))) {
      throw new Error("routing assertion nonce was replayed");
    }
    return claims;
  } catch (error) {
    if (error instanceof DatafnRoutingError) throw error;
    throw await invalidAssertion(input.runtime, "Routing assertion validation failed");
  }
}

async function invalidAssertion(
  runtime: DatafnPlacementRuntimeConfig,
  message: string,
): Promise<DatafnRoutingError> {
  await emitRoutingEvent(runtime, {
    type: "assertion_invalid",
    retryable: false,
    outcome: message,
  });
  return new DatafnRoutingError({
    code: "DATAFN_ROUTING_ASSERTION_INVALID",
    message,
    status: 401,
    retryable: false,
  });
}

async function readPreExecutionMismatch(response: Response): Promise<boolean> {
  if (response.status !== 409 || response.headers.get("x-datafn-region-mismatch") !== "1") {
    return false;
  }
  try {
    const body = await response.clone().json() as {
      error?: { code?: unknown; details?: { executionStarted?: unknown } };
    };
    return body.error?.code === "DATAFN_REGION_MISMATCH" &&
      body.error.details?.executionStarted === false;
  } catch {
    return false;
  }
}

interface PreparedDatafnGatewayRequest {
  bodyDigest?: string;
  createRequest(): Request;
}

async function prepareDatafnGatewayRequest(
  request: Request,
  requestId: string,
  maxBodyBytes: number,
): Promise<PreparedDatafnGatewayRequest> {
  const headers = new Headers(request.headers);
  for (const header of DATAFN_ROUTING_INTERNAL_HEADERS) headers.delete(header);
  headers.set("x-request-id", requestId);
  if (request.method === "GET" || request.method === "HEAD" || request.body === null) {
    return {
      createRequest: () => new Request(request.url, {
        method: request.method,
        headers,
        signal: request.signal,
      }),
    };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new DatafnRequestBodyTooLargeError(maxBodyBytes);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  const hash = createHash("sha256");
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel("request body limit exceeded").catch(() => undefined);
      throw new DatafnRequestBodyTooLargeError(maxBodyBytes);
    }
    chunks.push(value);
    hash.update(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    bodyDigest: hash.digest("base64url"),
    createRequest: () => new Request(request.url, {
      method: request.method,
      headers,
      body: body.slice(),
      signal: request.signal,
    }),
  };
}

class DatafnRequestBodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super("DATAFN_ROUTING_BODY_TOO_LARGE");
  }
}

function payloadTooLargeError(limit: number): DatafnRoutingError {
  return new DatafnRoutingError({
    code: "DATAFN_PAYLOAD_TOO_LARGE",
    message: `Request body exceeds the ${limit}-byte gateway limit`,
    status: 413,
    retryable: false,
  });
}

async function requestBodyDigest(
  request: Request,
  maxBodyBytes = DEFAULT_ROUTING_MAX_BODY_BYTES,
): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD" || request.body === null) {
    return undefined;
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new DatafnRequestBodyTooLargeError(maxBodyBytes);
  }
  const hash = createHash("sha256");
  const reader = request.body.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel("request body limit exceeded").catch(() => undefined);
      throw new DatafnRequestBodyTooLargeError(maxBodyBytes);
    }
    hash.update(value);
  }
  return hash.digest("base64url");
}

export function validateDatafnRoutingBodyLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_ROUTING_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("DATAFN_ROUTING_MAX_BODY_BYTES_INVALID");
  }
  return limit;
}

function routingCacheMaxEntries(value: number | undefined): number {
  const limit = value ?? DEFAULT_GATEWAY_CACHE_MAX_ENTRIES;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("DATAFN_ROUTING_CACHE_MAX_ENTRIES_INVALID");
  }
  return limit;
}

function migrationRecoveryLeaseMs(value: number | undefined): number {
  const leaseMs = value ?? DEFAULT_MIGRATION_RECOVERY_LEASE_MS;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) {
    throw new Error("DATAFN_MIGRATION_RECOVERY_LEASE_INVALID");
  }
  return leaseMs;
}

function setBoundedPlacementCache(
  cache: Map<string, { placement: DatafnNamespacePlacement; expiresAt: number }>,
  namespace: string,
  entry: { placement: DatafnNamespacePlacement; expiresAt: number },
  maxEntries: number,
  currentTime: number,
): void {
  cache.delete(namespace);
  cache.set(namespace, entry);
  if (cache.size <= maxEntries) return;
  for (const [key, candidate] of cache) {
    if (candidate.expiresAt <= currentTime) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function isPlacementTrafficFenced(placement: DatafnNamespacePlacement): boolean {
  return placement.state === "moving" || placement.migration?.phase === "resume-target";
}

function requestTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function serializePlacement(placement: DatafnNamespacePlacement): string {
  return JSON.stringify({
    namespace: placement.namespace,
    regionId: placement.regionId,
    epoch: placement.epoch,
    state: placement.state,
    updatedAt: placement.updatedAt,
    ...(placement.cacheExpiresAt ? { cacheExpiresAt: placement.cacheExpiresAt } : {}),
    ...(placement.destinationRef ? { destinationRef: placement.destinationRef } : {}),
    ...(placement.movingToRegionId ? { movingToRegionId: placement.movingToRegionId } : {}),
    ...(placement.previousRegionId ? { previousRegionId: placement.previousRegionId } : {}),
    ...(placement.migration ? { migration: placement.migration } : {}),
  });
}

function parsePlacement(
  value: string | null | undefined,
  expectedNamespace: string,
): DatafnNamespacePlacement | null {
  if (!value) return null;
  try {
    const placement = JSON.parse(value) as DatafnNamespacePlacement;
    assertPlacement(placement);
    return placement.namespace === expectedNamespace ? placement : null;
  } catch {
    return null;
  }
}

function assertPlacement(value: DatafnNamespacePlacement): void {
  requiredString(value.namespace, "namespace");
  requiredString(value.regionId, "regionId");
  if (!Number.isSafeInteger(value.epoch) || value.epoch < 1) {
    throw new Error("DATAFN_PLACEMENT_EPOCH_INVALID");
  }
  if (!(["active", "moving", "tombstoned"] as unknown[]).includes(value.state)) {
    throw new Error("DATAFN_PLACEMENT_STATE_INVALID");
  }
  if (!Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error("DATAFN_PLACEMENT_UPDATED_AT_INVALID");
  }
  if (value.migration) assertMigrationState(value.migration, value);
}

function assertMigrationState(
  migration: DatafnNamespaceMigrationState,
  placement: DatafnNamespacePlacement,
): void {
  if (migration.phase !== "moving" && migration.phase !== "resume-target") {
    throw new Error("DATAFN_MIGRATION_STATE_INVALID");
  }
  requiredString(migration.sourceRegionId, "migration_source_region");
  requiredString(migration.targetRegionId, "migration_target_region");
  if (
    !Number.isSafeInteger(migration.sourceEpoch) ||
    !Number.isSafeInteger(migration.movingEpoch) ||
    migration.sourceEpoch < 1 ||
    migration.movingEpoch !== migration.sourceEpoch + 1 ||
    placement.epoch < migration.movingEpoch
  ) {
    throw new Error("DATAFN_MIGRATION_EPOCH_INVALID");
  }
  if (
    (migration.phase === "moving" && placement.state !== "moving") ||
    (migration.phase === "resume-target" &&
      (placement.state !== "active" || placement.regionId !== migration.targetRegionId))
  ) {
    throw new Error("DATAFN_MIGRATION_STATE_INVALID");
  }
  const hasRecoveryOwner = typeof migration.recoveryOwnerId === "string" &&
    migration.recoveryOwnerId.trim().length > 0;
  const hasRecoveryExpiry = Number.isSafeInteger(migration.recoveryLeaseExpiresAt) &&
    migration.recoveryLeaseExpiresAt! > 0;
  if (hasRecoveryOwner !== hasRecoveryExpiry) {
    throw new Error("DATAFN_MIGRATION_RECOVERY_LEASE_INVALID");
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`DATAFN_${name.toUpperCase()}_INVALID`);
  }
  return value;
}

function clonePlacement(placement: DatafnNamespacePlacement): DatafnNamespacePlacement {
  return {
    ...placement,
    ...(placement.migration ? { migration: { ...placement.migration } } : {}),
  };
}

function replayHeapPush(
  heap: Array<{ nonce: string; expiresAt: number }>,
  value: { nonce: string; expiresAt: number },
): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent]!.expiresAt <= heap[index]!.expiresAt) break;
    [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
    index = parent;
  }
}

function replayHeapPop(
  heap: Array<{ nonce: string; expiresAt: number }>,
): { nonce: string; expiresAt: number } | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  heap[0] = last;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && heap[left]!.expiresAt < heap[smallest]!.expiresAt) {
      smallest = left;
    }
    if (right < heap.length && heap[right]!.expiresAt < heap[smallest]!.expiresAt) {
      smallest = right;
    }
    if (smallest === index) return first;
    [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
    index = smallest;
  }
}

async function emitRoutingEvent(
  runtime: Pick<DatafnPlacementRuntimeConfig, "onEvent">,
  event: DatafnRoutingEvent,
): Promise<void> {
  try {
    await runtime.onEvent?.(event);
  } catch {
  }
}

function hmac(payload: string, key: string | Uint8Array): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function validClaims(value: DatafnRoutingAssertionClaims): boolean {
  return value?.version === 1 &&
    typeof value.namespace === "string" &&
    typeof value.regionId === "string" &&
    Number.isSafeInteger(value.epoch) &&
    typeof value.requestId === "string" &&
    typeof value.method === "string" &&
    typeof value.path === "string" &&
    typeof value.audience === "string" &&
    Number.isFinite(value.issuedAt) &&
    Number.isFinite(value.expiresAt) &&
    typeof value.nonce === "string";
}
