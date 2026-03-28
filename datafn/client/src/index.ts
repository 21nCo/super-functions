/**
 * @datafn/client public API
 */

export {
  createDatafnClient,
  type DatafnClient,
  type DatafnClientConfig,
  type DatafnRemoteAdapter,
  type SwitchContextOverride,
} from "./client.js";

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
export {
  type DatafnStorageAdapter,
  type DatafnStorageFactory,
  type DatafnHydrationState,
  type DatafnChangelogEntry,
} from "./storage.js";

// Re-export namespace helper from core
export { ns } from "@datafn/core";

// CloneUp types
export type { CloneUpOptions, CloneUpResult } from "./sync/cloneUp.js";

// Storage Adapters
export { MemoryStorageAdapter } from "./adapters/memoryStorage.js";
export { IndexedDbStorageAdapter } from "./adapters/indexedDbStorage.js";

// KV API
export type { DatafnKvApi } from "./kv.js";
export { kvId, KV_RESOURCE_NAME } from "./kv.js";

// Date Codec (CODEC-001)
export {
  serializeDateFields,
  parseDateFields,
  parseQueryResultDates,
} from "./codecs/date.js";
