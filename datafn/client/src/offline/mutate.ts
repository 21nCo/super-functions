/**
 * Offline Mutation Logic
 *
 * Handles offline mutations by:
 * 1. Appending to offline changelog
 * 2. Performing optimistic local write to storage
 */

import type { DatafnStorageAdapter } from "../storage.js";
import { createClientError } from "../errors.js";

/**
 * Handle a mutation when remote is unavailable.
 *
 * @param storage Storage adapter
 * @param mutation The full mutation object (including resource, version, clientId, mutationId)
 * @param timestampMs Client timestamp
 * @returns Optimistic mutation result
 */
export async function handleOfflineMutation(
  storage: DatafnStorageAdapter,
  mutation: Record<string, unknown>,
  timestampMs: number,
): Promise<any> {
  // 1. Append to changelog (handling dedupe)
  // CLIENT-CHANGELOG-001, CLIENT-OFFLINE-MUT-001
  const clientId = mutation.clientId as string;
  const mutationId = mutation.mutationId as string;
  const resource = mutation.resource as string;
  const id = mutation.id as string;

  try {
    await storage.changelogAppend({
      clientId,
      mutationId,
      mutation,
      timestampMs,
    });
  } catch (err) {
    // If changelog fails, the whole offline mutation fails
    // Throw as is or wrap (CLIENT-OFFLINE-MUT-002)
    throw err;
  }

  // 2. Optimistic local apply
  // Deterministic implementation
  const operation = mutation.operation as string;
  const record = (mutation.record || {}) as Record<string, unknown>;

  if (operation === "delete") {
    await storage.deleteRecord(resource, id);
  } else if (operation === "merge") {
    // Merge: Read -> Patch -> Write
    const existing = await storage.getRecord(resource, id);
    const merged = existing
      ? { ...existing, ...record } // Patch existing
      : { ...record, id }; // Create new if missing (upsert semantics)

    // Ensure id is present
    merged.id = id;

    await storage.upsertRecord(resource, merged);
  } else if (operation === "insert" || operation === "replace") {
    // Insert/Replace: Overwrite (simple upsert)
    // Ensure id matches mutation target
    const toWrite = { ...record, id };
    await storage.upsertRecord(resource, toWrite);
  }

  // 3. Return optimistic success result
  return {
    ok: true,
    mutationId,
    affectedIds: [id],
    deduped: false, // local apply is fresh
  };
}
