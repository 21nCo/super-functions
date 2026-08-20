import type { DatafnRelationSchema, DatafnSchema } from "./types.js";
import { endpointIncludes, endpointList, firstEndpoint } from "./relation-endpoints.js";

export type DatafnRelationFkField = {
  field: string;
  resourceField?: string;
  optional: boolean;
};

function htreeFkField(relation: DatafnRelationSchema): string {
  return relation.fkField || relation.foreignKey || relation.inverse || "parentId";
}

export function relationFkFieldForOneMany(relation: DatafnRelationSchema): string {
  return relation.fkField || relation.foreignKey || relation.inverse || `${firstEndpoint(relation.from)}Id`;
}

export function relationFkFieldForManyOne(relation: DatafnRelationSchema): string {
  return relation.fkField || relation.foreignKey || `${relation.relation ?? firstEndpoint(relation.to)}Id`;
}

function fkResourceFieldForRelation(
  relation: DatafnRelationSchema,
  side: "from" | "to",
): string {
  if (relation.fkResourceField) return relation.fkResourceField;
  if (relation.type === "htree") {
    return `${htreeFkField(relation).replace(/Id$/, "")}Resource`;
  }
  const base = side === "to"
    ? (relation.relation || "target")
    : (relation.inverse || relation.relation || "source");
  return `${base.replace(/Id$/, "")}Resource`;
}

function isOptionalResourceField(
  schema: DatafnSchema,
  resourceName: string,
  fieldName: string,
): boolean {
  const resource = schema.resources.find((candidate) => candidate.name === resourceName);
  const field = resource?.fields.find((candidate) => candidate.name === fieldName);
  if (!field) return true;
  return field.required !== true && field.nullable === true;
}

/**
 * Returns generated or declared relation FK fields that live on a resource table.
 */
export function getRelationFkFieldsForResource(
  schema: DatafnSchema,
  resourceName: string,
): DatafnRelationFkField[] {
  const fields = new Map<string, DatafnRelationFkField>();
  const add = (field: string, resourceField?: string) => {
    if (fields.has(field)) return;
    fields.set(field, {
      field,
      resourceField,
      optional: isOptionalResourceField(schema, resourceName, field),
    });
  };

  for (const relation of schema.relations ?? []) {
    if (relation.type === "many-one" && endpointIncludes(relation.from, resourceName)) {
      const toResources = endpointList(relation.to);
      add(
        relationFkFieldForManyOne(relation),
        toResources.length > 1 ? fkResourceFieldForRelation(relation, "to") : undefined,
      );
    } else if (relation.type === "one-many" && endpointIncludes(relation.to, resourceName)) {
      const fromResources = endpointList(relation.from);
      add(
        relationFkFieldForOneMany(relation),
        fromResources.length > 1 ? fkResourceFieldForRelation(relation, "from") : undefined,
      );
    } else if (relation.type === "htree" && endpointIncludes(relation.to, resourceName)) {
      const fromResources = endpointList(relation.from);
      add(
        htreeFkField(relation),
        fromResources.length > 1 ? fkResourceFieldForRelation(relation, "from") : undefined,
      );
    }
  }

  return [...fields.values()];
}

/**
 * Converts empty-string optional relation FK values to null before persistence.
 */
export function normalizeRelationFkRecord(
  schema: DatafnSchema,
  resourceName: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...record };
  for (const field of getRelationFkFieldsForResource(schema, resourceName)) {
    if (!field.optional) continue;
    if (!(field.field in next)) continue;
    const value = next[field.field];
    if (value !== "") continue;
    next[field.field] = null;
    if (field.resourceField && field.resourceField in next) {
      next[field.resourceField] = null;
    }
  }
  return next;
}
