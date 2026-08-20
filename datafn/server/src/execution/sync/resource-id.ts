import type { DatafnSchema } from "../../core-types.js";
import { resolveEndpointResource } from "@datafn/core";

export function resourceIdMatches(
  schema: DatafnSchema,
  candidates: readonly string[],
  resourceName: string,
  id: string,
): boolean {
  return resolveEndpointResource(candidates, id, schema) === resourceName;
}
