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
  const resource = schema.resources.find((item) => item.name === resourceName);
  return !resource?.idPrefix && id === resourceName;
}
