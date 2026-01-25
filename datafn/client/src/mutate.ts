/**
 * Mutation Execution Utilities
 *
 * Handles mutation execution via remote adapter with event emission.
 */

import type { DatafnRemoteAdapter } from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import type { EventBus } from "./events/bus.js";
import type { DatafnPlugin, DatafnSchema } from "@datafn/core";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { isTransportError } from "./errors.js";
import { handleOfflineMutation } from "./offline/mutate.js";
import { runBeforeMutation, runAfterMutation } from "./plugins/run-hooks.js";

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
): Promise<unknown> {
  // Run beforeMutation hooks (fail-closed)
  const transformedMutation = schema
    ? await runBeforeMutation(plugins, schema, m)
    : m;

  let result: unknown;
  let fromOfflineFallback = false;

  try {
    const response = await remote.mutation(transformedMutation);
    result = unwrapRemoteSuccess(response);
    // Run afterMutation hooks (fail-open)
    result = schema
      ? await runAfterMutation(plugins, schema, transformedMutation, result)
      : result;
  } catch (err: unknown) {
    // CLIENT-EVENT-001: Emit mutation_rejected for thrown errors
    if (!Array.isArray(transformedMutation)) {
      emitRejectionForError(
        eventBus,
        getTimestamp,
        transformedMutation as any,
        err,
      );
    } else {
      // For batch mutations, emit rejection for each
      for (const mut of transformedMutation as any[]) {
        emitRejectionForError(eventBus, getTimestamp, mut, err);
      }
    }

    // Check if we can failover to offline handling
    // We only failover if:
    // 1. Storage is configured
    // 2. It's a single mutation (batch offline fallback not scope of P21)
    // 3. Error IS A TRANSPORT ERROR (logic errors should fail)
    if (storage && !Array.isArray(m) && isTransportError(err)) {
      try {
        result = await handleOfflineMutation(
          storage,
          m as Record<string, unknown>,
          getTimestamp(),
        );
        fromOfflineFallback = true;
      } catch (offlineErr) {
        // If offline fallback also fails (e.g. storage error), rethrow original error?
        // Actually vectors CLIENT-OFFLINE-MUT-002 expect storage error to be thrown if changelog fails
        throw offlineErr;
      }
    } else {
      // No fallback possible, rethrow
      throw err;
    }
  }

  // Handle single mutation result
  if (!Array.isArray(m)) {
    emitMutationEvents(eventBus, getTimestamp, m as any, result as any);
    return result;
  }

  // Handle batch mutation results
  const mutations = m as any[];
  const results = result as any[];

  for (let i = 0; i < mutations.length; i++) {
    emitMutationEvents(eventBus, getTimestamp, mutations[i], results[i]);
  }

  return results;
}

/**
 * Emit mutation events based on result
 * CLIENT-EVENT-001: Include action and fields metadata
 */
function emitMutationEvents(
  eventBus: EventBus,
  getTimestamp: () => number,
  mutation: any,
  result: any,
): void {
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
 */
function emitRejectionForError(
  eventBus: EventBus,
  getTimestamp: () => number,
  mutation: any,
  error: any,
): void {
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
  } as any);
}
