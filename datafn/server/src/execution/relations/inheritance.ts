import type {
  DatafnRelationSchema,
  DatafnResourceSchema,
  DatafnSchema,
} from "../../core-types.js";
import { getJoinTableName, normalizeRelationPayload, resolveCapabilities } from "@datafn/core";
import type { CapabilityEntry, ShareableCapability } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { DFQLMutation } from "../mutation/dfql.js";
import { getPermissionsTable } from "../mutation/share.js";

const RELATION_INHERITED_GRANT_KIND = "relation_inherited";

type AccessLevel = "viewer" | "editor" | "owner";

type InheritanceError = {
  ok: false;
  code: string;
  message: string;
  path: string;
};

type InheritanceResult = { ok: true } | InheritanceError;

type InheritanceRelation = {
  relationName: string;
  relation: DatafnRelationSchema;
  childResource: string;
};

type UnrelateTargets = Record<string, string[]>;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizePrincipalFromUserId(userId: string): string {
  return userId.includes(":") ? userId : `user:${userId}`;
}

function parsePrincipalFromShareWith(
  shareWith: DFQLMutation["shareWith"] | undefined,
): string | null {
  if (!shareWith) {
    return null;
  }
  const principalId = normalizeNonEmptyString(shareWith.principalId);
  if (principalId) {
    return principalId;
  }
  const userId = normalizeNonEmptyString(shareWith.userId);
  if (!userId) {
    return null;
  }
  return canonicalizePrincipalFromUserId(userId);
}

function parseAccessLevel(value: unknown): AccessLevel | null {
  if (value === "viewer" || value === "editor" || value === "owner") {
    return value;
  }
  return null;
}

function isGrantActive(row: Record<string, unknown>): boolean {
  return row.revokedAt === undefined || row.revokedAt === null;
}

function includesResourceName(name: string | string[], resource: string): boolean {
  if (Array.isArray(name)) {
    return name.includes(resource);
  }
  return name === resource;
}

function pickResourceName(name: string | string[]): string {
  return Array.isArray(name) ? name[0] : name;
}

function isShareableCapability(entry: CapabilityEntry): entry is ShareableCapability {
  return typeof entry === "object" && entry !== null && "shareable" in entry;
}

function getResource(schema: DatafnSchema, resourceName: string): DatafnResourceSchema | undefined {
  return schema.resources.find((resource) => resource.name === resourceName);
}

function getInheritanceConfig(schema: DatafnSchema, resourceName: string): {
  requireRelateConsent: boolean;
  relations: InheritanceRelation[];
} | null {
  const resource = getResource(schema, resourceName);
  if (!resource) {
    return null;
  }

  const resolvedCapabilities = resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );
  const shareable = resolvedCapabilities.find(isShareableCapability);
  const relationInheritance = shareable?.shareable.relationInheritance;
  if (!relationInheritance?.enabled) {
    return null;
  }

  const configuredNames = new Set(
    (relationInheritance.relations ?? []).filter(
      (name: string): name is string => typeof name === "string" && name.length > 0,
    ),
  );

  const schemaRelations = (schema.relations ?? []).filter(
    (relation) =>
      includesResourceName(relation.from, resourceName) &&
      typeof relation.relation === "string" &&
      relation.relation.length > 0,
  );

  const selectedRelations = schemaRelations
    .filter((relation) => {
      if (configuredNames.size === 0) {
        return true;
      }
      return configuredNames.has(relation.relation as string);
    })
    .map((relation) => ({
      relationName: relation.relation as string,
      relation,
      childResource: pickResourceName(relation.to),
    }));

  return {
    requireRelateConsent: relationInheritance.requireRelateConsent ?? true,
    relations: selectedRelations,
  };
}

function buildSourceRef(parentResource: string, parentId: string, relationName: string): string {
  return `${parentResource}:${parentId}:${relationName}`;
}

function buildInheritedGrantId(input: {
  parentResource: string;
  parentId: string;
  relationName: string;
  childResource: string;
  childId: string;
  principalId: string;
}): string {
  return [
    "inh",
    input.parentResource,
    input.parentId,
    input.relationName,
    input.childResource,
    input.childId,
    input.principalId,
  ].join(":");
}

async function getChildIdsForParentRelation(input: {
  db: Adapter;
  relation: DatafnRelationSchema;
  relationName: string;
  parentResource: string;
  parentId: string;
  namespace: string;
}): Promise<string[]> {
  const { db, relation, relationName, parentResource, parentId, namespace } = input;

  if (relation.type === "one-many") {
    const childResource = pickResourceName(relation.to);
    const fkField = relation.fkField || relation.inverse || `${parentResource}Id`;
    const rows = await db.findMany({
      model: childResource,
      where: [{ field: fkField, operator: "eq", value: parentId }],
      namespace,
    });
    return rows
      .map((row) => normalizeNonEmptyString((row as Record<string, unknown>).id))
      .filter((value): value is string => value !== null);
  }

  if (relation.type === "many-many") {
    const joinTable = getJoinTableName(parentResource, relationName, relation.joinTable);
    const fromColumn = relation.joinColumns?.from || "from";
    const toColumn = relation.joinColumns?.to || "to";
    const rows = await db.findMany({
      model: joinTable,
      where: [{ field: fromColumn, operator: "eq", value: parentId }],
      namespace,
    });
    return rows
      .map((row) => normalizeNonEmptyString((row as Record<string, unknown>)[toColumn]))
      .filter((value): value is string => value !== null);
  }

  if (relation.type === "many-one") {
    const parent = await db.findOne({
      model: parentResource,
      where: [{ field: "id", operator: "eq", value: parentId }],
      namespace,
    });
    if (!parent) {
      return [];
    }
    const fkField = relation.fkField || `${relationName}Id`;
    const childId = normalizeNonEmptyString((parent as Record<string, unknown>)[fkField]);
    if (!childId) {
      return [];
    }
    return [childId];
  }

  return [];
}

async function upsertInheritedGrant(input: {
  db: Adapter;
  namespace: string;
  parentResource: string;
  parentId: string;
  relationName: string;
  childResource: string;
  childId: string;
  principalId: string;
  level: AccessLevel;
  actorId: string | undefined;
}): Promise<void> {
  const {
    db,
    namespace,
    parentResource,
    parentId,
    relationName,
    childResource,
    childId,
    principalId,
    level,
    actorId,
  } = input;
  const permissionsTable = getPermissionsTable(parentResource);
  const sourceRef = buildSourceRef(parentResource, parentId, relationName);
  const id = buildInheritedGrantId({
    parentResource,
    parentId,
    relationName,
    childResource,
    childId,
    principalId,
  });
  const now = Date.now();

  await db.upsert({
    model: permissionsTable,
    where: [{ field: "id", operator: "eq", value: id }],
    create: {
      id,
      resourceType: childResource,
      resourceNs: namespace,
      resourceId: childId,
      principalId,
      level,
      grantKind: RELATION_INHERITED_GRANT_KIND,
      sourceRef,
      grantedBy: actorId ?? "system",
      grantedAt: now,
      revokedAt: null,
    },
    update: {
      resourceType: childResource,
      resourceNs: namespace,
      resourceId: childId,
      principalId,
      level,
      grantKind: RELATION_INHERITED_GRANT_KIND,
      sourceRef,
      grantedBy: actorId ?? "system",
      grantedAt: now,
      revokedAt: null,
    },
    conflictTarget: "id",
    namespace,
  });
}

async function deletePermissionRows(
  db: Adapter,
  namespace: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  for (const row of rows) {
    const id = normalizeNonEmptyString(row.id);
    if (!id) {
      continue;
    }
    await db.delete({
      model: getPermissionsTable("unused"),
      where: [{ field: "id", operator: "eq", value: id }],
      namespace,
    });
  }
}

async function listActiveParentGrants(input: {
  db: Adapter;
  namespace: string;
  parentResource: string;
  parentId: string;
}): Promise<Array<{ principalId: string; level: AccessLevel }>> {
  const { db, namespace, parentResource, parentId } = input;
  const rows = await db.findMany({
    model: getPermissionsTable(parentResource),
    where: [
      { field: "resourceType", operator: "eq", value: parentResource },
      { field: "resourceNs", operator: "eq", value: namespace },
    ],
    namespace,
  });

  const grants = rows
    .map((row) => row as Record<string, unknown>)
    .filter((row) => isGrantActive(row))
    .filter(
      (row) =>
        row.resourceId === null ||
        row.resourceId === parentId,
    )
    .map((row) => ({
      principalId: normalizeNonEmptyString(row.principalId),
      level: parseAccessLevel(row.level),
    }))
    .filter(
      (
        row,
      ): row is {
        principalId: string;
        level: AccessLevel;
      } => !!row.principalId && !!row.level,
    );

  const deduped = new Map<string, AccessLevel>();
  const weight: Record<AccessLevel, number> = { viewer: 1, editor: 2, owner: 3 };
  for (const grant of grants) {
    const current = deduped.get(grant.principalId);
    if (!current || weight[grant.level] > weight[current]) {
      deduped.set(grant.principalId, grant.level);
    }
  }

  return Array.from(deduped.entries()).map(([principalId, level]) => ({
    principalId,
    level,
  }));
}

async function hasActiveParentGrant(input: {
  db: Adapter;
  namespace: string;
  parentResource: string;
  parentId: string;
}): Promise<boolean> {
  const grants = await listActiveParentGrants(input);
  return grants.length > 0;
}

function extractRelationTargetsFromMutation(
  mutation: DFQLMutation,
  relationName: string,
): string[] {
  if (!mutation.relations || !(relationName in mutation.relations)) {
    return [];
  }
  try {
    return normalizeRelationPayload(mutation.relations[relationName]).map((item) => item.toId);
  } catch {
    return [];
  }
}

function getConsentPath(
  relationName: string,
  payload: unknown,
  index: number,
): string {
  if (Array.isArray(payload)) {
    return `relations.${relationName}[${index}].consent`;
  }
  return `relations.${relationName}.consent`;
}

export async function enforceRelateConsentForInheritance(input: {
  schema: DatafnSchema;
  db: Adapter;
  namespace: string;
  mutation: DFQLMutation;
}): Promise<InheritanceResult> {
  if (input.mutation.operation !== "relate") {
    return { ok: true };
  }

  const config = getInheritanceConfig(input.schema, input.mutation.resource);
  if (!config || !config.requireRelateConsent || !input.mutation.relations) {
    return { ok: true };
  }

  const hasImplications = await hasActiveParentGrant({
    db: input.db,
    namespace: input.namespace,
    parentResource: input.mutation.resource,
    parentId: input.mutation.id,
  });
  if (!hasImplications) {
    return { ok: true };
  }

  for (const relation of config.relations) {
    const payload = input.mutation.relations[relation.relationName];
    if (payload === undefined) {
      continue;
    }
    const items = Array.isArray(payload) ? payload : [payload];
    for (let i = 0; i < items.length; i++) {
      const candidate = items[i];
      const consent =
        typeof candidate === "object" && candidate !== null
          ? (candidate as Record<string, unknown>).consent
          : undefined;
      if (consent !== true) {
        return {
          ok: false,
          code: "DFQL_RELATION_INHERITANCE_FORBIDDEN",
          message: "Relate consent required",
          path: getConsentPath(relation.relationName, payload, i),
        };
      }
    }
  }

  return { ok: true };
}

export async function applyRelationInheritanceForShare(input: {
  db: Adapter;
  schema: DatafnSchema;
  namespace: string;
  actorId: string | undefined;
  parentResource: string;
  principalId: string;
  level: AccessLevel;
  parentId: string | null;
}): Promise<InheritanceResult> {
  const config = getInheritanceConfig(input.schema, input.parentResource);
  if (!config || config.relations.length === 0) {
    return { ok: true };
  }

  const parentIds: string[] = [];
  if (input.parentId) {
    parentIds.push(input.parentId);
  } else {
    const rows = await input.db.findMany({
      model: input.parentResource,
      where: [],
      namespace: input.namespace,
    });
    for (const row of rows) {
      const id = normalizeNonEmptyString((row as Record<string, unknown>).id);
      if (id) {
        parentIds.push(id);
      }
    }
  }

  for (const parentId of parentIds) {
    for (const relation of config.relations) {
      const childIds = await getChildIdsForParentRelation({
        db: input.db,
        relation: relation.relation,
        relationName: relation.relationName,
        parentResource: input.parentResource,
        parentId,
        namespace: input.namespace,
      });
      for (const childId of childIds) {
        await upsertInheritedGrant({
          db: input.db,
          namespace: input.namespace,
          parentResource: input.parentResource,
          parentId,
          relationName: relation.relationName,
          childResource: relation.childResource,
          childId,
          principalId: input.principalId,
          level: input.level,
          actorId: input.actorId,
        });
      }
    }
  }

  return { ok: true };
}

export async function applyRelationInheritanceForUnshare(input: {
  db: Adapter;
  schema: DatafnSchema;
  namespace: string;
  parentResource: string;
  parentId: string | null;
  principalId: string;
}): Promise<InheritanceResult> {
  const config = getInheritanceConfig(input.schema, input.parentResource);
  if (!config || config.relations.length === 0) {
    return { ok: true };
  }

  const rows = await input.db.findMany({
    model: getPermissionsTable(input.parentResource),
    where: [
      { field: "resourceNs", operator: "eq", value: input.namespace },
      { field: "principalId", operator: "eq", value: input.principalId },
      { field: "grantKind", operator: "eq", value: RELATION_INHERITED_GRANT_KIND },
    ],
    namespace: input.namespace,
  });

  const validRelationNames = new Set(config.relations.map((relation) => relation.relationName));
  const filteredRows = rows
    .map((row) => row as Record<string, unknown>)
    .filter((row) => {
      const sourceRef = normalizeNonEmptyString(row.sourceRef);
      if (!sourceRef) {
        return false;
      }
      const parts = sourceRef.split(":");
      if (parts.length < 3) {
        return false;
      }
      const [sourceResource, sourceParentId] = parts;
      const relationName = parts.slice(2).join(":");
      if (sourceResource !== input.parentResource) {
        return false;
      }
      if (input.parentId && sourceParentId !== input.parentId) {
        return false;
      }
      return validRelationNames.has(relationName);
    });

  await deletePermissionRows(input.db, input.namespace, filteredRows);
  return { ok: true };
}

export async function applyRelationInheritanceForRelate(input: {
  db: Adapter;
  schema: DatafnSchema;
  namespace: string;
  actorId: string | undefined;
  mutation: DFQLMutation;
}): Promise<InheritanceResult> {
  if (input.mutation.operation !== "relate") {
    return { ok: true };
  }

  const config = getInheritanceConfig(input.schema, input.mutation.resource);
  if (!config || config.relations.length === 0 || !input.mutation.relations) {
    return { ok: true };
  }

  const parentGrants = await listActiveParentGrants({
    db: input.db,
    namespace: input.namespace,
    parentResource: input.mutation.resource,
    parentId: input.mutation.id,
  });
  if (parentGrants.length === 0) {
    return { ok: true };
  }

  for (const relation of config.relations) {
    const childIds = extractRelationTargetsFromMutation(input.mutation, relation.relationName);
    if (childIds.length === 0) {
      continue;
    }

    for (const grant of parentGrants) {
      for (const childId of childIds) {
        await upsertInheritedGrant({
          db: input.db,
          namespace: input.namespace,
          parentResource: input.mutation.resource,
          parentId: input.mutation.id,
          relationName: relation.relationName,
          childResource: relation.childResource,
          childId,
          principalId: grant.principalId,
          level: grant.level,
          actorId: input.actorId,
        });
      }
    }
  }

  return { ok: true };
}

export async function collectRelationInheritanceTargetsForUnrelate(input: {
  db: Adapter;
  schema: DatafnSchema;
  namespace: string;
  mutation: DFQLMutation;
}): Promise<UnrelateTargets> {
  const config = getInheritanceConfig(input.schema, input.mutation.resource);
  if (!config || config.relations.length === 0 || !input.mutation.relations) {
    return {};
  }

  const output: UnrelateTargets = {};
  for (const relationConfig of config.relations) {
    const payload = input.mutation.relations[relationConfig.relationName];
    if (payload === undefined) {
      continue;
    }

    const toIds = extractRelationTargetsFromMutation(input.mutation, relationConfig.relationName);
    if (toIds.length > 0) {
      output[relationConfig.relationName] = Array.from(new Set(toIds));
      continue;
    }

    if (relationConfig.relation.type === "many-one") {
      const fkField =
        relationConfig.relation.fkField || `${relationConfig.relationName}Id`;
      const parent = await input.db.findOne({
        model: input.mutation.resource,
        where: [{ field: "id", operator: "eq", value: input.mutation.id }],
        namespace: input.namespace,
      });
      const currentId = normalizeNonEmptyString(
        (parent as Record<string, unknown> | null)?.[fkField],
      );
      if (currentId) {
        output[relationConfig.relationName] = [currentId];
      }
    }
  }

  return output;
}

export async function applyRelationInheritanceForUnrelate(input: {
  db: Adapter;
  schema: DatafnSchema;
  namespace: string;
  mutation: DFQLMutation;
  targets: UnrelateTargets;
}): Promise<InheritanceResult> {
  if (input.mutation.operation !== "unrelate") {
    return { ok: true };
  }

  const config = getInheritanceConfig(input.schema, input.mutation.resource);
  if (!config || config.relations.length === 0) {
    return { ok: true };
  }

  const allRows = await input.db.findMany({
    model: getPermissionsTable(input.mutation.resource),
    where: [
      { field: "resourceNs", operator: "eq", value: input.namespace },
      { field: "grantKind", operator: "eq", value: RELATION_INHERITED_GRANT_KIND },
    ],
    namespace: input.namespace,
  });

  const relationByName = new Map(
    config.relations.map((relation) => [relation.relationName, relation]),
  );

  const rowsToDelete: Array<Record<string, unknown>> = [];
  for (const [relationName, childIds] of Object.entries(input.targets)) {
    const relation = relationByName.get(relationName);
    if (!relation || childIds.length === 0) {
      continue;
    }

    const sourceRef = buildSourceRef(
      input.mutation.resource,
      input.mutation.id,
      relationName,
    );
    const childIdSet = new Set(childIds);

    for (const row of allRows) {
      const record = row as Record<string, unknown>;
      if (record.resourceType !== relation.childResource) {
        continue;
      }
      if (record.sourceRef !== sourceRef) {
        continue;
      }
      const resourceId = normalizeNonEmptyString(record.resourceId);
      if (!resourceId || !childIdSet.has(resourceId)) {
        continue;
      }
      rowsToDelete.push(record);
    }
  }

  await deletePermissionRows(input.db, input.namespace, rowsToDelete);
  return { ok: true };
}
