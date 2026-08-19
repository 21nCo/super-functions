import type {
  DatafnSchema,
  DatafnResourceSchema,
  DatafnFieldSchema,
  DatafnRelationSchema,
} from "./types.js";
import {
  endpointIncludes,
  firstEndpoint,
} from "./relation-endpoints.js";

export interface SchemaIndex {
  resourcesByName: Map<string, DatafnResourceSchema>;
  fieldsByResource: Map<string, Map<string, DatafnFieldSchema>>;
  /** All relations involving the resource (as from OR inverse to). */
  relationsByResource: Map<string, DatafnRelationSchema[]>;
  /** Relations where the resource is the from side. */
  relationsFromResource: Map<string, DatafnRelationSchema[]>;
}

export function buildSchemaIndex(schema: DatafnSchema): SchemaIndex {
  const resourcesByName = new Map<string, DatafnResourceSchema>();
  const fieldsByResource = new Map<string, Map<string, DatafnFieldSchema>>();
  const relationsByResource = new Map<string, DatafnRelationSchema[]>();
  const relationsFromResource = new Map<string, DatafnRelationSchema[]>();

  for (const resource of schema.resources) {
    resourcesByName.set(resource.name, resource);
    const fieldMap = new Map<string, DatafnFieldSchema>();
    for (const field of resource.fields) {
      fieldMap.set(field.name, field);
    }
    fieldsByResource.set(resource.name, fieldMap);
    relationsByResource.set(resource.name, []);
    relationsFromResource.set(resource.name, []);
  }

  if (schema.relations) {
    for (const rel of schema.relations) {
      const fromResources = Array.isArray(rel.from) ? rel.from : [rel.from];
      const toResources = Array.isArray(rel.to) ? rel.to : [rel.to];

      for (const fromRes of fromResources) {
        const fromRelations = relationsFromResource.get(fromRes) ?? [];
        fromRelations.push(rel);
        relationsFromResource.set(fromRes, fromRelations);

        const allRelations = relationsByResource.get(fromRes) ?? [];
        allRelations.push(rel);
        relationsByResource.set(fromRes, allRelations);
      }

      for (const toRes of toResources) {
        if (rel.inverse) {
          const allRelations = relationsByResource.get(toRes) ?? [];
          if (!allRelations.includes(rel)) {
            allRelations.push(rel);
            relationsByResource.set(toRes, allRelations);
          }
        }
      }
    }
  }

  return { resourcesByName, fieldsByResource, relationsByResource, relationsFromResource };
}

export function getResource(
  index: SchemaIndex,
  name: string,
): DatafnResourceSchema | undefined {
  return index.resourcesByName.get(name);
}

export function getField(
  index: SchemaIndex,
  resource: string,
  field: string,
): DatafnFieldSchema | undefined {
  return index.fieldsByResource.get(resource)?.get(field);
}

export function getRelationsFrom(
  index: SchemaIndex,
  resource: string,
): DatafnRelationSchema[] {
  return index.relationsFromResource.get(resource) ?? [];
}

export function getRelation(
  index: SchemaIndex,
  fromResource: string,
  relationName: string,
): DatafnRelationSchema | undefined {
  const relations = index.relationsFromResource.get(fromResource) ?? [];
  return relations.find((r) => r.relation === relationName);
}

export function getRelationTarget(relation: DatafnRelationSchema): string {
  return firstEndpoint(relation.to);
}

/**
 * Find a relation by name in either direction (forward or inverse).
 * Checks both `relation === relationName` (from side) and `inverse === relationName` (to side).
 */
export function findRelationBidirectional(
  schema: DatafnSchema,
  resource: string,
  relationName: string,
): DatafnRelationSchema | undefined {
  return schema.relations?.find(
    (r) =>
      (endpointIncludes(r.from, resource) && r.relation === relationName) ||
      (endpointIncludes(r.to, resource) && r.inverse === relationName),
  );
}
