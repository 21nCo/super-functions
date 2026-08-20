import type { DatafnSchema } from "../../core-types.js";
import { resolveEndpointResource } from "@datafn/core";

export function resourceIdMatches(
  schema: DatafnSchema,
  candidates: readonly string[],
  resourceName: string,
  id: string,
): boolean {
  const resolved = resolveEndpointResource(candidates, id, schema);
  if (resolved === resourceName) return true;
  const normalizedPrefixMatch = schema.resources
    .filter((item) => candidates.includes(item.name) && item.idPrefix)
    .map((item) => ({
      name: item.name,
      prefix: item.idPrefix!.endsWith(":")
        ? item.idPrefix!.slice(0, -1)
        : item.idPrefix!,
    }))
    .filter((item) => item.prefix === id)
    .sort((left, right) => right.prefix.length - left.prefix.length)[0];
  if (normalizedPrefixMatch) return normalizedPrefixMatch.name === resourceName;
  const resource = schema.resources.find((item) => item.name === resourceName);
  return !resource?.idPrefix && id === resourceName;
}
