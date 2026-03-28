/**
 * Mutation Execution Utilities
 *
 * Handles mutation execution via remote adapter with event emission.
 */

import type { DatafnRemoteAdapter } from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import type { EventBus } from "./events/bus.js";
import type { DatafnPlugin, DatafnSchema, SearchProvider } from "@datafn/core";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { isTransportError } from "./errors.js";
import { handleOfflineMutation } from "./offline/mutate.js";
import { runBeforeMutation, runAfterMutation } from "./plugins/run-hooks.js";
import { serializeDateFields } from "./codecs/date.js";
import {
  injectCapabilityFieldsForOptimisticRecord,
  sanitizeCapabilityReadonlyFields,
} from "./capability-fields.js";

import type { SyncEngine } from "./sync/engine.js";
import type { DebouncerMap } from "./debounce.js";

export type TableOperation =
  | "delete"
  | "trash"
  | "restore"
  | "archive"
  | "unarchive";

export type ShareScope = "record" | "resource";

export type PrincipalShareMutationInput = {
  principalId: string;
  level: string;
  scope?: ShareScope;
  id?: string;
};

export type PrincipalUnshareMutationInput = {
  principalId: string;
  scope?: ShareScope;
  id?: string;
};

/**
 * Build a table-scoped mutation payload for operation convenience methods.
 */
export function buildTableOperationMutation(
  resource: string,
  version: number,
  operation: TableOperation,
  id: string,
): Record<string, unknown> {
  return {
    resource,
    version,
    operation,
    id,
  };
}

export function buildShareMutation(
  resource: string,
  version: number,
  id: string,
  userId: string,
  level: string,
): Record<string, unknown> {
  return {
    resource,
    version,
    operation: "share",
    id,
    shareWith: { userId, level },
  };
}

export function buildUnshareMutation(
  resource: string,
  version: number,
  id: string,
  userId: string,
): Record<string, unknown> {
  return {
    resource,
    version,
    operation: "unshare",
    id,
    shareWith: { userId },
  };
}

export function buildPrincipalShareMutation(
  resource: string,
  version: number,
  input: PrincipalShareMutationInput,
): Record<string, unknown> {
  const scope = input.scope ?? "record";
  const payload: Record<string, unknown> = {
    resource,
    version,
    operation: "share",
    scope,
    shareWith: {
      principalId: input.principalId,
      level: input.level,
    },
  };

  if (scope === "record") {
    payload.id = input.id;
  }

  return payload;
}

export function buildPrincipalUnshareMutation(
  resource: string,
  version: number,
  input: PrincipalUnshareMutationInput,
): Record<string, unknown> {
  const scope = input.scope ?? "record";
  const payload: Record<string, unknown> = {
    resource,
    version,
    operation: "unshare",
    scope,
    shareWith: {
      principalId: input.principalId,
    },
  };

  if (scope === "record") {
    payload.id = input.id;
  }

  return payload;
}

/**
 * Generate a unique mutation ID
 */
function generateMutationId(): string {
  return `mut-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Apply outbound date codec to mutation record (CODEC-001)
 */
function applyDateCodecToMutation(
  schema: DatafnSchema | undefined,
  mutation: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema || !mutation.record) {
    return mutation;
  }

  const resource = mutation.resource as string;
  if (!resource) {
    return mutation;
  }

  try {
    const serializedRecord = serializeDateFields(
      schema,
      resource,
      mutation.record as Record<string, unknown>,
    );
    return {
      ...mutation,
      record: serializedRecord,
    };
  } catch (err) {
    // Propagate codec errors
    throw err;
  }
}

function sanitizeCapabilityFieldsInMutationPayload(
  schema: DatafnSchema | undefined,
  payload: unknown | unknown[],
): unknown | unknown[] {
  if (!schema) return payload;
  if (Array.isArray(payload)) {
    return payload.map((entry) =>
      sanitizeCapabilityReadonlyFields(schema, entry as Record<string, unknown>),
    );
  }
  return sanitizeCapabilityReadonlyFields(
    schema,
    payload as Record<string, unknown>,
  );
}

const SEARCH_INDEX_UPSERT_OPS = new Set([
  "insert",
  "merge",
  "replace",
  "trash",
  "restore",
  "archive",
  "unarchive",
]);

function resolveSearchIndexOperation(
  operation: unknown,
): "upsert" | "delete" | undefined {
  if (operation === "delete") return "delete";
  if (typeof operation === "string" && SEARCH_INDEX_UPSERT_OPS.has(operation)) {
    return "upsert";
  }
  return undefined;
}

async function tryUpdateSearchIndex(
  searchProvider: SearchProvider | undefined,
  storage: DatafnStorageAdapter | undefined,
  mutation: Record<string, unknown>,
  resolvedRecord?: Record<string, unknown>,
): Promise<void> {
  if (!searchProvider) return;

  const resource = mutation.resource;
  const id = mutation.id;
  const searchOp = resolveSearchIndexOperation(mutation.operation);
  if (typeof resource !== "string" || typeof id !== "string" || !searchOp) return;

  try {
    if (searchOp === "delete") {
      await searchProvider.updateIndices({
        resource,
        records: [{ id }],
        operation: "delete",
      });
      return;
    }

    const fromStorage = storage ? await storage.getRecord(resource, id) : null;
    const fallbackRecord =
      typeof mutation.record === "object" &&
      mutation.record !== null &&
      !Array.isArray(mutation.record)
        ? (mutation.record as Record<string, unknown>)
        : {};
    const finalRecord = {
      id,
      ...(resolvedRecord ?? (fromStorage as Record<string, unknown> | null) ?? fallbackRecord),
    };
    await searchProvider.updateIndices({
      resource,
      records: [finalRecord],
      operation: "upsert",
    });
  } catch (error) {
    // Search indexing is non-fatal for mutation durability.
    console.warn("Search index update failed (non-fatal)", {
      operation: "search-index-update",
      resource,
      error: String(error),
    });
  }
}

/**
 * Execute a mutation (single or batch) via the remote adapter.
 * Unwraps responses, emits events, and returns mutation result(s).
 */
export async function executeMutation(
  remote: DatafnRemoteAdapter,
  eventBus: EventBus,
  getTimestamp: () => number,
  m: unknown | unknown[],
  storage?: DatafnStorageAdapter,
  plugins: DatafnPlugin[] = [],
  schema?: DatafnSchema,
  syncEngine?: SyncEngine,
  offlinability?: boolean,
  clientId?: string,
  debouncerMap?: DebouncerMap,
  searchProvider?: SearchProvider,
): Promise<unknown> {
  // Validate clientId is provided when offline functionality is needed
  if ((offlinability || storage) && !clientId) {
    throw new Error(
      "clientId is required when offlinability or storage is enabled",
    );
  }

  // Validate context is JSON-serializable (API-002)
  const mutationsToValidate = Array.isArray(m) ? m : [m];
  for (const mut of mutationsToValidate) {
    const mutation = mut as any;
    if (mutation.context !== undefined) {
      try {
        // Test JSON serializability
        JSON.stringify(mutation.context);
        // Check for non-serializable types
        if (
          typeof mutation.context === "function" ||
          typeof mutation.context === "symbol" ||
          typeof mutation.context === "bigint"
        ) {
          throw new Error(
            "Invalid mutation: context must be JSON-serializable",
          );
        }
      } catch (err) {
        throw {
          code: "DFQL_INVALID",
          message: "Invalid mutation: context must be JSON-serializable",
          details: { path: "context" },
        };
      }
    }
  }

  // Check for debounced mutations (DEB-001)
  // Only single merge mutations with debounceKey are debounced
  if (
    !Array.isArray(m) &&
    debouncerMap &&
    storage &&
    offlinability &&
    clientId
  ) {
    const mutation = m as any;
    const debounceKey = mutation.debounceKey as string | undefined;
    const debounceMs = (mutation.debounceMs as number | undefined) || 1500;

    if (debounceKey) {
      // If operation is NOT merge, execute immediately (no debounce for insert/delete/replace)
      if (mutation.operation !== "merge") {
        // Fall through to normal execution below
      } else {
        // This is a debounced merge mutation
        const mutationId = mutation.mutationId || generateMutationId();
        const sanitizedMutation = schema
          ? sanitizeCapabilityReadonlyFields(schema, mutation as Record<string, unknown>)
          : mutation;
        const enrichedMutation = {
          ...sanitizedMutation,
          clientId,
          mutationId,
        };

        // Check hydration state - only proceed if ready
        const state = await storage.getHydrationState(mutation.resource);
        if (state === "ready") {
          // Apply to local storage immediately (optimistic) - inline merge logic
          const resource = mutation.resource as string;
          const id = mutation.id as string;
          const existing = await storage.getRecord(resource, id);
          const optimisticRecord = schema
            ? injectCapabilityFieldsForOptimisticRecord(
                schema,
                enrichedMutation as Record<string, unknown>,
                {
                  timestampMs: getTimestamp(),
                  actorId: clientId,
                  existingRecord: existing,
                },
              )
            : (((enrichedMutation as any).record || {}) as Record<string, unknown>);

          const merged = existing
            ? { ...existing, ...optimisticRecord }
            : { ...optimisticRecord, id };
          merged.id = id;
          await storage.upsertRecord(resource, merged);
          await tryUpdateSearchIndex(
            searchProvider,
            storage,
            enrichedMutation as Record<string, unknown>,
            merged,
          );

          // Add to debouncer for delayed changelog append + event emission
          debouncerMap.set(
            debounceKey,
            enrichedMutation,
            debounceMs,
            async (debouncedMutation) => {
              // This executor runs after the debounce delay
              // The mutation is already in local storage (coalesced from all calls)
              // Now we need to:
              // 1. Append to changelog with the coalesced mutation
              // 2. Emit mutation_applied event
              // 3. Schedule push

              try {
                // Append to changelog (AUD-001: with timestamp enrichment)
                await storage.changelogAppend({
                  clientId: debouncedMutation.clientId as string,
                  mutationId: debouncedMutation.mutationId as string,
                  mutation: debouncedMutation,
                  timestampMs: getTimestamp(),
                  timestamp: new Date().toISOString(),
                });

                // Emit mutation_applied event
                emitMutationEvents(
                  eventBus,
                  getTimestamp,
                  debouncedMutation,
                  { ok: true, mutationId: debouncedMutation.mutationId },
                );

                // Schedule push if syncEngine exists
                if (syncEngine) {
                  syncEngine.schedulePush();
                }
              } catch (err) {
                // If changelog append fails, emit rejection event
                const errorContext = {
                  code: "INTERNAL",
                  message: "Failed to append to changelog",
                  path: "$",
                };
                eventBus.emit({
                  type: "mutation_rejected",
                  resource: debouncedMutation.resource as string,
                  ids: [debouncedMutation.id as string],
                  mutationId: debouncedMutation.mutationId as string,
                  clientId: debouncedMutation.clientId as string,
                  timestampMs: getTimestamp(),
                  action: debouncedMutation.operation as string,
                  context: errorContext,
                } as any);
                // Don't re-throw - we've emitted the rejection event
                // and the debouncer promise will be rejected anyway
              }
            },
          );

          // Return immediately (optimistic result)
          // The mutation is in local storage and will be synced after debounce
          return {
            ok: true,
            mutationId,
            affectedIds: [mutation.id],
            deduped: false,
          };
        }
      }
    }
  }

  // Run beforeMutation hooks (fail-closed)
  const transformedMutation = schema
    ? await runBeforeMutation(plugins, schema, m)
    : m;

  // Apply outbound date codec (CODEC-001)
  // Serialize Date fields to ISO strings before any processing
  let codecAppliedMutation = transformedMutation;
  if (schema) {
    if (Array.isArray(transformedMutation)) {
      codecAppliedMutation = transformedMutation.map((mut) =>
        applyDateCodecToMutation(schema, mut as Record<string, unknown>),
      );
    } else {
      codecAppliedMutation = applyDateCodecToMutation(
        schema,
        transformedMutation as Record<string, unknown>,
      );
    }
  }

  const capabilitySanitizedMutation = sanitizeCapabilityFieldsInMutationPayload(
    schema,
    codecAppliedMutation,
  );

  // Local-first path (SYNC-MUT-001)
  // Only use local-first when hydration is ready to avoid data integrity issues
  // (e.g., editing a record that exists on remote but not yet synced locally)
  if (offlinability && storage && syncEngine) {
    const mutations = Array.isArray(capabilitySanitizedMutation)
      ? capabilitySanitizedMutation
      : [capabilitySanitizedMutation];

    // Check hydration state for all mutations
    let allReady = true;
    for (const mut of mutations) {
      const resource = (mut as any).resource;
      if (!resource) continue;
      const state = await storage.getHydrationState(resource);
      if (state !== "ready") {
        allReady = false;
        break;
      }
    }

    if (allReady) {
      // Enrich mutations with clientId and mutationId
      const enrichedMutations = mutations.map((mut) => {
        const mutation = mut as Record<string, unknown>;
        return {
          ...mutation,
          clientId: clientId!, // clientId is validated above
          mutationId: mutation.mutationId || generateMutationId(),
        };
      });

      const results: unknown[] = [];
      for (const mut of enrichedMutations) {
        const mutationRecord = mut as Record<string, unknown>;
        let result = await handleOfflineMutation(
          storage,
          schema!,
          mutationRecord,
          getTimestamp(),
        );

        // Run afterMutation hooks
        result = schema
          ? await runAfterMutation(plugins, schema, mut, result)
          : result;
        await tryUpdateSearchIndex(
          searchProvider,
          storage,
          mutationRecord,
        );

        results.push(result);
        emitMutationEvents(eventBus, getTimestamp, mut, result);
      }

      // Schedule push
      syncEngine.schedulePush();

      return Array.isArray(m) ? results : results[0];
    }
  }

  let result: unknown;
  let usedOfflinePath = false;

  // If storage is available, enrich mutations before remote call
  // so they're ready for offline handling if remote fails.
  let mutationForRemote = capabilitySanitizedMutation;
  if (storage && clientId) {
    const mutations = Array.isArray(codecAppliedMutation)
      ? codecAppliedMutation
      : [codecAppliedMutation];
    const enriched = mutations.map((mut) => {
      const mutation = mut as Record<string, unknown>;
      return {
        ...mutation,
        clientId: clientId,
        mutationId: mutation.mutationId || generateMutationId(),
      };
    });
    mutationForRemote = Array.isArray(codecAppliedMutation)
      ? enriched
      : enriched[0];
  }

  // Extract retryIndividual option from first mutation if batch
  let retryIndividualBatch = false;
  if (Array.isArray(mutationForRemote) && mutationForRemote.length > 0) {
    const firstMut = mutationForRemote[0] as any;
    retryIndividualBatch = firstMut.retryIndividual === true;
  }

  try {
    const response = await remote.mutation(mutationForRemote);
    result = unwrapRemoteSuccess(response);
    // Run afterMutation hooks (fail-open)
    result = schema
      ? await runAfterMutation(plugins, schema, mutationForRemote, result)
      : result;
  } catch (err: unknown) {
    // BULK-001: If batch fails and retryIndividual is true, retry each individually
    if (retryIndividualBatch && Array.isArray(mutationForRemote) && clientId) {
      const results: any[] = [];
      for (const mutation of mutationForRemote) {
        try {
          // Retry this mutation individually via remote.mutation
          const singleMutationResponse = await remote.mutation(mutation);
          const singleResult = unwrapRemoteSuccess(singleMutationResponse);
          results.push({
            mutationId: (mutation as any).mutationId,
            ok: true,
            result: singleResult,
          });
        } catch (mutErr) {
          results.push({
            mutationId: (mutation as any).mutationId,
            ok: false,
            error: mutErr,
          });
        }
      }

      // Aggregate results: ok only if ALL succeeded
      const allSucceeded = results.every((r) => r.ok);
      const errors = results.filter((r) => !r.ok).map((r) => r.error);

      result = {
        ok: allSucceeded,
        results,
        errors: allSucceeded ? [] : errors,
      };

      // Emit events for each mutation based on result
      for (let i = 0; i < mutationForRemote.length; i++) {
        if (results[i].ok) {
          emitMutationEvents(
            eventBus,
            getTimestamp,
            mutationForRemote[i],
            { ok: true, mutationId: (mutationForRemote[i] as any).mutationId },
          );
        } else {
          emitRejectionForError(
            eventBus,
            getTimestamp,
            mutationForRemote[i],
            results[i].error,
          );
        }
      }

      return result;
    }

    // REL-012: Do NOT emit rejection here if we are about to attempt offline handling.
    // Rejection is emitted only when no offline path is available (else branch below)
    // or when offline handling itself fails.

    // Check if we can failover to offline handling
    // OFF-001: Batch offline handling
    if (storage && schema && isTransportError(err)) {
      try {
        if (Array.isArray(mutationForRemote)) {
          // Batch offline handling: iterate through each mutation
          const results: any[] = [];
          for (const mutation of mutationForRemote) {
            const mutationRecord = mutation as Record<string, unknown>;
            try {
              const mutResult = await handleOfflineMutation(
                storage,
                schema,
                mutationRecord,
                getTimestamp(),
              );
              await tryUpdateSearchIndex(
                searchProvider,
                storage,
                mutationRecord,
              );
              // Emit mutation_applied event (unless silent)
              emitMutationEvents(eventBus, getTimestamp, mutation, mutResult);
              results.push({ ok: true, ...mutResult });
            } catch (mutErr) {
              results.push({ ok: false, error: mutErr });
            }
          }
          // Return aggregated batch results
          result = results;
          usedOfflinePath = true;
        } else {
          // Single mutation offline handling
          const mutationToUse = mutationForRemote as Record<string, unknown>;
          result = await handleOfflineMutation(
            storage,
            schema,
            mutationToUse,
            getTimestamp(),
          );
          await tryUpdateSearchIndex(
            searchProvider,
            storage,
            mutationToUse,
          );
          // REL-012: Emit applied here so only one event fires (no double-emit with final path)
          emitMutationEvents(eventBus, getTimestamp, mutationToUse, result);
          usedOfflinePath = true;
        }
      } catch (offlineErr) {
        // REL-012: Offline path also failed — emit rejection now and rethrow
        if (!Array.isArray(mutationForRemote)) {
          emitRejectionForError(eventBus, getTimestamp, mutationForRemote as any, offlineErr);
        } else {
          for (const mut of mutationForRemote as any[]) {
            emitRejectionForError(eventBus, getTimestamp, mut, offlineErr);
          }
        }
        throw offlineErr;
      }
    } else {
      // REL-012: No offline path available — emit rejection now and rethrow
      // CLIENT-EVENT-001: Emit mutation_rejected for thrown errors
      if (!Array.isArray(mutationForRemote)) {
        emitRejectionForError(
          eventBus,
          getTimestamp,
          mutationForRemote as any,
          err,
        );
      } else {
        // For batch mutations, emit rejection for each
        for (const mut of mutationForRemote as any[]) {
          emitRejectionForError(eventBus, getTimestamp, mut, err);
        }
      }
      throw err;
    }
  }

  // Handle single mutation result
  // REL-012: Skip final emit for offline path — events already emitted inside offline handling
  if (!Array.isArray(m)) {
    if (!usedOfflinePath) {
      emitMutationEvents(eventBus, getTimestamp, m as any, result as any);
    }
    return result;
  }

  // Handle batch mutation results
  // REL-012: Skip final emit for offline path — events already emitted inside the offline loop
  const mutations = m as any[];
  const results = result as any[];

  if (!usedOfflinePath) {
    for (let i = 0; i < mutations.length; i++) {
      emitMutationEvents(eventBus, getTimestamp, mutations[i], results[i]);
    }
  }

  return results;
}

/**
 * Emit mutation events based on result
 * CLIENT-EVENT-001: Include action and fields metadata
 * MUT-001: Skip emission if silent: true
 * MUT-002: Include system flag in event payload
 */
function emitMutationEvents(
  eventBus: EventBus,
  getTimestamp: () => number,
  mutation: any,
  result: any,
): void {
  // MUT-001: If silent: true, suppress event emission entirely
  if (mutation.silent === true) {
    return;
  }

  // Derive action from mutation.operation (CLIENT-EVENT-001)
  const action = mutation.operation;

  // Derive fields from mutation.record keys, excluding 'id' (CLIENT-EVENT-001)
  let fields: string[] | undefined;
  if (mutation.operation !== "delete" && mutation.record) {
    fields = Object.keys(mutation.record)
      .filter((k) => k !== "id")
      .sort(); // deterministic order
  }

  const baseEvent = {
    resource: mutation.resource,
    ids: Array.isArray(mutation.id) ? mutation.id : [mutation.id],
    mutationId: mutation.mutationId,
    clientId: mutation.clientId,
    timestampMs: getTimestamp(),
    action, // NEW: CLIENT-EVENT-001
    fields, // NEW: CLIENT-EVENT-001
    ...(mutation.record && { record: mutation.record }), // SIG-003: include record for optimistic patching
    ...(mutation.context !== undefined && { context: mutation.context }), // API-002: propagate context
    ...(mutation.system === true && { system: true }), // MUT-002: propagate system flag
  };

  if (result.ok) {
    // Successful mutation - emit mutation_applied
    eventBus.emit({
      type: "mutation_applied",
      ...baseEvent,
    });
  } else {
    // Failed mutation - emit mutation_rejected with error context
    const errorContext = result.errors?.[0] || {
      code: "UNKNOWN",
      message: "Mutation failed",
      path: "$",
    };

    eventBus.emit({
      type: "mutation_rejected",
      ...baseEvent,
      context: errorContext,
    } as any);
  }
}

/**
 * Emit mutation_rejected for thrown errors (CLIENT-EVENT-001)
 * MUT-001: Skip emission if silent: true
 * MUT-002: Include system flag in event payload
 */
function emitRejectionForError(
  eventBus: EventBus,
  getTimestamp: () => number,
  mutation: any,
  error: any,
): void {
  // MUT-001: If silent: true, suppress event emission entirely
  if (mutation.silent === true) {
    return;
  }

  // Derive action and fields same as above
  const action = mutation.operation;
  let fields: string[] | undefined;
  if (mutation.operation !== "delete" && mutation.record) {
    fields = Object.keys(mutation.record)
      .filter((k) => k !== "id")
      .sort();
  }

  const errorContext = {
    code: error.code || "INTERNAL",
    message: error.message || "Remote error",
    path: error.path || "$",
  };

  eventBus.emit({
    type: "mutation_rejected",
    resource: mutation.resource,
    ids: Array.isArray(mutation.id) ? mutation.id : [mutation.id],
    mutationId: mutation.mutationId,
    clientId: mutation.clientId,
    timestampMs: getTimestamp(),
    action,
    fields,
    context: errorContext,
    ...(mutation.system === true && { system: true }), // MUT-002: propagate system flag
  } as any);
}
