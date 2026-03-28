/**
 * Shared relation payload normalization utilities.
 * Used by both server mutation executor and offline client.
 */

/**
 * Normalized relation payload item.
 */
export interface NormalizedRelation {
  toId: string;
  metadata: Record<string, unknown>;
}

/**
 * Normalize relation payload to consistent format.
 * - String -> [{ toId, metadata: {} }]
 * - String[] -> [{ toId, metadata: {} }, ...]
 * - Object with $ref -> [{ toId: $ref, metadata: {...rest} }]
 * - Array of above -> flatten
 */
export function normalizeRelationPayload(
  payload: unknown,
): NormalizedRelation[] {
  if (typeof payload === "string") {
    return [{ toId: payload, metadata: {} }];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      if (Array.isArray(item)) {
        return normalizeRelationPayload(item);
      }
      if (typeof item === "string") {
        return { toId: item, metadata: {} };
      }
      if (typeof item === "object" && item !== null) {
        const { $ref, ...meta } = item as Record<string, unknown>;
        if (!$ref || typeof $ref !== "string") {
          throw new Error("Invalid relation payload item: missing or invalid $ref");
        }
        return { toId: $ref as string, metadata: meta };
      }
      throw new Error("Invalid relation payload item type");
    });
  }
  if (typeof payload === "object" && payload !== null) {
    const { $ref, ...meta } = payload as Record<string, unknown>;
    if (!$ref || typeof $ref !== "string") {
      throw new Error("Invalid relation payload: missing or invalid $ref");
    }
    return [{ toId: $ref as string, metadata: meta }];
  }
  throw new Error("Invalid relation payload: must be string, object with $ref, or array");
}
