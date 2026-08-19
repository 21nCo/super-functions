/**
 * Query Signal Implementation
 *
 * Reactive query signals with caching, lazy fetch, and auto-refresh on mutations.
 */

import type { DatafnSignal, DatafnError, DatafnSchema } from "@datafn/core";
import {
  dfqlKey,
  endpointList,
  findRelationMatch,
  relationTargetEndpoint,
} from "@datafn/core";
import type { EventBus } from "../events/bus.js";
import type { DatafnSignalOptions } from "./options.js";

/**
 * Signal registry for caching signals by dfqlKey
 */
export class SignalRegistry {
  private signals = new Map<string, DatafnSignal<any>>();
  private client: any;
  private eventBus: EventBus;
  private schema: DatafnSchema;

  constructor(client: any, eventBus: EventBus, schema: DatafnSchema) {
    this.client = client;
    this.eventBus = eventBus;
    this.schema = schema;
  }

  getSignal<T>(fullQuery: unknown, options?: DatafnSignalOptions): DatafnSignal<T> {
    const key = dfqlKey(fullQuery);

    // Return cached signal if exists
    if (this.signals.has(key)) {
      return this.signals.get(key) as DatafnSignal<T>;
    }

    // Create new signal
    const signal = createQuerySignal<T>(
      this.client,
      this.eventBus,
      this.schema,
      fullQuery,
      key,
      () => this.removeSignal(key),
      options,
    );
    this.signals.set(key, signal);
    return signal;
  }

  /**
   * Remove a signal from the registry (called by signal.dispose())
   */
  private removeSignal(key: string): void {
    this.signals.delete(key);
  }

  /**
   * Dispose all signals in the registry
   */
  disposeAll(): void {
    // Create array copy to avoid iterator invalidation
    const signalsToDispose = Array.from(this.signals.values());
    signalsToDispose.forEach((signal) => signal.dispose());
    // signals.clear() not needed - dispose() removes each signal
  }
}

/**
 * Derive the footprint (set of resources) that affect a query signal (SIG-002)
 *
 * Footprint includes:
 * - Primary resource from query
 * - Resources referenced by relation expansion tokens in select array (via schema lookup)
 *
 * Relation expansion tokens are parsed for patterns like:
 * - "relationName.*" (expand all fields)
 * - "relationName.field" (expand specific field)
 */
function deriveQueryFootprint(query: any, schema: DatafnSchema): Set<string> {
  const footprint = new Set<string>();

  // Add primary resource
  if (query.resource) {
    footprint.add(query.resource);
  }

  // Parse select array for relation expansion tokens
  if (Array.isArray(query.select) && schema.relations) {
    for (const token of query.select) {
      if (typeof token === "string" && token.includes(".")) {
        const relationName = token.split(".")[0];
        const match = findRelationMatch(schema, query.resource, relationName);
        if (match) {
          endpointList(relationTargetEndpoint(match.relation, match.direction))
            .filter((resource) => resource !== query.resource)
            .forEach((resource) => footprint.add(resource));
        }
      }
    }
  }

  return footprint;
}

/**
 * Extract record IDs from a query result (SIG-002)
 */
function extractRecordIds(result: any): Set<string> | null {
  const ids = new Set<string>();
  
  // Handle result with data array (standard query result)
  if (result && Array.isArray(result.data)) {
    for (const record of result.data) {
      if (record && typeof record.id === "string") {
        ids.add(record.id);
      }
    }
    return ids.size > 0 ? ids : null;
  }
  
  // Handle direct array result (some queries may return arrays directly)
  if (Array.isArray(result)) {
    for (const record of result) {
      if (record && typeof record.id === "string") {
        ids.add(record.id);
      }
    }
    return ids.size > 0 ? ids : null;
  }
  
  // Single record result
  if (result && typeof result.id === "string") {
    ids.add(result.id);
    return ids;
  }
  
  return null;
}

/**
 * Apply optimistic patch to signal cache (SIG-003)
 * 
 * Attempts to patch cached records with mutation data without re-fetching.
 * Returns the patched value if successful, null if patching is not possible.
 */
function applyOptimisticPatch(currentValue: any, event: any): any | null {
  // Only handle merge operations with record data
  if (event.action !== "merge" || !event.record) {
    return null;
  }
  
  // Extract mutation IDs
  const mutationIds = event.ids;
  if (!mutationIds || !Array.isArray(mutationIds) || mutationIds.length === 0) {
    return null;
  }
  
  // Handle result with data array (standard query result format)
  if (currentValue && Array.isArray(currentValue.data)) {
    let patched = false;
    const patchedData = currentValue.data.map((record: any) => {
      if (record && typeof record.id === "string" && mutationIds.includes(record.id)) {
        patched = true;
        // Shallow merge: spread existing record, then apply mutation fields
        return { ...record, ...event.record };
      }
      return record;
    });
    
    if (!patched) {
      // No records were patched (IDs not found in cache)
      return null;
    }
    
    // Return new result object with patched data
    return {
      ...currentValue,
      data: patchedData,
    };
  }
  
  // Handle direct array result
  if (Array.isArray(currentValue)) {
    let patched = false;
    const patchedArray = currentValue.map((record: any) => {
      if (record && typeof record.id === "string" && mutationIds.includes(record.id)) {
        patched = true;
        return { ...record, ...event.record };
      }
      return record;
    });
    
    if (!patched) {
      return null;
    }
    
    return patchedArray;
  }
  
  // Handle single record result
  if (currentValue && typeof currentValue.id === "string" && mutationIds.includes(currentValue.id)) {
    return { ...currentValue, ...event.record };
  }
  
  // Unknown format or no match
  return null;
}

function hasMembershipSensitiveQueryShape(query: any): boolean {
  return Boolean(
    query?.filters ||
      query?.search ||
      query?.sort ||
      query?.limit ||
      query?.offset ||
      query?.count
  );
}

/**
 * Create a reactive query signal
 */
function createQuerySignal<T>(
  client: any,
  eventBus: EventBus,
  schema: DatafnSchema,
  fullQuery: any,
  signalKey: string,
  removeFromRegistry: () => void,
  options?: DatafnSignalOptions,
): DatafnSignal<T> {
  let currentValue: T | undefined;
  let currentCursor: string | null = null;
  const subscribers = new Set<(value: T) => void>();
  let inFlight = false;
  let isRefresh = false;
  let queuedRefresh = false;
  let currentError: DatafnError | null = null;
  const resource = fullQuery.resource;
  let disposed = false;
  let unsubscribeFn: (() => void) | null = null;

  // Track cached record IDs for fine-grained invalidation (SIG-002)
  let cachedIds: Set<string> | null = null;

  // Optimistic update option (SIG-003)
  const disableOptimistic = options?.disableOptimistic ?? false;

  // Helper to notify all subscribers (notify on any state change, not just value change)
  const notifySubscribers = () => {
    subscribers.forEach((fn) => fn(currentValue as T));
  };

  const fetchQuery = async (refresh = false): Promise<void> => {
    if (inFlight) {
      // Queue a refresh to happen after current fetch completes
      if (refresh) {
        queuedRefresh = true;
      }
      return;
    }

    inFlight = true;
    isRefresh = refresh;
    queuedRefresh = false;
    // Clear error when starting a new fetch
    if (!refresh) {
      currentError = null;
    }

    try {
      const result = await client.query(fullQuery);
      // Unwrap pagination envelope: emit the record array directly
      const queryResult = result as { data?: any[]; nextCursor?: string | null };
      currentValue = (queryResult.data ?? result) as T;
      currentCursor = queryResult.nextCursor ?? null;
      currentError = null;

      // Extract and cache record IDs from result (SIG-002)
      cachedIds = extractRecordIds(currentValue);

      // Clear flight flags BEFORE notifying so loading/refreshing read correctly
      inFlight = false;
      isRefresh = false;

      notifySubscribers();
    } catch (error: any) {
      // Convert error to DatafnError format
      const dfError: DatafnError = {
        code: error?.code || "INTERNAL",
        message: error?.message || "Query failed",
        details: error?.details,
      };

      if (!refresh) {
        // Initial load error - store and notify
        currentError = dfError;
        // Clear flight flags BEFORE notifying so loading reads correctly
        inFlight = false;
        isRefresh = false;
        notifySubscribers();
        // Preserve throw behavior for initial-load failures
        throw error;
      } else {
        // Refresh error - store but don't notify with error updates
        currentError = dfError;
        // Don't notify subscribers of refresh errors to avoid UI disruption
      }
    } finally {
      inFlight = false;
      isRefresh = false;

      // If a refresh was queued, execute it now
      if (queuedRefresh) {
        queuedRefresh = false;
        fetchQuery(true);
      }
    }
  };

  // Derive footprint from query with schema lookup (SIG-002)
  const footprint = deriveQueryFootprint(fullQuery, schema);

  // Debouncing state for batching refreshes (SIG-002)
  let pendingRefresh = false;

  const scheduleRefresh = () => {
    if (pendingRefresh) {
      return; // Already scheduled
    }
    pendingRefresh = true;

    // Microtask debounce (0ms via Promise.resolve)
    Promise.resolve().then(() => {
      pendingRefresh = false;
      fetchQuery(true);
    });
  };

  // Listen for mutation_applied and sync_applied events for auto-refresh (SIG-002, SIG-003)
  // Store unsubscribe function for disposal
  unsubscribeFn = eventBus.subscribe((event) => {
    // Check disposed flag to prevent refresh after dispose
    if (disposed) {
      return;
    }

    // Refresh after sync operations (clone/pull) that may have updated local storage
    if (event.type === "sync_applied") {
      const ctx = (event as any).context;
      const phase = ctx?.phase;
      if (phase === "clone" || phase === "pull") {
        const affectedResources: string[] = ctx?.resources ?? [];
        // Only refresh when specific resources that overlap with this signal's footprint
        // changed.  Removing the "length === 0" broadcast avoids refreshing all signals
        // (including KV) on every pull that returns no records (RC-3 / issue 2026-03-02-k7m4x9r8).
        if (affectedResources.some(r => footprint.has(r))) {
          scheduleRefresh();
        }
      }
      return;
    }

    if (event.type === "mutation_applied" && event.resource) {
      // Check if event.resource is in signal footprint
      if (!footprint.has(event.resource)) {
        return; // Not relevant to this signal
      }
      
      // If mutation is on a related resource (not the primary query resource),
      // always refresh since we can't easily match IDs across relations
      if (event.resource !== resource) {
        scheduleRefresh();
        return;
      }
      
      // Fine-grained invalidation logic (SIG-002) for primary resource mutations
      const action = event.action;
      
      if (action === "insert" || action === "delete" || action === "replace") {
        // Always full re-fetch for insert/delete/replace (no safe patching)
        scheduleRefresh();
        return;
      }
      
      if (action === "merge") {
        // Optimistic signal update (SIG-003) for merge operations
        
        // Skip optimistic patch if disabled or no cached value yet
        if (disableOptimistic || currentValue === undefined) {
          scheduleRefresh();
          return;
        }
        
        // Conservative: if no cached IDs, always refresh
        if (!cachedIds || cachedIds.size === 0) {
          scheduleRefresh();
          return;
        }
        
        // Check if mutation affects any cached record
        if (!event.ids || !Array.isArray(event.ids)) {
          // No ids in event, be conservative and refresh
          scheduleRefresh();
          return;
        }
        
        const affectsCachedRecord = event.ids.some(id => cachedIds!.has(id));
        
        if (!affectsCachedRecord) {
          if (hasMembershipSensitiveQueryShape(fullQuery)) {
            scheduleRefresh();
          }
          return;
        }
        
        // Attempt optimistic patch
        const patchedValue = applyOptimisticPatch(currentValue, event);
        
        if (patchedValue !== null) {
          // Successfully patched - emit immediately
          currentValue = patchedValue as T;
          notifySubscribers();
          
          // Schedule background re-fetch for eventual consistency
          scheduleRefresh();
        } else {
          // Patch failed, fall back to refresh
          scheduleRefresh();
        }
        
        return;
      }
      
      // Unknown action, be conservative
      scheduleRefresh();
    }
  });

  const signal = {
    subscribe(fn: (value: T) => void): () => void {
      subscribers.add(fn);

      // Lazy fetch on first subscribe
      if (subscribers.size === 1 && currentValue === undefined && !inFlight) {
        fetchQuery(false).catch(() => {
          // Initial fetch errors are handled internally
        });
      } else if (currentValue !== undefined) {
        // Immediately deliver current value to new subscriber
        fn(currentValue);
      }

      // Return unsubscribe function
      return () => {
        subscribers.delete(fn);
      };
    },

    get(): T {
      // Return current value or undefined as T (signals can have undefined state)
      // Disposed signal returns last cached value (no re-fetch)
      return currentValue as T;
    },

    get loading(): boolean {
      return inFlight && !isRefresh;
    },

    get error(): DatafnError | null {
      return currentError;
    },

    get refreshing(): boolean {
      return inFlight && isRefresh;
    },

    get nextCursor(): string | null {
      return currentCursor;
    },

    refresh(): Promise<void> {
      return fetchQuery(true);
    },

    dispose(): void {
      // Guard against double-dispose
      if (disposed) {
        return;
      }

      // Mark as disposed
      disposed = true;

      // Unsubscribe from event bus
      if (unsubscribeFn) {
        unsubscribeFn();
        unsubscribeFn = null;
      }

      // Remove from registry
      removeFromRegistry();

      // Note: We keep currentValue intact so get() returns last cached value
    },
  };
  return signal as DatafnSignal<T>;
}
