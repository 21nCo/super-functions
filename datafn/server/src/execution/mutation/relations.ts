/**
 * Relation mutation operations (relate, modifyRelation, unrelate)
 */

import type { DatafnSchema, DatafnRelation } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { DFQLMutation } from "./dfql.js";

/**
 * Normalized relation payload
 */
export interface NormalizedRelation {
  toId: string;
  metadata: Record<string, unknown>;
}

/**
 * Normalize relation payload
 * String -> { toId, metadata: {} }
 * String[] -> [{ toId, metadata: {} }, ...]
 * Object -> { toId: $ref, metadata: ... }
 */
export function normalizeRelationPayload(
  payload: unknown,
): NormalizedRelation[] {
  if (typeof payload === "string") {
    return [{ toId: payload, metadata: {} }];
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => {
      if (typeof item === "string") {
        return { toId: item, metadata: {} };
      }
      if (typeof item === "object" && item !== null) {
        const { $ref, ...meta } = item as Record<string, unknown>;
        return { toId: $ref as string, metadata: meta };
      }
      throw new Error("Invalid relation payload item");
    });
  }
  if (typeof payload === "object" && payload !== null) {
    const { $ref, ...meta } = payload as Record<string, unknown>;
    return [{ toId: $ref as string, metadata: meta }];
  }
  return [];
}

/**
 * Find relation definition
 */
function findRelation(
  schema: DatafnSchema,
  resource: string,
  relationName: string,
): DatafnRelation | undefined {
  return schema.relations?.find(
    (r) => r.from === resource && r.relation === relationName,
  );
}

/**
 * Execute relate operation
 */
export async function executeRelate(
  adapter: Adapter,
  schema: DatafnSchema,
  mutation: DFQLMutation,
): Promise<{ ok: true; affectedIds: string[] } | { ok: false; code: string; message: string; path: string }> {
  if (!mutation.relations) {
    return { ok: true, affectedIds: [mutation.id] };
  }

  for (const [relName, payload] of Object.entries(mutation.relations)) {
    const relation = findRelation(schema, mutation.resource, relName);
    if (!relation) {
      return {
        ok: false,
        code: "DFQL_UNKNOWN_RELATION",
        message: `Unknown relation: ${relName}`,
        path: `relations.${relName}`,
      };
    }

    const items = normalizeRelationPayload(payload);

    // Validate targets exist
    for (const item of items) {
      const targetExists = await adapter.findOne({
        model: relation.to,
        where: [{ field: "id", operator: "eq", value: item.toId }],
        namespace: "datafn",
      });
      if (!targetExists) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: `Related record not found: ${item.toId}`,
          path: `relations.${relName}`,
        };
      }
    }

    if (relation.type === "many-one") {
      // Update FK on source record (mutation.id)
      // Expect single target
      if (items.length !== 1) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "many-one relation expects single target",
          path: `relations.${relName}`,
        };
      }
      const fkField = relation.fkField || `${relName}Id`; // Default convention or schema
      // We assume adapter update handles simple field update
      await adapter.update({
        model: mutation.resource,
        where: [{ field: "id", operator: "eq", value: mutation.id }],
        data: { [fkField]: items[0].toId },
        namespace: "datafn",
      });
    } else if (relation.type === "one-many") {
      // Update FK on target records (to point to mutation.id)
      const fkField = relation.fkField || relation.inverse || `${relation.from}Id`; // Inverse side FK
      // We need to know the FK field on the target table.
      // Usually schema defines `inverse` or `foreignKey` on the `one-many` side?
      // Actually `one-many` implies the OTHER side is `many-one`.
      // The other side definition should exist.
      // If not, we rely on `fkField` in THIS definition if present, or guess.
      // Assuming standard: target table has `fromResourceId` field.

      for (const item of items) {
        await adapter.update({
          model: relation.to,
          where: [{ field: "id", operator: "eq", value: item.toId }],
          data: { [fkField]: mutation.id },
          namespace: "datafn",
        });
      }
    } else if (relation.type === "many-many") {
      // Create join rows
      // Table name convention: `__datafn_join_${from}_${relation}` (simplified)
      // Actually we need a robust join table name generator.
      // Let's assume `from_relation` format for now or use what `DbDataStore` used.
      const joinTable = `__datafn_join_${mutation.resource}_${relName}`; // Matches DbDataStore

      for (const item of items) {
        // Upsert join row (idempotent)
        // Check if exists
        const existing = await adapter.findOne({
          model: joinTable,
          where: [
            { field: "from", operator: "eq", value: mutation.id },
            { field: "to", operator: "eq", value: item.toId },
          ],
          namespace: "datafn",
        });

        if (existing) {
            // Update metadata if any
            if (Object.keys(item.metadata).length > 0) {
                 await adapter.update({
                    model: joinTable,
                    where: [
                        { field: "from", operator: "eq", value: mutation.id },
                        { field: "to", operator: "eq", value: item.toId },
                    ],
                    data: item.metadata,
                    namespace: "datafn",
                 });
            }
        } else {
            await adapter.create({
            model: joinTable,
            data: {
                from: mutation.id,
                to: item.toId,
                ...item.metadata,
            },
            namespace: "datafn",
            });
        }
      }
    }
  }

  return { ok: true, affectedIds: [mutation.id] };
}

/**
 * Execute modifyRelation operation
 */
export async function executeModifyRelation(
  adapter: Adapter,
  schema: DatafnSchema,
  mutation: DFQLMutation,
): Promise<{ ok: true; affectedIds: string[] } | { ok: false; code: string; message: string; path: string }> {
  if (!mutation.relations) {
    return { ok: true, affectedIds: [mutation.id] };
  }

  for (const [relName, payload] of Object.entries(mutation.relations)) {
    const relation = findRelation(schema, mutation.resource, relName);
    if (!relation) {
        return {
          ok: false,
          code: "DFQL_UNKNOWN_RELATION",
          message: `Unknown relation: ${relName}`,
          path: `relations.${relName}`,
        };
    }

    if (relation.type !== "many-many") {
         return {
          ok: false,
          code: "DFQL_UNSUPPORTED",
          message: `modifyRelation only supported for many-many relations`,
          path: `relations.${relName}`,
        };
    }

    const items = normalizeRelationPayload(payload);
    const joinTable = `__datafn_join_${mutation.resource}_${relName}`;

    for (const item of items) {
        // Must exist
        const existing = await adapter.findOne({
            model: joinTable,
            where: [
                { field: "from", operator: "eq", value: mutation.id },
                { field: "to", operator: "eq", value: item.toId },
            ],
            namespace: "datafn",
        });

        if (!existing) {
             return {
                ok: false,
                code: "NOT_FOUND",
                message: `Relation not found between ${mutation.id} and ${item.toId}`,
                path: `relations.${relName}`,
            };
        }

        // Update
        await adapter.update({
            model: joinTable,
             where: [
                { field: "from", operator: "eq", value: mutation.id },
                { field: "to", operator: "eq", value: item.toId },
            ],
            data: item.metadata,
            namespace: "datafn",
        });
    }
  }
  return { ok: true, affectedIds: [mutation.id] };
}

/**
 * Execute unrelate operation
 */
export async function executeUnrelate(
    adapter: Adapter,
    schema: DatafnSchema,
    mutation: DFQLMutation,
  ): Promise<{ ok: true; affectedIds: string[] } | { ok: false; code: string; message: string; path: string }> {
    if (!mutation.relations) {
      return { ok: true, affectedIds: [mutation.id] };
    }
  
    for (const [relName, payload] of Object.entries(mutation.relations)) {
      const relation = findRelation(schema, mutation.resource, relName);
      if (!relation) {
         return {
            ok: false,
            code: "DFQL_UNKNOWN_RELATION",
            message: `Unknown relation: ${relName}`,
            path: `relations.${relName}`,
          };
      }
  
      const items = normalizeRelationPayload(payload);
  
      if (relation.type === "many-one") {
        // Clear FK on source
        const fkField = relation.fkField || `${relName}Id`;
        await adapter.update({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          data: { [fkField]: null },
          namespace: "datafn",
        });
      } else if (relation.type === "one-many") {
        // Clear FK on target
        const fkField = relation.fkField || relation.inverse || `${relation.from}Id`;
        for (const item of items) {
          await adapter.update({
            model: relation.to,
            where: [{ field: "id", operator: "eq", value: item.toId }],
            data: { [fkField]: null },
            namespace: "datafn",
          });
        }
      } else if (relation.type === "many-many") {
        const joinTable = `__datafn_join_${mutation.resource}_${relName}`;
        for (const item of items) {
          await adapter.delete({
            model: joinTable,
            where: [
                { field: "from", operator: "eq", value: mutation.id },
                { field: "to", operator: "eq", value: item.toId },
            ],
            namespace: "datafn",
          });
        }
      }
    }
  
    return { ok: true, affectedIds: [mutation.id] };
  }
