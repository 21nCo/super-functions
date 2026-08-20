import type { DatafnRelationSchema, DatafnSchema } from "./types.js";

export type DatafnRelationEndpoint = string | readonly string[];

export type DatafnRelationDirection = "forward" | "inverse";

export type DatafnRelationMatch = {
  relation: DatafnRelationSchema;
  direction: DatafnRelationDirection;
};

type DatafnEndpointSchema = {
  resources: readonly { name: string; idPrefix?: string }[];
};

export function endpointList(endpoint: DatafnRelationEndpoint): string[] {
  return typeof endpoint === "string" ? [endpoint] : [...endpoint];
}

export function endpointIncludes(
  endpoint: DatafnRelationEndpoint,
  resource: string,
): boolean {
  return endpointList(endpoint).includes(resource);
}

export function firstEndpoint(endpoint: DatafnRelationEndpoint): string {
  return endpointList(endpoint)[0] ?? "";
}

export function resourceNameFromId(id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  const index = id.indexOf(":");
  if (index <= 0) return undefined;
  return id.slice(0, index);
}

export function resolveEndpointResource(
  endpoint: DatafnRelationEndpoint,
  id: unknown,
  schema?: DatafnEndpointSchema,
): string | undefined {
  const resources = endpointList(endpoint);
  if (resources.length === 1) return resources[0];
  if (typeof id === "string" && schema) {
    const prefixedMatch = schema.resources
      .filter((resource) => resources.includes(resource.name))
      .map((resource) => ({
        name: resource.name,
        prefix: resource.idPrefix ?? `${resource.name}:`,
      }))
      .filter((candidate) => {
        if (id === candidate.prefix) return true;
        return /[a-z0-9]$/i.test(candidate.prefix)
          ? id.startsWith(`${candidate.prefix}:`)
          : id.startsWith(candidate.prefix);
      })
      .sort((left, right) => right.prefix.length - left.prefix.length)[0];
    if (prefixedMatch) {
      return prefixedMatch.name;
    }
  }
  const resourceFromId = resourceNameFromId(id);
  if (resourceFromId && resources.includes(resourceFromId)) {
    return resourceFromId;
  }
  return undefined;
}

export function relationMatchesForward(
  relation: DatafnRelationSchema,
  resource: string,
  relationName: string,
): boolean {
  return (
    endpointIncludes(relation.from, resource) &&
    relation.relation === relationName
  );
}

export function relationMatchesInverse(
  relation: DatafnRelationSchema,
  resource: string,
  relationName: string,
): boolean {
  return (
    endpointIncludes(relation.to, resource) &&
    relation.inverse === relationName
  );
}

export function findRelationMatch(
  schema: DatafnSchema,
  resource: string,
  relationName: string,
): DatafnRelationMatch | undefined {
  return schema.relations
    ?.map((relation) => {
      if (relationMatchesForward(relation, resource, relationName)) {
        return { relation, direction: "forward" as const };
      }
      if (relationMatchesInverse(relation, resource, relationName)) {
        return { relation, direction: "inverse" as const };
      }
      return undefined;
    })
    .find((match): match is DatafnRelationMatch => Boolean(match));
}

export function relationSourceEndpoint(
  relation: DatafnRelationSchema,
  direction: DatafnRelationDirection,
): DatafnRelationEndpoint {
  return direction === "forward" ? relation.from : relation.to;
}

export function relationTargetEndpoint(
  relation: DatafnRelationSchema,
  direction: DatafnRelationDirection,
): DatafnRelationEndpoint {
  return direction === "forward" ? relation.to : relation.from;
}

export function relationKeyFor(
  fromResource: string,
  relation: DatafnRelationSchema,
): string {
  return `${fromResource}.${relation.relation}`;
}
