/**
 * @datafn/client public API
 */

export {
  createDatafnClient,
  type DatafnClient,
  type DatafnClientConfig,
  type DatafnRemoteAdapter,
} from "./client.js";
export { EventBus, type EventHandler } from "./events/bus.js";
export { matchesFilter, type EventFilter } from "./events/filter.js";
export { type DatafnClientError, createClientError } from "./errors.js";
export { unwrapRemoteSuccess } from "./remote/unwrap.js";
export { type DatafnTable } from "./tables/table.js";
export {
  type DatafnStorageAdapter,
  type DatafnHydrationState,
  type DatafnChangelogEntry,
} from "./storage.js";

// Storage Adapters
export { MemoryStorageAdapter } from "./adapters/memoryStorage.js";
export { IndexedDbStorageAdapter } from "./adapters/indexedDbStorage.js";
