/**
 * DataFn client factory
 */

import type {
  DatafnEnvelope,
  DatafnError,
  DatafnSchema,
  DatafnPlugin,
  SearchProvider,
} from "@datafn/core";
import { validateSchema, buildSchemaIndex, evaluateFilter as coreEvaluateFilter } from "@datafn/core";
import { EventBus, type EventHandler } from "./events/bus.js";
import type { EventFilter } from "./events/filter.js";
import { createClientError } from "./errors.js";
import { TableRegistry } from "./tables/registry.js";
import type { DatafnTable } from "./tables/table.js";
import { executeQuery } from "./query.js";
import {
  executeMutation,
  type MutationPushScheduler,
} from "./mutate.js";
import { executeTransact } from "./transact.js";
import { SignalRegistry } from "./signals/querySignal.js";
import { LiveSignalRegistry } from "./signals/liveSignal.js";
import {
  createSyncFacade,
  type SyncControlMethods,
  type SyncFacade,
} from "./sync.js";
import type { DatafnStorageAdapter, DatafnStorageFactory } from "./storage.js";
import { DefaultHttpTransport } from "./transport/http.js";
import { SyncEngine } from "./sync/engine.js";
import { createKvApi, type DatafnKvApi, KV_RESOURCE_NAME } from "./kv.js";
import { ensureBuiltinKv } from "@datafn/core";
import { ExtensionSubscriptionManager } from "./extension/subscriptionManager.js";
import { DebouncerMap } from "./debounce.js";
import { exportData, importData, type DatafnExportPayload, type DatafnImportResult } from "./export.js";
import { CrossTabRelay } from "./crossTab.js";

// Helper type to extract resource names from schema
export type ResourceNames<S extends DatafnSchema> =
  S["resources"][number]["name"];

export interface DatafnRemoteAdapter {
  query(q: unknown): Promise<unknown>;
  mutation(m: unknown): Promise<unknown>;
  transact(t: unknown): Promise<unknown>;
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
  reconcile(payload: unknown): Promise<unknown>; // Required for SYNC-007
  search?(payload: unknown): Promise<unknown>;
}

export type DatafnSyncOwner = "javascript" | "native";

export type DatafnNativeRemoteMode = "datafn-server" | "icloud";

export interface DatafnBridgeEventEnvelope {
  protocol: "datafn-bridge/v1";
  event: string;
  payload: unknown;
}

export interface DatafnNativeHandshakeRequest {
  schemaHash: string;
  namespace: string;
  clientId: string;
  remoteMode: DatafnNativeRemoteMode;
  remoteProfile?: string;
}

export interface DatafnNativeHandshakeResult {
  bridgeVersion: number;
  schemaHash: string;
  namespace: string;
  storageBackend: "coredata";
  syncOwner: "native";
  remoteMode: DatafnNativeRemoteMode;
  indexedDbDisabled: boolean;
  cloudKitPrivateOnly?: boolean;
  capabilities: string[];
}

export interface DatafnNativeSyncController {
  readonly __datafnNativeBacked?: true;
  handshake(
    payload: DatafnNativeHandshakeRequest,
  ): Promise<DatafnEnvelope<DatafnNativeHandshakeResult>>;
  start(): Promise<void>;
  stop(): Promise<void>;
  pullNow(): Promise<void>;
  cloneNow(): Promise<void>;
  reconcileNow(): Promise<void>;
  schedulePush(): Promise<void>;
  onEvent(handler: (event: DatafnBridgeEventEnvelope) => void): () => void;
}

export interface DatafnNativeSyncConfig {
  syncController: DatafnNativeSyncController;
  remoteMode: DatafnNativeRemoteMode;
  failIfUnavailable?: boolean;
  expectedSchemaHash?: string;
  remoteProfile?: string;
}

export interface DatafnSyncConfig {
  /**
   * Select who owns remote synchronization for this client instance.
   * Defaults to "javascript".
   */
  owner?: DatafnSyncOwner;

  /**
   * Enable offline support. Requires `storage` adapter.
   */
  offlinability?: boolean;

  /**
   * Remote server URL used by the default HTTP transport and for deriving wsUrl.
   * Optional when `remoteAdapter` is provided.
   */
  remote?: string;

  /**
   * Optional injected adapter used instead of DefaultHttpTransport.
   * Required for extension environments.
   */
  remoteAdapter?: DatafnRemoteAdapter;

  /**
   * Native-backed synchronization configuration.
   * Required when `owner` is `"native"`.
   */
  native?: DatafnNativeSyncConfig;

  /**
   * Enable WebSocket updates.
   */
  ws?: boolean;

  /**
   * WebSocket URL. If not provided, derived from `remote` when `ws` is enabled.
   */
  wsUrl?: string;

  /**
   * Batch push interval in milliseconds.
   * Must be a positive integer.
   */
  pushInterval?: number;

  /**
   * Batch push page size.
   * Must be a positive integer. Default 100.
   */
  pushBatchSize?: number;

  /**
   * Max retries for push.
   * Must be a non-negative integer. Default 3.
   */
  pushMaxRetries?: number;

  /**
   * Hydration plan for large datasets.
   */
  hydration?: {
    /**
     * Resources that MUST be cloned to `ready` before the app can consider itself hydrated.
     */
    bootResources?: string[];
    /**
     * Resources that MAY hydrate in the background after boot.
     */
    backgroundResources?: string[];
    /**
     * Per-resource clone page size limits used by paginated clone.
     */
    clonePageSize?: number | Record<string, number>;
  };

  /**
   * Explicit mode selection.
   * - "sync": requires remote or remoteAdapter.
   * - "local-only": remote is not required; all local tables start as `ready`.
   */
  mode?: "sync" | "local-only";

  /**
   * WebSocket reconnection configuration with exponential backoff and jitter.
   * Default: enabled with baseDelayMs=1000, multiplier=2, maxDelayMs=60000, jitterMs=500.
   */
  wsReconnect?: {
    enabled?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitterMs?: number;
  };

  /**
   * Push retry exponential backoff configuration.
   * Default: baseDelayMs=1000, multiplier=2, maxDelayMs=60000, jitterMs=500.
   */
  pushRetryBackoff?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitterMs?: number;
  };

  /**
   * Push interval exponential backoff configuration when push keeps failing.
   * When a push round exhausts all retries and fails, the next round is delayed
   * using exponential backoff: pushInterval * multiplier^consecutiveFailures.
   * On first success after failures, backoff is reset to configured pushInterval.
   * Default: baseMultiplier=2, maxDelayMs=300000 (5 minutes), jitterMs=1000.
   */
  pushIntervalBackoff?: {
    baseMultiplier?: number;
    maxDelayMs?: number;
    jitterMs?: number;
  };

  /**
   * Pull batch size limit per request.
   * Must be a positive integer between 10 and 10000.
   * Default: 200.
   */
  pullBatchSize?: number;

  /**
   * Maximum number of catch-up pull iterations per sync cycle (CLIENT-PULL-003).
   * Prevents infinite loops if the server continuously returns hasMore=true.
   * Default: 50.
   */
  maxPullIterations?: number;

  /**
   * Enable cross-tab coordination via BroadcastChannel.
   * When enabled, mutation events are relayed to other same-origin tabs for near-instant reactivity.
   * Default: false (opt-in).
   */
  crossTab?: boolean;

  /**
   * Defer search indexing for initial clone and rebuild asynchronously after clone completion.
   */
  skipCloneIndexing?: boolean;
}

function isNativeBackedBridgeValue(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __datafnNativeBacked?: unknown }).__datafnNativeBacked === true
  );
}

function deriveSearchProviderResources(
  schema: DatafnSchema,
): Array<{ name: string; searchFields: string[] }> {
  const resources: Array<{ name: string; searchFields: string[] }> = [];
  const seen = new Set<string>();

  for (const [index, resource] of schema.resources.entries()) {
    const searchPath = `schema.resources[${index}].indices.search`;
    const rawSearchFields = Array.isArray(resource.indices)
      ? []
      : (resource.indices?.search ?? []);

    if (!Array.isArray(rawSearchFields)) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid schema search index configuration: search fields must be an array",
        { path: searchPath },
      );
    }

    const searchFields = rawSearchFields.map((field, fieldIndex) => {
      if (typeof field !== "string" || field.trim().length === 0) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid schema search index configuration: search fields must be non-empty strings",
          { path: `${searchPath}[${fieldIndex}]` },
        );
      }
      return field.trim();
    });

    if (searchFields.length === 0) {
      continue;
    }

    const resourceName = resource.name.trim();
    const normalizedResourceName = resourceName.toLowerCase();
    if (seen.has(normalizedResourceName)) {
      throw createClientError(
        "DFQL_INVALID",
        "Duplicate normalized search resource definitions are not allowed",
        { path: "resources" },
      );
    }
    seen.add(normalizedResourceName);

    resources.push({
      name: resourceName,
      searchFields: Array.from(new Set(searchFields)),
    });
  }

  return resources;
}

function normalizeClientErrorDetails(
  details: unknown,
  fallbackPath: string,
): { path: string; [key: string]: unknown } {
  if (
    typeof details === "object" &&
    details !== null &&
    !Array.isArray(details)
  ) {
    const normalized = details as Record<string, unknown>;
    const path =
      typeof normalized.path === "string" ? normalized.path : fallbackPath;
    return { ...normalized, path };
  }

  return { path: fallbackPath };
}

function throwBridgeClientError(
  error: DatafnError,
  fallbackPath: string,
): never {
  throw createClientError(
    error.code,
    error.message,
    normalizeClientErrorDetails(error.details, fallbackPath),
  );
}

export interface DatafnClientConfig<S extends DatafnSchema> {
  schema: S;
  /**
   * Sync configuration.
   */
  sync?: DatafnSyncConfig;
  /**
   * Optional plugins for client-side hook execution
   */
  plugins?: DatafnPlugin[];
  /**
   * Stable client/device identifier used for idempotency and offline change logs.
   * Required when `storage` is provided.
   */
  clientId: string;
  /**
   * Local persistence adapter. Can be:
   * - A direct `DatafnStorageAdapter` instance
   * - A factory function `(namespace: string) => DatafnStorageAdapter` for multi-user isolation
   *
   * When using a factory function, `namespace` must also be provided.
   */
  storage?: DatafnStorageAdapter | DatafnStorageFactory;
  /**
   * Namespace for client-side data isolation.
   * Used to construct isolated storage (IndexedDB database names, BroadcastChannel names).
   * Required when `storage` is a factory function.
   */
  namespace?: string;
  getTimestamp?: () => number; // For testing with fake clock
  /**
   * Resource-aware ID generator function for insert operations.
   * If not provided, defaults to crypto.randomUUID() with resource prefix.
   * Allows users to use custom ID strategies (UUID v7, ULID, etc.)
   * without adding dependencies to @datafn/client.
   */
  generateId?: (params: { resource: string; idPrefix?: string }) => string;

  /**
   * Optional search provider for client-side search query routing.
   */
  searchProvider?: SearchProvider;
}

/**
 * Override options for switchContext.
 * Only the provided fields are changed; everything else is inherited from the current config.
 */
export type SwitchContextOverride = {
  /** New namespace (replaces current) */
  namespace?: string;
  /** New sync configuration (replaces current, not merged) */
  sync?: DatafnSyncConfig;
  /** New storage adapter or factory (replaces current) */
  storage?: DatafnStorageAdapter | DatafnStorageFactory;
};

export type DatafnClient<S extends DatafnSchema> = {
  table<Name extends ResourceNames<S>>(name: Name): DatafnTable<S, Name>;
  query(q: unknown | unknown[]): Promise<unknown>;
  mutate(mutation: unknown | unknown[]): Promise<unknown>;
  transact(payload: unknown): Promise<unknown>;
  subscribe(handler: EventHandler, filter?: EventFilter): () => void;
  sync: SyncFacade & SyncControlMethods;
  kv: DatafnKvApi;
  /** Tear down client: stop sync, close connections, unsubscribe all, release resources. */
  destroy(): Promise<void>;
  /** Wipe all local data (IndexedDB stores, cursors, changelog, hydration state). */
  clear(): Promise<void>;
  /** Flush a specific debounced mutation immediately. */
  flush(key?: string): Promise<void>;
  /** Flush all pending debounced mutations immediately. */
  flushAll(): Promise<void>;
  /** Export all local records as structured JSON. */
  exportData(options?: { resources?: string[] }): Promise<unknown>;
  /** Import records from a structured JSON payload. */
  importData(data: unknown, options?: { triggerCloneUp?: boolean }): Promise<unknown>;
  /** Check storage health and verify hydration state consistency. */
  checkHealth(): Promise<{ ok: boolean; issues: string[]; action?: "none" | "reclone" }>;
  /** Perform a cross-resource search using the configured search provider. */
  search(params: unknown): Promise<unknown>;
  /**
   * Switch to a different configuration context (auth, sync mode, or storage).
   * Destroys the current underlying client and recreates it with merged config.
   * Concurrent calls are serialized. Auto-starts sync when sync.mode is "sync".
   */
  switchContext(override: SwitchContextOverride): Promise<void>;
  /** Get the current resolved namespace, or undefined if not configured. */
  currentNamespace(): string | undefined;
  /**
   * Subscribe to client lifecycle changes.
   * The callback fires immediately with the stable proxy reference,
   * and again after every switchContext() completes.
   * Returns an unsubscribe function.
   */
  subscribeClient(fn: (client: DatafnClient<S>) => void): () => void;
} & {
  [Name in ResourceNames<S>]: DatafnTable<S, Name>;
};

/**
 * Internal: creates a one-shot DataFn client without switching capability.
 * Used by createDatafnClient (the public API that adds switchContext).
 */
function _buildRawClient<S extends DatafnSchema>(
  config: DatafnClientConfig<S>,
): DatafnClient<S> {
  // Validate schema at client creation (CLIENT-API-001)
  const validationResult = validateSchema(config.schema);
  if (!validationResult.ok) {
    createClientError(
      validationResult.error.code,
      validationResult.error.message,
      validationResult.error.details as {
        path: string;
        [key: string]: unknown;
      },
    );
  }

  // Validate Sync Config (CFG-001, CFG-002)
  // Note: We validate offlinability requires storage after resolving storage below
  if (config.sync) {
    const syncOwner = config.sync.owner ?? "javascript";

    // Determine sync mode (default to "sync")
    const syncMode = config.sync.mode || "sync";

    // CFG-001: In sync mode, require remote or remoteAdapter
    if (syncMode === "sync") {
      if (!config.sync.remote && !config.sync.remoteAdapter) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid client config: remote or remoteAdapter is required in sync mode",
          { path: "sync" },
        );
      }
    }

    if (syncOwner === "native" && config.sync.remote) {
      const message =
        config.sync.native?.remoteMode === "icloud"
          ? "native icloud mode forbids direct JavaScript remote ownership"
          : "native sync owner forbids direct JavaScript remote ownership";
      throw createClientError("DFQL_INVALID", message, {
        path: "sync.remote",
      });
    }

    // CFG-002: In local-only mode, forbid ws without remote/wsUrl
    if (syncMode === "local-only") {
      if (
        config.sync.ws === true &&
        !config.sync.remote &&
        !config.sync.wsUrl
      ) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid client config: WebSocket requires remote or wsUrl in local-only mode",
          { path: "sync.ws" },
        );
      }
    }

    if (
      config.sync.pushBatchSize !== undefined &&
      (!Number.isInteger(config.sync.pushBatchSize) ||
        config.sync.pushBatchSize <= 0)
    ) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid client config: pushBatchSize must be a positive integer",
        { path: "sync.pushBatchSize" },
      );
    }
    if (
      config.sync.pushInterval !== undefined &&
      (!Number.isInteger(config.sync.pushInterval) ||
        config.sync.pushInterval <= 0)
    ) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid client config: pushInterval must be a positive integer",
        { path: "sync.pushInterval" },
      );
    }
    if (
      config.sync.pushMaxRetries !== undefined &&
      (!Number.isInteger(config.sync.pushMaxRetries) ||
        config.sync.pushMaxRetries < 0)
    ) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid client config: pushMaxRetries must be a non-negative integer",
        { path: "sync.pushMaxRetries" },
      );
    }
    // CFG-001: Validate pullBatchSize
    if (
      config.sync.pullBatchSize !== undefined &&
      (!Number.isInteger(config.sync.pullBatchSize) ||
        config.sync.pullBatchSize < 10 ||
        config.sync.pullBatchSize > 10000)
    ) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid client config: pullBatchSize must be a positive integer between 10 and 10000",
        { path: "sync.pullBatchSize" },
      );
    }
  }

  // Ensure built-in KV resource exists in schema (KV-001)
  const schema = ensureBuiltinKv(validationResult.result);
  // Optional plugin-level schema validation hook
  for (const plugin of config.plugins || []) {
    const validatePluginSchema = (plugin as unknown as Record<string, unknown>)
      .validateSchema;
    if (typeof validatePluginSchema === "function") {
      (validatePluginSchema as (schema: DatafnSchema) => void)(schema);
    }
  }
  // Build O(1) schema index for offline query path (IDX-003)
  const schemaIndex = buildSchemaIndex(schema);
  const eventBus = new EventBus();
  const getTimestamp = config.getTimestamp || (() => Date.now());

  // Create ID generator with built-in default strategy (API-001)
  const generateId =
    config.generateId ||
    (({ resource, idPrefix }: { resource: string; idPrefix?: string }) => {
      // Generate a random ID component
      let randomId: string;
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        randomId = crypto.randomUUID();
      } else {
        randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }

      // Use idPrefix if provided, otherwise default to resource:
      const prefix = idPrefix || resource;
      return `${prefix}:${randomId}`;
    });

  // Validate empty namespace (NS-022)
  if (config.namespace !== undefined && config.namespace === "") {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid client config: namespace must be a non-empty string",
      { path: "namespace" },
    );
  }

  // Resolve storage adapter (may be a factory function requiring namespace)
  let resolvedStorage: DatafnStorageAdapter | undefined;
  let resolvedNamespace: string | undefined = config.namespace;
  if (config.storage) {
    if (typeof config.storage === "function") {
      // Storage is a factory function — requires namespace
      if (config.namespace) {
        resolvedStorage = config.storage(config.namespace);
      } else {
        throw createClientError(
          "DFQL_INVALID",
          "namespace is required when storage is a factory function",
          { path: "namespace" },
        );
      }
    } else {
      // Direct storage adapter
      resolvedStorage = config.storage;
    }
  }

  // Validate offlinability requires resolved storage
  if (config.sync?.offlinability && !resolvedStorage) {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid client config: storage is required when offlinability is true",
      { path: "storage" },
    );
  }

  if (config.sync && (config.sync.owner ?? "javascript") === "native") {
    const nativeConfig = config.sync.native;
    const hasExpectedSchemaHash =
      typeof nativeConfig?.expectedSchemaHash === "string" &&
      nativeConfig.expectedSchemaHash.length > 0;

    if (
      !nativeConfig ||
      !resolvedStorage ||
      !config.sync.remoteAdapter ||
      config.sync.offlinability !== true ||
      !hasExpectedSchemaHash ||
      !isNativeBackedBridgeValue(resolvedStorage) ||
      !isNativeBackedBridgeValue(config.sync.remoteAdapter) ||
      !isNativeBackedBridgeValue(nativeConfig.syncController)
    ) {
      throw createClientError(
        "DFQL_INVALID",
        "native sync owner requires native-backed storage, remoteAdapter, and native config",
        { path: "sync.native" },
      );
    }
  }

  const resolvedSyncOwner = config.sync?.owner ?? "javascript";
  const nativeSyncConfig =
    resolvedSyncOwner === "native" ? config.sync?.native : undefined;
  const nativeSyncController = nativeSyncConfig?.syncController;
  const nativeNamespace = resolvedNamespace ?? "default";
  const nativeBridgeInitPromise =
    nativeSyncConfig && nativeSyncController
      ? (async () => {
          const handshake = await nativeSyncController.handshake({
            schemaHash: nativeSyncConfig.expectedSchemaHash!,
            namespace: nativeNamespace,
            clientId: config.clientId,
            remoteMode: nativeSyncConfig.remoteMode,
            ...(nativeSyncConfig.remoteProfile !== undefined
              ? { remoteProfile: nativeSyncConfig.remoteProfile }
              : {}),
          });

          if (!handshake.ok) {
            if (
              nativeSyncConfig.failIfUnavailable !== false ||
              handshake.error.code !== "BRIDGE_UNAVAILABLE"
            ) {
              throwBridgeClientError(handshake.error, "sync.native");
            }
            return;
          }

          const result = handshake.result;

          if (result.bridgeVersion !== 1) {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge protocol version mismatch",
              {
                path: "sync.native",
                expectedBridgeVersion: 1,
                actualBridgeVersion: result.bridgeVersion,
              },
            );
          }

          if (result.schemaHash !== nativeSyncConfig.expectedSchemaHash) {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge schema hash mismatch",
              {
                path: "sync.native.expectedSchemaHash",
                expectedSchemaHash: nativeSyncConfig.expectedSchemaHash,
                actualSchemaHash: result.schemaHash,
              },
            );
          }

          if (result.namespace !== nativeNamespace) {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge namespace mismatch",
              {
                path: "namespace",
                expectedNamespace: nativeNamespace,
                actualNamespace: result.namespace,
              },
            );
          }

          if (result.syncOwner !== "native") {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge did not accept native sync ownership",
              { path: "sync.owner", actualSyncOwner: result.syncOwner },
            );
          }

          if (result.storageBackend !== "coredata") {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge reported an unsupported storage backend",
              {
                path: "sync.native",
                storageBackend: result.storageBackend,
              },
            );
          }

          if (result.remoteMode !== nativeSyncConfig.remoteMode) {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge remote mode mismatch",
              {
                path: "sync.native.remoteMode",
                expectedRemoteMode: nativeSyncConfig.remoteMode,
                actualRemoteMode: result.remoteMode,
              },
            );
          }

          if (result.indexedDbDisabled !== true) {
            throw createClientError(
              "BRIDGE_PROTOCOL_MISMATCH",
              "Native bridge must disable IndexedDB persistence",
              { path: "sync.native", indexedDbDisabled: result.indexedDbDisabled },
            );
          }
        })()
      : Promise.resolve();
  nativeBridgeInitPromise.catch(() => {});

  const awaitNativeBridgeReady = async (): Promise<void> => {
    await nativeBridgeInitPromise;
  };

  // STORAGE-INIT-001: Validate storage has all required resource stores.
  // Probes each resource with a lightweight getRecord call. If a store is
  // missing (e.g. schema was not passed to IndexedDbStorageAdapter), this
  // throws a clear error on the first query/mutation instead of a cryptic
  // "Store not found" deep in the stack.
  // Defined before localOnlyInitPromise so that it can be awaited first.
  const storageValidationPromise = resolvedStorage
    ? (async () => {
        await awaitNativeBridgeReady();
        for (const resource of schema.resources) {
          if (resource.isRemoteOnly) continue;
          try {
            await resolvedStorage.getRecord(resource.name, "__storage_probe__");
          } catch (err: any) {
            if (
              typeof err?.message === "string" &&
              err.message.includes("Store not found")
            ) {
              createClientError(
                "DFQL_INVALID",
                `Storage is missing object store for resource "${resource.name}". ` +
                  `Pass schema when creating IndexedDbStorageAdapter: ` +
                  `IndexedDbStorageAdapter.create({ dbName, schema })`,
                { path: "storage", resource: resource.name },
              );
            }
            throw err;
          }
        }
      })()
    : Promise.resolve();

  // Suppress unhandled rejection — the error is re-thrown when awaited in mutate/query.
  storageValidationPromise.catch(() => {});

  // For local-only mode, we'll lazily initialize hydration state on first query/mutation (CFG-002)
  // Must await storageValidationPromise first to avoid using a broken storage.
  const needsLocalOnlyInit =
    config.sync?.mode === "local-only" && resolvedStorage;
  const localOnlyInitPromise =
    needsLocalOnlyInit && resolvedStorage
      ? (async () => {
          await storageValidationPromise;
          // Mark all non-remote-only resources as ready
          // Must follow valid transitions: notStarted -> hydrating -> ready
          for (const resource of schema.resources) {
            if (!resource.isRemoteOnly) {
              await resolvedStorage.setHydrationState(
                resource.name,
                "hydrating",
              );
              await resolvedStorage.setHydrationState(resource.name, "ready");
            }
          }
        })()
      : Promise.resolve();

  // Suppress unhandled rejection — the error is re-thrown when awaited in mutate/query.
  localOnlyInitPromise.catch(() => {});

  // PROV-008: Initialize search provider at client startup when configured.
  // This promise is awaited by query/mutate/search so init failures surface deterministically.
  const searchProviderInitPromise = (async () => {
    if (!config.searchProvider?.initialize) return;
    if (isNativeBackedBridgeValue(config.searchProvider)) {
      await awaitNativeBridgeReady();
    }
    const resources = deriveSearchProviderResources(schema);
    await config.searchProvider.initialize({ resources });
  })();
  searchProviderInitPromise.catch(() => {});

  // Resolve remote adapter (CFG-001)
  let remote: DatafnRemoteAdapter;
  let extensionSubscriptionManager: ExtensionSubscriptionManager | undefined;
  let extensionEventUnsubscribe: (() => void) | undefined;

  if (config.sync?.remoteAdapter) {
    // Precedence 1: Use provided remoteAdapter
    remote = config.sync.remoteAdapter;
    const extAdapter = remote as any;

    if ("subscribeRemote" in extAdapter && "unsubscribeRemote" in extAdapter) {
      extensionSubscriptionManager = new ExtensionSubscriptionManager({
        subscribeRemote: extAdapter.subscribeRemote.bind(extAdapter),
        unsubscribeRemote: extAdapter.unsubscribeRemote.bind(extAdapter),
      });
    }

    // EXT-001: Wire inbound remote events if extension adapter supports it
    // Check if the adapter has onEvent capability (extension adapter)
    if ("onEvent" in extAdapter && typeof extAdapter.onEvent === "function") {
      extensionEventUnsubscribe = extAdapter.onEvent((delivery: { subscriptionId: string; event: any }) => {
        if (
          !extensionSubscriptionManager ||
          extensionSubscriptionManager.ownsSubscriptionId(delivery.subscriptionId)
        ) {
          // Emit only events for subscriptions owned by this client.
          eventBus.emit(delivery.event);
          return;
        }

        // Subscription responses and fanout events can arrive in the same tick.
        // Re-check after pending subscribe promises settle before dropping the event.
        setTimeout(() => {
          if (
            !extensionSubscriptionManager ||
            extensionSubscriptionManager.ownsSubscriptionId(delivery.subscriptionId)
          ) {
            eventBus.emit(delivery.event);
          }
        }, 0);
      });
    }
  } else if (config.sync?.remote) {
    // Precedence 2: Create DefaultHttpTransport from remote URL
    remote = new DefaultHttpTransport(config.sync.remote);
  } else {
    // Precedence 3: Create throwing adapter for local-only mode
    // This adapter should only be called if code violates routing invariants
    remote = {
      query: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      mutation: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      transact: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      seed: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      clone: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      pull: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      push: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
      reconcile: async () => {
        throw createClientError(
          "TRANSPORT_ERROR",
          "No remote adapter configured",
          { path: "sync" },
        );
      },
    };
  }

  // Create SyncEngine (for offline push)
  let syncEngine: SyncEngine | undefined;
  if (
    config.sync?.offlinability &&
    resolvedStorage &&
    resolvedSyncOwner !== "native"
  ) {
    syncEngine = new SyncEngine(
      resolvedStorage,
      remote,
      eventBus,
      config.clientId,
      schema,
      config.sync,
      config.plugins || [],
      getTimestamp,
      config.searchProvider,
    );
  }

  const schedulePush: MutationPushScheduler | undefined = nativeSyncController
    ? async () => {
        await awaitNativeBridgeReady();
        await nativeSyncController.schedulePush();
      }
    : syncEngine
      ? () => {
          syncEngine.schedulePush();
        }
      : undefined;

  // Create base sync facade
  const baseSync = createSyncFacade(
    remote,
    resolvedStorage,
    {
      schema: schema as DatafnSchema,
      storage: resolvedStorage,
      remote: config.sync?.remote ? remote : undefined,
      clientId: config.clientId,
      syncConfig: config.sync,
      eventBus,
      getTimestamp,
    },
    config.plugins || [],
    schema,
    eventBus,
    getTimestamp,
  );

  // Enhanced sync facade with start/stop/pullNow/cloneNow/reconcileNow
  const sync: SyncFacade & SyncControlMethods = {
    ...baseSync,
    async start() {
      if (nativeSyncController) {
        await awaitNativeBridgeReady();
        await nativeSyncController.start();
        return;
      }
      if (syncEngine) {
        await syncEngine.start();
      }
    },
    stop() {
      if (nativeSyncController) {
        void awaitNativeBridgeReady()
          .then(() => nativeSyncController.stop())
          .catch(() => {});
        return;
      }
      if (syncEngine) {
        syncEngine.stop();
      }
    },
    async pullNow() {
      if (nativeSyncController) {
        await awaitNativeBridgeReady();
        await nativeSyncController.pullNow();
        return;
      }
      if (syncEngine) {
        await syncEngine.pullNow();
      }
    },
    async cloneNow() {
      if (nativeSyncController) {
        await awaitNativeBridgeReady();
        await nativeSyncController.cloneNow();
        return;
      }
      if (syncEngine) {
        await syncEngine.cloneNow();
      }
    },
    async reconcileNow() {
      if (nativeSyncController) {
        await awaitNativeBridgeReady();
        await nativeSyncController.reconcileNow();
        return;
      }
      if (syncEngine) {
        await syncEngine.reconcileNow();
      }
    },
    async schedulePush() {
      if (schedulePush) {
        await schedulePush();
      }
    },
  };

  // Reserved keys that should not trigger table lookup (CLIENT-REG-002)
  const RESERVED_KEYS = new Set(["then", "toJSON", "inspect"]);

  // Client lifecycle state (CLN-001)
  let destroyed = false;
  let destroying = false;
  
  /**
   * Guard method to ensure client is not destroyed
   */
  const guardDestroyed = () => {
    if (destroyed || destroying) {
      throw createClientError(
        "DFQL_INVALID",
        "Client has been destroyed",
        { path: "client", context: "client lifecycle" }
      );
    }
  };

  const assertSearchNotAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) {
      throw createClientError(
        "DFQL_ABORTED",
        "Search request aborted",
        { path: "signal" },
      );
    }
  };

  const applySearchSelect = (
    record: Record<string, unknown>,
    select?: string[],
  ): Record<string, unknown> => {
    if (!select || select.length === 0) return record;
    const out: Record<string, unknown> = {};
    for (const field of select) {
      if (field in record) out[field] = record[field];
    }
    return out;
  };

  // Create debouncer for mutation debouncing (DEB-001)
  const debouncerMap = new DebouncerMap();

  // Create cross-tab relay if enabled (TAB-001)
  let crossTabRelay: CrossTabRelay | undefined;
  if (config.sync?.crossTab === true) {
    // Use clientId as namespace for the BroadcastChannel
    crossTabRelay = new CrossTabRelay(config.clientId, eventBus);

    // Subscribe to mutation_applied events and relay them to other tabs
    // Exclude: silent mutations (they don't emit events) and fromRemoteTab events (prevent echo)
    eventBus.subscribe((event) => {
      if (
        event.type === "mutation_applied" &&
        !(event as any).fromRemoteTab // Don't relay events from other tabs
      ) {
        crossTabRelay!.broadcast(event);
      }
    });
  }

  // Create the client object first (will add table() method after registry is created)
  // We cast to any initially because the mapped types are handled by Proxy
  const client: any = {
    table: null as any, // Will be set below

    /**
     * Execute a query (CLIENT-QUERY-001, CLIENT-OFFLINE-QUERY-001)
     */
    async query(q: unknown | unknown[]) {
      guardDestroyed();
      await awaitNativeBridgeReady();
      await searchProviderInitPromise;
      await storageValidationPromise; // STORAGE-INIT-001: fail fast if stores are missing
      await localOnlyInitPromise; // Ensure hydration state is ready in local-only mode
      return executeQuery(
        remote,
        q,
        resolvedStorage,
        config.plugins || [],
        schema,
        schemaIndex,
        nativeSyncConfig?.remoteMode,
      );
    },

    /**
     * Sync facade (CLIENT-SYNC-001, CLIENT-SYNC-APPLY-001)
     */
    sync,

    /**
     * Execute a transaction (CLIENT-TX-001)
     */
    async transact(payload: unknown) {
      guardDestroyed();
      return executeTransact(remote, payload, awaitNativeBridgeReady);
    },

    /**
     * Execute a mutation (CLIENT-MUT-001, CLIENT-OFFLINE-MUT-001)
     */
    async mutate(mutation: unknown | unknown[]) {
      guardDestroyed();
      await awaitNativeBridgeReady();
      await searchProviderInitPromise;
      await storageValidationPromise; // STORAGE-INIT-001: fail fast if stores are missing
      await localOnlyInitPromise; // Ensure hydration state is ready in local-only mode
      return executeMutation(
        remote,
        eventBus,
        getTimestamp,
        mutation,
        resolvedStorage,
        config.plugins || [],
        schema,
        schedulePush,
        config.sync?.offlinability,
        config.clientId,
        debouncerMap,
        config.searchProvider,
      );
    },

    /**
     * Subscribe to events
     */
    subscribe(handler: EventHandler, filter?: EventFilter) {
      guardDestroyed();
      const localUnsub = eventBus.subscribe(handler, filter);

      // EXT-001: If using extension adapter with subscription manager, register with remote
      if (extensionSubscriptionManager) {
        let remoteUnsub: (() => Promise<void>) | undefined;
        let unsubscribed = false;

        // Register with remote subscription manager (async)
        extensionSubscriptionManager
          .registerSubscriber(filter)
          .then((unsub) => {
            if (unsubscribed || destroying || destroyed) {
              unsub().catch((err) => {
                console.error("Failed to unsubscribe from remote:", err);
              });
              return;
            }
            remoteUnsub = unsub;
          })
          .catch((err) => {
            if (!unsubscribed) {
              console.error("Failed to register remote subscription:", err);
            }
          });

        // Return combined unsubscribe that cleans up both local and remote
        return () => {
          if (unsubscribed) {
            return;
          }
          unsubscribed = true;
          localUnsub();
          if (remoteUnsub) {
            remoteUnsub().catch((err) => {
              console.error("Failed to unsubscribe from remote:", err);
            });
          }
        };
      }

      return localUnsub;
    },

    /**
     * Tear down client: stop sync, close connections, unsubscribe all, release resources (CLN-001)
     */
    async destroy() {
      if (destroyed || destroying) return;
      destroying = true;

      try {
        // 1. Flush all pending debounced mutations (DEB-001)
        await debouncerMap.flushAll();

        // 2. Stop sync engine
        if (nativeSyncController) {
          try {
            await awaitNativeBridgeReady();
            await nativeSyncController.stop();
          } catch {
            // Best-effort cleanup if the bridge is already unavailable.
          }
        } else if (syncEngine) {
          syncEngine.stop();
        }

        // 3. Dispose all signals
        signalRegistry.disposeAll();

        // 4. Close cross-tab relay (TAB-001)
        if (crossTabRelay) {
          crossTabRelay.close();
        }

        // 5. Close extension subscriptions and event listeners
        if (extensionSubscriptionManager) {
          try {
            await extensionSubscriptionManager.closeAll();
          } catch {
            // Best-effort cleanup: do not block destroy()
          }
        }
        extensionEventUnsubscribe?.();

        // 6. Clear event bus
        eventBus.clear();

        // 7. Close storage
        if (resolvedStorage) {
          await resolvedStorage.close();
        }

        // 8. Dispose search provider (best-effort)
        if (config.searchProvider?.dispose) {
          try {
            await config.searchProvider.dispose();
          } catch {
            // Best-effort cleanup: do not block destroy()
          }
        }
      } finally {
        // Mark the client unusable even if a cleanup step throws.
        destroyed = true;
        destroying = false;
      }
    },

    /**
     * Wipe all local data (CLN-002)
     */
    async clear() {
      guardDestroyed();
      await awaitNativeBridgeReady();
      
      if (resolvedStorage) {
        // 1. Clear all data
        await resolvedStorage.clearAll();
        
        // 2. Reset hydration states
        // clearAll() already cleared the hydration state metadata, so all resources
        // are implicitly back to "notStarted" (the default)
        // No need to explicitly set them
      }
    },

    /**
     * Flush a specific debounced mutation immediately (DEB-001)
     */
    async flush(key?: string) {
      guardDestroyed();
      if (key !== undefined) {
        await debouncerMap.flush(key);
      }
    },

    /**
     * Flush all pending debounced mutations immediately (DEB-001)
     */
    async flushAll() {
      guardDestroyed();
      await debouncerMap.flushAll();
    },

    /**
     * Export all local records as structured JSON (EXP-001)
     */
    async exportData(options?: { resources?: string[] }): Promise<DatafnExportPayload> {
      guardDestroyed();
      await awaitNativeBridgeReady();
      
      if (!resolvedStorage) {
        throw createClientError(
          "DFQL_INVALID",
          "Export requires storage adapter",
          { path: "exportData", context: "exportData" }
        );
      }
      
      return exportData(resolvedStorage, schema, options);
    },

    /**
     * Import records from a structured JSON payload (EXP-002)
     */
    async importData(
      data: DatafnExportPayload, 
      options?: { triggerCloneUp?: boolean }
    ): Promise<DatafnImportResult> {
      guardDestroyed();
      await awaitNativeBridgeReady();
      
      if (!resolvedStorage) {
        throw createClientError(
          "DFQL_INVALID",
          "Import requires storage adapter",
          { path: "importData", context: "importData" }
        );
      }
      
      return importData(resolvedStorage, schema, sync, data, options);
    },

    async search(params: unknown): Promise<unknown> {
      guardDestroyed();
      await awaitNativeBridgeReady();
      await searchProviderInitPromise;

      if (typeof params !== "object" || params === null || Array.isArray(params)) {
        throw createClientError(
          "DFQL_INVALID",
          "Search query must not be empty",
          { path: "query" },
        );
      }

      const raw = params as Record<string, unknown>;
      if (typeof raw.query !== "string") {
        throw createClientError(
          "DFQL_INVALID",
          "Search query must not be empty",
          { path: "query" },
        );
      }
      const query = raw.query.trim();
      if (query === "") {
        throw createClientError(
          "DFQL_INVALID",
          "Search query must not be empty",
          { path: "query" },
        );
      }
      if (query.length > 1000) {
        throw createClientError(
          "LIMIT_EXCEEDED",
          "Search query exceeds maximum length",
          { path: "query" },
        );
      }

      if (raw.resources !== undefined) {
        if (!Array.isArray(raw.resources)) {
          throw createClientError(
            "DFQL_INVALID",
            "Invalid request: resources must be an array",
            { path: "resources" },
          );
        }
        if (raw.resources.length > 50) {
          throw createClientError(
            "LIMIT_EXCEEDED",
            "Too many resources in search request",
            { path: "resources" },
          );
        }
      }

      if (raw.filters !== undefined && (typeof raw.filters !== "object" || raw.filters === null || Array.isArray(raw.filters))) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: filters must be an object",
          { path: "filters" },
        );
      }

      if (
        raw.limit !== undefined &&
        (typeof raw.limit !== "number" || !Number.isFinite(raw.limit) || raw.limit < 1)
      ) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: limit must be a positive number",
          { path: "limit" },
        );
      }
      if (
        raw.limitPerResource !== undefined &&
        (typeof raw.limitPerResource !== "number" || !Number.isFinite(raw.limitPerResource) || raw.limitPerResource < 1)
      ) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: limitPerResource must be a positive number",
          { path: "limitPerResource" },
        );
      }

      if (raw.prefix !== undefined && typeof raw.prefix !== "boolean") {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: prefix must be boolean",
          { path: "prefix" },
        );
      }
      if (
        raw.fuzzy !== undefined &&
        typeof raw.fuzzy !== "boolean" &&
        (typeof raw.fuzzy !== "number" || !Number.isFinite(raw.fuzzy) || raw.fuzzy < 0)
      ) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: fuzzy must be boolean or a non-negative number",
          { path: "fuzzy" },
        );
      }
      if (raw.fieldBoosts !== undefined) {
        const fieldBoostsValue = raw.fieldBoosts;
        const isPlainObject =
          typeof fieldBoostsValue === "object" &&
          fieldBoostsValue !== null &&
          !Array.isArray(fieldBoostsValue) &&
          (Object.getPrototypeOf(fieldBoostsValue) === Object.prototype ||
            Object.getPrototypeOf(fieldBoostsValue) === null);
        if (!isPlainObject) {
          throw createClientError(
            "DFQL_INVALID",
            "Invalid request: fieldBoosts must be an object",
            { path: "fieldBoosts" },
          );
        }
        const entries = Object.entries(fieldBoostsValue as Record<string, unknown>);
        if (entries.length > 100) {
          throw createClientError(
            "LIMIT_EXCEEDED",
            "Too many fieldBoosts entries in search request",
            { path: "fieldBoosts" },
          );
        }
        for (const [field, value] of entries) {
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            throw createClientError(
              "DFQL_INVALID",
              "Invalid request: fieldBoosts values must be finite positive numbers",
              { path: `fieldBoosts.${field}` },
            );
          }
        }
      }

      if (
        raw.source !== undefined &&
        raw.source !== "auto" &&
        raw.source !== "local" &&
        raw.source !== "remote"
      ) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid request: source must be one of auto, local, remote",
          { path: "source" },
        );
      }

      const limit = Math.min(
        typeof raw.limit === "number" ? raw.limit : 50,
        10_000,
      );
      const limitPerResource = Math.min(
        typeof raw.limitPerResource === "number" ? raw.limitPerResource : limit,
        1_000,
      );
      const resources = Array.isArray(raw.resources) ? (raw.resources as string[]) : undefined;
      const fields = Array.isArray(raw.fields) ? (raw.fields as string[]) : undefined;
      const prefix = raw.prefix as boolean | undefined;
      const fuzzy = raw.fuzzy as boolean | number | undefined;
      const fieldBoosts = raw.fieldBoosts as Record<string, number> | undefined;
      const source = (raw.source ?? "auto") as "auto" | "local" | "remote";
      const signal = raw.signal as AbortSignal | undefined;
      assertSearchNotAborted(signal);

      const hasRemote = !!(config.sync?.remote || config.sync?.remoteAdapter);
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const hasLocalSearch = typeof config.searchProvider?.searchAll === "function";

      const runRemoteSearch = async (): Promise<unknown> => {
        if (typeof (remote as any).search === "function") {
          return (remote as any).search({
            ...raw,
            query,
            limit,
            limitPerResource,
            signal,
          });
        }
        throw createClientError(
          "DFQL_UNSUPPORTED",
          "Remote adapter does not support search",
          { path: "search" },
        );
      };

      const runLocalSearch = async (): Promise<{ results: Array<{ id: string; resource: string; score: number; data: Record<string, unknown> }> }> => {
        const searchAll = config.searchProvider?.searchAll;
        if (!searchAll) {
          throw createClientError(
            "DFQL_UNSUPPORTED",
            "Local search unavailable",
            { path: "source" },
          );
        }
        await storageValidationPromise;
        await localOnlyInitPromise;
        const candidates = await (searchAll as any)({
          query,
          resources,
          fields,
          limit,
          limitPerResource,
          prefix,
          fuzzy,
          fieldBoosts,
          signal,
        });
        assertSearchNotAborted(signal);

        const filters =
          typeof raw.filters === "object" && raw.filters !== null && !Array.isArray(raw.filters)
            ? (raw.filters as Record<string, Record<string, unknown>>)
            : undefined;
        const select = Array.isArray(raw.select) ? (raw.select as string[]) : undefined;
        const results: Array<{ id: string; resource: string; score: number; data: Record<string, unknown> }> = [];

        for (const candidate of candidates) {
          assertSearchNotAborted(signal);
          const resource = String(candidate.resource);
          const id = String(candidate.id);
          let row: Record<string, unknown> | null = null;
          if (resolvedStorage) {
            row = await resolvedStorage.getRecord(resource, id);
            if (!row) continue;
            const resourceFilter = filters?.[resource];
            if (resourceFilter && !coreEvaluateFilter(row, resourceFilter)) {
              continue;
            }
          }
          results.push({
            id,
            resource,
            score: candidate.score,
            data: row ? applySearchSelect(row, select) : {},
          });
        }

        results.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });

        return { results: results.slice(0, limit) };
      };

      if (source === "local") {
        if (!hasLocalSearch) {
          throw createClientError(
            "DFQL_UNSUPPORTED",
            "Local search unavailable",
            { path: "source" },
          );
        }
        return runLocalSearch();
      }

      if (source === "remote") {
        if (!hasRemote || isOffline || typeof (remote as any).search !== "function") {
          throw createClientError(
            "DFQL_UNSUPPORTED",
            "Remote search unavailable",
            { path: "source" },
          );
        }
        return runRemoteSearch();
      }

      if (hasLocalSearch) {
        return runLocalSearch();
      }
      if (hasRemote && !isOffline) {
        return runRemoteSearch();
      }

      throw createClientError(
        "DFQL_UNSUPPORTED",
        "Search unavailable offline without search provider",
        { path: "search" },
      );
    },

    /**
     * Check storage health and verify hydration state consistency (HEAL-001)
     */
    async checkHealth(): Promise<{ ok: boolean; issues: string[]; action?: "none" | "reclone" }> {
      guardDestroyed();
      await awaitNativeBridgeReady();
      
      // Wait for local-only init to complete
      await localOnlyInitPromise;
      
      if (!resolvedStorage) {
        return { ok: true, issues: [], action: "none" };
      }

      // 1. Check storage health
      const storageHealth = await resolvedStorage.healthCheck();
      const issues = [...storageHealth.issues];

      // 2. Check hydration state consistency
      for (const resource of schema.resources) {
        if (resource.isRemoteOnly) continue;
        
        const state = await resolvedStorage.getHydrationState(resource.name);
        
        // Detect stuck hydrating state
        // Note: We don't have a reliable way to check if sync is actively cloning,
        // so we detect this as a potential issue but not a hard failure.
        // In production, this would need coordination with SyncEngine state.
        if (state === "hydrating") {
          issues.push(`Resource ${resource.name} is in hydrating state (may be stuck)`);
        }
      }

      const action = issues.length > 0 ? "reclone" : "none";
      return { ok: issues.length === 0, issues, action };
    },
  };

  // Create signal registry (CLIENT-SIGNAL-001, SIG-002)
  const signalRegistry = new SignalRegistry(client, eventBus, schema);

  // Create table registry with client and signal registry (CLIENT-REG-001)
  const registry = new TableRegistry<S>(
    schema as S,
    client as any,
    signalRegistry,
    generateId,
  );

  // Set table method now that registry exists
  (client as any).table = (name: string) => registry.getTable(name);

  // Create KV API (KV-002)
  const kvTable = registry.getTable(KV_RESOURCE_NAME);
  const kvApi = createKvApi({
    storage: resolvedStorage,
    kvTable,
    eventBus,
    clientId: config.clientId,
    debouncerMap,
  });
  (client as any).kv = kvApi;

  // Wrap client in Proxy for table property access (CLIENT-REG-001, CLIENT-REG-002)
  return new Proxy(client, {
    get(target, prop) {
      // Handle reserved keys - return undefined without throwing
      if (typeof prop === "string" && RESERVED_KEYS.has(prop)) {
        return undefined;
      }

      // If property exists on target, return it
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      // Check if it's a table name
      if (typeof prop === "string") {
        return registry.getTable(prop);
      }

      return undefined;
    },
  }) as DatafnClient<S>;
}

/**
 * Create a DataFn client with built-in context switching.
 *
 * The returned client is a stable Proxy reference that always delegates to the
 * current underlying client. Use `switchContext()` to switch auth, sync mode,
 * or storage without replacing the reference. Use `subscribeClient()` to react
 * to switches (e.g. to recreate signals in framework adapters).
 */
export function createDatafnClient<S extends DatafnSchema>(
  config: DatafnClientConfig<S>,
): DatafnClient<S> {
  let realClient = _buildRawClient(config);
  let currentConfig = config;
  let isDestroyed = false;
  let switchInProgress = false;
  let switchQueue: Array<{
    overrides: SwitchContextOverride;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  const subscribers = new Set<(c: DatafnClient<S>) => void>();

  const liveRegistry = new LiveSignalRegistry();

  // Cache of wrapped table handles, keyed by table name.
  // Ensures `client.table("task") === client.task` (identity preserved across calls).
  const wrappedTableCache = new Map<string, DatafnTable<S, any>>();
  // Cached wrapped KV handle (singleton per client proxy).
  let wrappedKv: DatafnKvApi | null = null;

  // Return a cached wrapped table handle for `tableName`.
  // The handle intercepts .signal() to return LiveSignals; all other props delegate
  // dynamically to the current realClient's raw table (so they remain correct after
  // performSwitch reassigns realClient).
  //
  // CRITICAL: factory closures capture `realClient` by reference (the `let` variable).
  // After performSwitch reassigns realClient, re-calling factory() uses the new client.
  // Do NOT destructure or snapshot realClient into a local const inside the factory.
  function getOrCreateWrappedTable(tableName: string): DatafnTable<S, any> {
    const cached = wrappedTableCache.get(tableName);
    if (cached) return cached;

    // Validate the table name upfront — throws DFQL_UNKNOWN_RESOURCE if not in schema.
    // This preserves the same eager-throw behavior as direct realClient.table() calls.
    realClient.table(tableName);

    const wrapped = new Proxy(Object.create(null), {
      get(_proxyTarget, prop) {
        if (prop === "signal") {
          return (query: unknown, options?: { disableOptimistic?: boolean }) => {
            const currentRawTable = realClient.table(tableName);
            const version = (currentRawTable as any).version as number;
            const factory = () => realClient.table(tableName).signal(query as any, options);
            return liveRegistry.getOrCreateTableSignal(tableName, version, query, options, factory);
          };
        }
        // Delegate all other property accesses to the current realClient's raw table.
        // This ensures non-signal methods (mutate, query, subscribe) are always bound
        // to the current underlying client, not a stale snapshot.
        return (realClient.table(tableName) as any)[prop];
      },
    }) as DatafnTable<S, any>;

    wrappedTableCache.set(tableName, wrapped);
    return wrapped;
  }

  function getOrCreateWrappedKv(): DatafnKvApi {
    if (!wrappedKv) {
      wrappedKv = new Proxy(Object.create(null), {
        get(_proxyTarget, prop) {
          if (prop === "signal") {
            return (key: string, options?: { defaultValue?: unknown }) => {
              const factory = () => realClient.kv.signal(key, options);
              return liveRegistry.getOrCreateKvSignal(key, factory);
            };
          }
          return (realClient.kv as any)[prop];
        },
      }) as DatafnKvApi;
    }
    return wrappedKv;
  }

  function isTableLike(val: unknown): val is DatafnTable<S, any> {
    return (
      val !== null &&
      typeof val === "object" &&
      typeof (val as any).signal === "function" &&
      typeof (val as any).query === "function" &&
      typeof (val as any).name === "string" &&
      typeof (val as any).version === "number"
    );
  }

  // outer is declared with let so closures can reference it before assignment
  let outer: DatafnClient<S>;

  async function performSwitch(overrides: SwitchContextOverride): Promise<void> {
    const previousClient = realClient;
    const newConfig: DatafnClientConfig<S> = {
      ...currentConfig,
      ...(overrides.namespace !== undefined ? { namespace: overrides.namespace } : {}),
      ...(overrides.sync !== undefined ? { sync: overrides.sync } : {}),
      ...(overrides.storage !== undefined ? { storage: overrides.storage } : {}),
    };
    let nextClient: DatafnClient<S> | undefined;

    try {
      nextClient = _buildRawClient(newConfig);
      if (newConfig.sync?.mode === "sync") {
        await nextClient.sync.start();
      }
    } catch (error) {
      if (nextClient) {
        await nextClient.destroy().catch(() => {});
      }
      throw error;
    }

    currentConfig = newConfig;
    realClient = nextClient;

    // Rebind all LiveSignals to the new realClient BEFORE notifying subscribers (PROXY-006).
    // Ordering is critical: factories use the updated realClient, and subscribers see rebound signals.
    liveRegistry.rebindAll();

    // Notify subscribers with the stable outer proxy
    for (const fn of subscribers) {
      fn(outer);
    }

    try {
      await previousClient.destroy();
    } catch {
      // Best-effort cleanup: the new client is already active.
    }
  }

  async function drainQueuedSwitches(): Promise<void> {
    while (switchQueue.length > 0) {
      const next = switchQueue.shift();
      if (!next) continue;

      try {
        await performSwitch(next.overrides);
        next.resolve();
      } catch (error) {
        next.reject(error);
      }
    }
  }

  function rejectQueuedSwitches(error: unknown): void {
    while (switchQueue.length > 0) {
      const next = switchQueue.shift();
      next?.reject(error);
    }
  }

  async function switchContextFn(overrides: SwitchContextOverride): Promise<void> {
    if (isDestroyed) {
      throw createClientError("DFQL_INVALID", "Cannot switch context on a destroyed client", { path: "client" });
    }

    if (switchInProgress) {
      return new Promise<void>((resolve, reject) => {
        switchQueue.push({ overrides, resolve, reject });
      });
    }

    switchInProgress = true;
    try {
      await performSwitch(overrides);
      await drainQueuedSwitches();
    } catch (error) {
      rejectQueuedSwitches(error);
      throw error;
    } finally {
      switchInProgress = false;
    }
  }

  function currentNamespaceFn(): string | undefined {
    return currentConfig.namespace;
  }

  function subscribeClientFn(fn: (c: DatafnClient<S>) => void): () => void {
    subscribers.add(fn);
    fn(outer); // Fire immediately with current (stable) proxy
    return () => subscribers.delete(fn);
  }

  async function destroyFn(): Promise<void> {
    // Wait for any in-progress switch to complete
    while (switchInProgress) {
      await new Promise<void>(r => setTimeout(r, 10));
    }
    switchQueue = [];
    isDestroyed = true;
    subscribers.clear();
    liveRegistry.disposeAll(); // PROXY-007: dispose all LiveSignals before destroying underlying client
    return realClient.destroy();
  }

  outer = new Proxy(function () {} as unknown as DatafnClient<S>, {
    get(_target, prop) {
      if (prop === "switchContext") return switchContextFn;
      if (prop === "currentNamespace") return currentNamespaceFn;
      if (prop === "subscribeClient") return subscribeClientFn;
      if (prop === "destroy") return destroyFn;

      if (prop === "table") {
        return (name: string) => getOrCreateWrappedTable(name);
      }

      if (prop === "kv") {
        return getOrCreateWrappedKv();
      }

      const val = (realClient as any)[prop];

      if (isTableLike(val)) {
        return getOrCreateWrappedTable((val as any).name);
      }

      // Bind functions to realClient so 'this' is correct if ever needed
      if (typeof val === "function") return val.bind(realClient);
      return val;
    },
    has(_target, prop) {
      return (
        prop === "switchContext" ||
        prop === "currentNamespace" ||
        prop === "subscribeClient" ||
        prop in realClient
      );
    },
    ownKeys(_target) {
      return [...Reflect.ownKeys(realClient), "switchContext", "currentNamespace", "subscribeClient"];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop === "switchContext" || prop === "currentNamespace" || prop === "subscribeClient") {
        return { configurable: true, enumerable: true, writable: true, value: undefined };
      }
      return Object.getOwnPropertyDescriptor(realClient, prop);
    },
  }) as DatafnClient<S>;

  return outer;
}
