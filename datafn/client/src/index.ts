/**
 * @datafn/client public API
 */

export {
  createDatafnClient,
  type DatafnClient,
  type DatafnClientConfig,
  type DatafnSyncConfig,
  type DatafnSyncOwner,
  type DatafnNativeRemoteMode,
  type DatafnNativeHandshakeRequest,
  type DatafnNativeHandshakeResult,
  type DatafnNativeSyncConfig,
  type DatafnNativeSyncController,
  type DatafnBridgeEventEnvelope,
  type DatafnRemoteAdapter,
  type DatafnSearchParams,
  type DatafnSearchResult,
  type SwitchContextOverride,
  type DatafnResourceCountsSignalInput,
  type DatafnRelationCountsSignalInput,
  type DatafnRecordsByIdsSignalInput,
} from "./client.js";
export type {
  DatafnTemporalApi,
  RecordTimezoneChangeInput,
  DatafnTemporalChangeSource,
} from "./temporal.js";

export { EventBus, type EventHandler } from "./events/bus.js";
export { matchesFilter, type EventFilter } from "./events/filter.js";
export {
  type DatafnClientError,
  throwClientError,
  /** Alias for throwClientError */
  createClientError,
} from "./errors.js";
export { unwrapRemoteSuccess } from "./remote/unwrap.js";
export { type DatafnTable } from "./tables/table.js";
export { type PermissionEntry } from "./query.js";
export { type SyncControlMethods } from "./sync.js";
export type {
  DatafnSyncMode,
  DatafnSyncPhase,
  DatafnSyncStatus,
  DatafnSyncStatusKind,
} from "./sync/status.js";
export { combineSignals, emptySignal, mapSignal } from "./signals/derived.js";
export type { CombineSignalsOptions } from "./signals/derived.js";
export type {
  DatafnSignalCacheOptions,
  DatafnSignalOptions,
} from "./signals/options.js";
export type {
  DatafnHttpHeaders,
  DatafnHttpTransportOptions,
} from "./transport/http.js";
export { createDatafnPublicLinkAuthPlugin } from "./auth.js";
export type {
  CreateDatafnPublicLinkInput,
  DatafnPublicLinkGrant,
  DatafnPublicLinkShareLevel,
  DatafnPublicLinkShareScope,
  DatafnPublicLinksApi,
  DatafnResolvedPublicLink,
} from "./public-links.js";
export {
  type DatafnStorageAdapter,
  type DatafnStorageFactory,
  type DatafnHydrationState,
  type DatafnChangelogEntry,
} from "./storage.js";

// Re-export namespace helper from core
export { ns, time, temporal } from "@datafn/core";
export type {
  DatafnSignal,
  DatafnTemporalScale,
  DatafnTemporalStorage,
  DatafnTemporalRangeInput,
  DatafnTemporalLocalTimeInput,
  DatafnTemporalDateParts,
  DatafnTemporalPeriodInput,
  DatafnTemporalGroupInput,
  DatafnTemporalBucketInput,
  DatafnTemporalClause,
  DatafnTemporalConfig,
  DatafnTemporalTimezoneResolver,
  DatafnTimezoneChangeRecord,
} from "@datafn/core";
export {
  createTimezoneResolver,
  resolveTemporalDateParts,
  resolveTemporalLocalTime,
  resolveTemporalBucketKey,
  resolveTemporalPeriodRange,
  resolveTemporalInputMs,
  toTemporalStorageValue,
} from "@datafn/core";

// CloneUp types
export type { CloneUpOptions, CloneUpResult } from "./sync/cloneUp.js";

export type { DatafnE2eeConfig, DatafnE2eeProvider } from "./e2ee.js";

// Storage Adapters
export { MemoryStorageAdapter } from "./adapters/memoryStorage.js";
export { IndexedDbStorageAdapter } from "./adapters/indexedDbStorage.js";

// KV API
export type { DatafnKvApi } from "./kv.js";
export { kvId, KV_RESOURCE_NAME } from "./kv.js";
export {
  TIMEZONE_CHANGE_RESOURCE_NAME,
  TIMEZONE_CHANGE_ID_PREFIX,
  timezoneChangeId,
  createTemporalPlugin,
} from "@datafn/core";

// Date Codec (CODEC-001)
export {
  serializeDateFields,
  parseDateFields,
  parseQueryResultDates,
} from "./codecs/date.js";
export * from "./extension/index.js";
