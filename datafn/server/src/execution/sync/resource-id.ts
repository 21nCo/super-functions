import type { DatafnSchema } from "../../core-types.js";

export function resourceIdMatches(
  schema: DatafnSchema,
  resourceName: string,
  id: string,
): boolean {
  const resource = schema.resources.find((item) => item.name === resourceName);
  if (resource?.idPrefix) {
    return id.startsWith(resource.idPrefix);
  }
  return id === resourceName || id.startsWith(`${resourceName}:`);
}
