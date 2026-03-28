/**
 * Offline Mutation Logic
 *
 * Handles offline mutations by:
 * 1. Appending to offline changelog
 * 2. Performing optimistic local write to storage
 * 3. Supporting relation mutations (relate, modifyRelation, unrelate)
 */

import type { DatafnSchema } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import { createClientError } from "../errors.js";
import { getJoinStoreKey, normalizeRelationPayload, findRelationBidirectional } from "@datafn/core";
import {
  injectCapabilityFieldsForOptimisticRecord,
  sanitizeCapabilityReadonlyFields,
} from "../capability-fields.js";

/**
 * Handle a mutation when remote is unavailable.
 *
 * @param storage Storage adapter
 * @param schema Schema definition (required for relation operations)
 * @param mutation The full mutation object (including resource, version, clientId, mutationId)
 * @param timestampMs Client timestamp
 * @returns Optimistic mutation result
 */
export async function handleOfflineMutation(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
  timestampMs: number,
): Promise<any> {
  // Validate required fields
  if (!mutation.clientId) {
    throw new Error("Missing clientId in mutation - mutation must be enriched before calling handleOfflineMutation");
  }
  if (!mutation.mutationId) {
    throw new Error("Missing mutationId in mutation - mutation must be enriched before calling handleOfflineMutation");
  }

  // 1. Append to changelog (handling dedupe)
  // CLIENT-CHANGELOG-001, CLIENT-OFFLINE-MUT-001
  const clientId = mutation.clientId as string;
  const mutationId = mutation.mutationId as string;
  const resource = mutation.resource as string;
  const id = mutation.id as string;
  const operation = mutation.operation as string;
  const sanitizedMutation = sanitizeCapabilityReadonlyFields(schema, mutation);
  const record = ((sanitizedMutation.record || {}) as Record<string, unknown>);

  // 2. Validate mutation (no side effects, can throw)
  // This prevents invalid mutations from being added to changelog
  if (operation === "relate" || operation === "modifyRelation" || operation === "unrelate") {
    await validateRelationMutation(storage, schema, sanitizedMutation);
  }

  // 3. Append to changelog (after validation, before apply)
  // AUD-001: Enrich with timestamp
  try {
    await storage.changelogAppend({
      clientId,
      mutationId,
      mutation: sanitizedMutation,
      timestampMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // If changelog fails, the whole offline mutation fails
    // Throw as is or wrap (CLIENT-OFFLINE-MUT-002)
    throw err;
  }

  // 4. Optimistic local apply
  // Deterministic implementation

  if (operation === "delete") {
    await storage.deleteRecord(resource, id);
  } else if (operation === "trash") {
    await storage.mergeRecord(resource, id, {
      trashedAt: timestampMs,
      trashedBy: null,
    });
  } else if (operation === "restore") {
    await storage.mergeRecord(resource, id, {
      trashedAt: null,
      trashedBy: null,
    });
  } else if (operation === "archive") {
    await storage.mergeRecord(resource, id, {
      isArchived: true,
    });
  } else if (operation === "unarchive") {
    await storage.mergeRecord(resource, id, {
      isArchived: false,
    });
  } else if (operation === "merge") {
    // Merge: Use atomic mergeRecord with one-level-deep merge
    const optimisticRecord = injectCapabilityFieldsForOptimisticRecord(
      schema,
      sanitizedMutation,
      {
        timestampMs,
        actorId: clientId,
      },
    );
    await storage.mergeRecord(resource, id, optimisticRecord);
  } else if (operation === "insert" || operation === "replace") {
    // Insert/Replace: Overwrite (simple upsert)
    // Ensure id matches mutation target
    const existing =
      operation === "replace" ? await storage.getRecord(resource, id) : null;
    const optimisticRecord = injectCapabilityFieldsForOptimisticRecord(
      schema,
      sanitizedMutation,
      {
        timestampMs,
        actorId: clientId,
        existingRecord: existing,
      },
    );
    const toWrite = { ...optimisticRecord, id };
    await storage.upsertRecord(resource, toWrite);
  } else if (operation === "relate") {
    // Handle relation mutations
    await applyRelate(storage, schema, sanitizedMutation);
  } else if (operation === "modifyRelation") {
    await applyModifyRelation(storage, schema, sanitizedMutation);
  } else if (operation === "unrelate") {
    await applyUnrelate(storage, schema, sanitizedMutation);
  }

  // 5. Return optimistic success result
  return {
    ok: true,
    mutationId,
    affectedIds: [id],
    deduped: false, // local apply is fresh
  };
}

/**
 * Validate relation mutation (no side effects)
 * Throws if validation fails
 */
async function validateRelationMutation(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
): Promise<void> {
  const resource = mutation.resource as string;
  const id = mutation.id as string;
  const operation = mutation.operation as string;
  const relations = mutation.relations as Record<string, unknown>;

  if (!relations) return;

  for (const [relationName, payload] of Object.entries(relations)) {
    const relation = findRelationBidirectional(schema, resource, relationName);
    if (!relation) {
      throw createClientError(
        "DFQL_UNKNOWN_RELATION",
        `Unknown relation: ${relationName}`,
        { path: `relations.${relationName}` },
      );
    }

    // Validate payload structure
    const items = normalizeRelationPayload(payload);

    // For modifyRelation, check that join rows exist
    if (operation === "modifyRelation") {
      if (relation.type !== "many-many") {
        throw createClientError(
          "DFQL_UNSUPPORTED",
          "modifyRelation only supported for many-many relations",
          { path: `relations.${relationName}` },
        );
      }

      const fromResource = resource;
      const toResources = Array.isArray(relation.to)
        ? relation.to
        : [relation.to];

      for (const item of items) {
        const toResource =
          toResources.length === 1
            ? toResources[0]
            : toResources.find((r) => item.toId.startsWith(`${r}:`)) ||
              toResources[0];

        const joinStore = getJoinStoreKey(
          fromResource,
          relationName,
          toResource,
        );

        // Check if join row exists
        const existingRows = await storage.getJoinRows(joinStore, id);
        const existingRow = existingRows.find((r) => r.to === item.toId);

        if (!existingRow) {
          throw createClientError(
            "NOT_FOUND",
            `Relation not found between ${id} and ${item.toId}`,
            { path: `relations.${relationName}` },
          );
        }
      }
    }

    // For relate with many-one, validate single target
    if (operation === "relate" && relation.type === "many-one") {
      if (items.length !== 1) {
        throw createClientError(
          "DFQL_INVALID",
          "many-one relation expects single target",
          { path: `relations.${relationName}` },
        );
      }
    }
  }
}

/**
 * Apply relate operation offline
 */
async function applyRelate(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
): Promise<void> {
  const resource = mutation.resource as string;
  const id = mutation.id as string;
  const relations = mutation.relations as Record<string, unknown>;

  if (!relations) return;

  for (const [relationName, payload] of Object.entries(relations)) {
    const relation = findRelationBidirectional(schema, resource, relationName);
    if (!relation) continue; // Already validated

    const items = normalizeRelationPayload(payload);

    // Apply based on relation type
    if (relation.type === "many-one") {
      // Update FK on source record
      const fkField = relation.fkField || `${relationName}Id`;
      const existing = await storage.getRecord(resource, id);
      if (existing) {
        await storage.upsertRecord(resource, {
          ...existing,
          [fkField]: items[0].toId,
        });
      }
    } else if (relation.type === "one-many") {
      // Update FK on target records
      const fkField =
        relation.fkField || relation.inverse || `${resource}Id`;
      const targetResource =
        typeof relation.to === "string" ? relation.to : relation.to[0];

      for (const item of items) {
        const targetRecord = await storage.getRecord(
          targetResource,
          item.toId,
        );
        if (targetRecord) {
          await storage.upsertRecord(targetResource, {
            ...targetRecord,
            [fkField]: id,
          });
        }
      }
    } else if (relation.type === "many-many") {
      // Upsert join rows
      const fromResource = resource;
      const toResources = Array.isArray(relation.to)
        ? relation.to
        : [relation.to];

      for (const item of items) {
        // Determine target resource from toId prefix (or use first if single)
        const toResource =
          toResources.length === 1
            ? toResources[0]
            : toResources.find((r) => item.toId.startsWith(`${r}:`)) ||
              toResources[0];

        const joinStore = getJoinStoreKey(
          fromResource,
          relationName,
          toResource,
        );

        // Upsert join row (merge metadata if exists)
        const existingRows = await storage.getJoinRows(joinStore, id);
        const existingRow = existingRows.find((r) => r.to === item.toId);

        if (existingRow) {
          // Update metadata if provided
          if (Object.keys(item.metadata).length > 0) {
            await storage.upsertJoinRow(joinStore, {
              from: id,
              to: item.toId,
              ...existingRow,
              ...item.metadata,
            });
          }
        } else {
          // Create new join row
          await storage.upsertJoinRow(joinStore, {
            from: id,
            to: item.toId,
            ...item.metadata,
          });
        }
      }
    }
  }
}

/**
 * Apply modifyRelation operation offline
 */
async function applyModifyRelation(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
): Promise<void> {
  const resource = mutation.resource as string;
  const id = mutation.id as string;
  const relations = mutation.relations as Record<string, unknown>;

  if (!relations) return;

  for (const [relationName, payload] of Object.entries(relations)) {
    const relation = findRelationBidirectional(schema, resource, relationName);
    if (!relation) continue; // Already validated

    const items = normalizeRelationPayload(payload);
    const fromResource = resource;
    const toResources = Array.isArray(relation.to)
      ? relation.to
      : [relation.to];

    for (const item of items) {
      // Determine target resource
      const toResource =
        toResources.length === 1
          ? toResources[0]
          : toResources.find((r) => item.toId.startsWith(`${r}:`)) ||
            toResources[0];

      const joinStore = getJoinStoreKey(fromResource, relationName, toResource);

      // Find existing join row (already validated to exist)
      const existingRows = await storage.getJoinRows(joinStore, id);
      const existingRow = existingRows.find((r) => r.to === item.toId);

      // Update metadata (existingRow is guaranteed to exist due to validation)
      await storage.upsertJoinRow(joinStore, {
        from: id,
        to: item.toId,
        ...existingRow,
        ...item.metadata,
      });
    }
  }
}

/**
 * Apply unrelate operation offline
 */
async function applyUnrelate(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
): Promise<void> {
  const resource = mutation.resource as string;
  const id = mutation.id as string;
  const relations = mutation.relations as Record<string, unknown>;

  if (!relations) return;

  for (const [relationName, payload] of Object.entries(relations)) {
    const relation = findRelationBidirectional(schema, resource, relationName);
    if (!relation) continue; // Already validated

    const items = normalizeRelationPayload(payload);

    if (relation.type === "many-one") {
      // Clear FK on source record
      const fkField = relation.fkField || `${relationName}Id`;
      const existing = await storage.getRecord(resource, id);
      if (existing) {
        await storage.upsertRecord(resource, {
          ...existing,
          [fkField]: null,
        });
      }
    } else if (relation.type === "one-many") {
      // Clear FK on target records
      const fkField =
        relation.fkField || relation.inverse || `${resource}Id`;
      const targetResource =
        typeof relation.to === "string" ? relation.to : relation.to[0];

      for (const item of items) {
        const targetRecord = await storage.getRecord(
          targetResource,
          item.toId,
        );
        if (targetRecord) {
          await storage.upsertRecord(targetResource, {
            ...targetRecord,
            [fkField]: null,
          });
        }
      }
    } else if (relation.type === "many-many") {
      // Delete join rows
      const fromResource = resource;
      const toResources = Array.isArray(relation.to)
        ? relation.to
        : [relation.to];

      for (const item of items) {
        // Determine target resource
        const toResource =
          toResources.length === 1
            ? toResources[0]
            : toResources.find((r) => item.toId.startsWith(`${r}:`)) ||
              toResources[0];

        const joinStore = getJoinStoreKey(
          fromResource,
          relationName,
          toResource,
        );

        await storage.deleteJoinRow(joinStore, id, item.toId);
      }
    }
  }
}
