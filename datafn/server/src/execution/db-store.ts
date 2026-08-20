/**
 * Database-backed DataStore implementation
 * Wraps @superfunctions/db.Adapter to provide DataStore interface for query execution
 *
 * This implementation pre-loads all necessary data to provide synchronous access
 * as required by the current select materialization logic.
 */

import type { Adapter, WhereClause } from "@superfunctions/db";
import type { DataStore, JoinRow } from "./store.js";
import {
  endpointIncludes,
  endpointList,
  findRelationMatch,
  getRelationJoinTableName,
  relationKeyFor,
  relationTargetEndpoint,
  resolveEndpointResource,
  resourceNameFromId,
} from "@datafn/core";
import type { DatafnLogger } from "../logger.js";
import type { DatafnSchema } from "../core-types.js";
import { isPrivateShareableResource, resolveAccessLevel } from "../validation/authz.js";

function relationNameFor(relation: { relation?: string; inverse?: string; to: string | readonly string[] }): string {
  if (relation.relation) return relation.relation;
  if (relation.inverse) return relation.inverse;
  return typeof relation.to === "string" ? relation.to : relation.to[0];
}

export class DbDataStore implements DataStore {
  private recordsCache: Map<string, Record<string, unknown>[]> = new Map();
  private joinCache: Map<string, JoinRow[]> = new Map();

  private mergeRecords(resource: string, rows: Record<string, unknown>[]): void {
    if (rows.length === 0) {
      if (!this.recordsCache.has(resource)) this.recordsCache.set(resource, []);
      return;
    }
    const merged = new Map<string, Record<string, unknown>>();
    for (const row of this.recordsCache.get(resource) ?? []) {
      if (typeof row.id === "string") merged.set(row.id, row);
    }
    for (const row of rows) {
      if (typeof row.id === "string") merged.set(row.id, row);
    }
    this.recordsCache.set(
      resource,
      [...merged.values()].sort((a, b) =>
        String(a.id || "").localeCompare(String(b.id || "")),
      ),
    );
  }

  private static async applyActorVisibilityFilter(
    store: DbDataStore,
    db: Adapter,
    schema: any,
    namespace: string,
    actorId: string | undefined,
    logger?: DatafnLogger,
  ): Promise<void> {
    for (const [resourceName, rows] of store.recordsCache.entries()) {
      if (!isPrivateShareableResource(schema, resourceName)) {
        continue;
      }
      if (!actorId) {
        store.recordsCache.set(resourceName, []);
        continue;
      }

      const visible: Record<string, unknown>[] = [];
      for (const row of rows) {
        const recordId = typeof row.id === "string" ? row.id : null;
        if (!recordId) {
          continue;
        }
        try {
          const level = await resolveAccessLevel(
            db,
            schema,
            resourceName,
            recordId,
            actorId,
            namespace,
          );
          if (level) {
            visible.push(row);
          }
        } catch (error) {
          logger?.warn("DbDataStore visibility filter failed", {
            error: String(error),
            resource: resourceName,
            operation: "db-store-visibility-filter",
          });
        }
      }
      store.recordsCache.set(resourceName, visible);
    }
  }

  /**
   * Create a DataStore from DB adapter by pre-loading data for a query.
   *
   * @param primaryResource  If provided, uses `primaryWhere` for this resource's fetch.
   * @param primaryWhere     WHERE clauses for the primary resource (base-field pre-filter).
   */
  static async create(
    db: Adapter,
    resources: string[],
    namespace: string = "datafn",
    primaryResource?: string,
    primaryWhere?: WhereClause[],
    logger?: DatafnLogger,
  ): Promise<DbDataStore> {
    const store = new DbDataStore();

    // Pre-load all records for requested resources
    for (const resource of resources) {
      try {
        // Use pre-filter only for the primary resource (SCALE-004)
        const where =
          resource === primaryResource && primaryWhere && primaryWhere.length > 0
            ? primaryWhere
            : [];

        const records = await db.findMany({ model: resource, where, namespace });

        // Sort by id for deterministic ordering
        const sorted = records.sort((a, b) => {
          const aId = String(a.id || "");
          const bId = String(b.id || "");
          return aId.localeCompare(bId);
        });

        store.recordsCache.set(resource, sorted);
      } catch (error) {
        logger?.warn("DbDataStore.create: failed to load resource", { error: String(error), resource, operation: "db-store-create" });
        store.recordsCache.set(resource, []);
      }
    }

    return store;
  }

  /**
   * Create a DataStore for a PARTIAL_PUSHDOWN query.
   *
   * Pre-populates the primary resource records from the already-fetched
   * push-down results and loads only the *referenced* related records
   * for each relation in the select list — via targeted IN-queries.
   *
   * This ensures only records that are actually needed are loaded
   * (TV-PARTIAL-001, TV-PARTIAL-002).
   */
  static async forPushdownResult(
    db: Adapter,
    primaryRecords: Record<string, unknown>[],
    primaryResource: string,
    query: { select?: string[] },
    schema: any,
    namespace: string = "datafn",
    logger?: DatafnLogger,
    actorId?: string,
  ): Promise<DbDataStore> {
    const store = new DbDataStore();

    // 1. Pre-populate primary resource — no DB fetch
    store.recordsCache.set(primaryResource, primaryRecords);

    if (!Array.isArray(query.select) || !schema?.relations) {
      await DbDataStore.applyActorVisibilityFilter(
        store,
        db,
        schema,
        namespace,
        actorId,
        logger,
      );
      return store;
    }

    const primaryIds = primaryRecords
      .map((r) => r.id as string)
      .filter(Boolean);

    // Track which relations we've already loaded to avoid duplicates
    const loaded = new Set<string>();
    const loadRecordsByIds = async (
      endpoint: string | readonly string[],
      ids: string[],
    ): Promise<void> => {
      const idsByResource = new Map<string, string[]>();
      for (const id of ids) {
        const resource = DbDataStore.resolveEndpointResourceForId(schema, endpoint, id);
        if (!resource) continue;
        const current = idsByResource.get(resource) ?? [];
        current.push(id);
        idsByResource.set(resource, current);
      }
      for (const [resource, resourceIds] of idsByResource.entries()) {
        const rows = resourceIds.length > 0
          ? await db.findMany({
              model: resource,
              where: [{ field: "id", operator: "in", value: resourceIds }],
              namespace,
            })
          : [];
        store.mergeRecords(resource, rows);
      }
      for (const resource of endpointList(endpoint)) {
        if (!store.recordsCache.has(resource)) store.recordsCache.set(resource, []);
      }
    };

    // 2. Process each select token (first pass: load first-level related resources)
    for (const token of query.select) {
      if (typeof token !== "string" || token === "*") continue;

      const parts = token.split(".");
      const baseName = parts[0];

      // Skip HTREE tokens (they need the full resource table, not targeted loading)
      if (baseName === "parent" || baseName === "children") continue;
      // Plain fields (no dot, not a relation) are skipped after relation check below

      for (const rel of schema.relations) {
        const match = findRelationMatch(schema, primaryResource, baseName);
        if (!match || match.relation !== rel) continue;
        const isForward = match.direction === "forward";
        const isInverse = match.direction === "inverse";

        const loadKey = `${endpointList(rel.from).join("|")}.${rel.relation}:${isForward ? "fwd" : "inv"}`;
        if (loaded.has(loadKey)) break;
        loaded.add(loadKey);

        const fromCol = (rel as any).joinColumns?.from ?? "from";
        const toCol = (rel as any).joinColumns?.to ?? "to";

        if (rel.type === "many-one" && isForward) {
          // FK is on the primary (from) side — load the single related record per primary
          const fkField = rel.fkField || rel.foreignKey || `${rel.relation}Id`;
          const fkIds = [
            ...new Set(
              primaryRecords
                .map((r) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          try {
            await loadRecordsByIds(rel.to, fkIds);
          } catch (error) {
            logger?.warn("forPushdownResult: many-one forward load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel.to).forEach((resource) => store.recordsCache.set(resource, []));
          }
        } else if (rel.type === "many-one" && isInverse) {
          // Inverse many-one = one-many from primary: FK on rel.from pointing to primary
          const fkField = rel.fkField || rel.foreignKey || `${rel.inverse}Id`;
          try {
            for (const fromResource of endpointList(rel.from)) {
              const rows = primaryIds.length > 0
                ? await db.findMany({
                    model: fromResource,
                    where: [{ field: fkField, operator: "in", value: primaryIds }],
                    namespace,
                  })
                : [];
              store.recordsCache.set(fromResource, rows);
            }
          } catch (error) {
            logger?.warn("forPushdownResult: many-one inverse load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel.from).forEach((resource) => store.recordsCache.set(resource, []));
          }
        } else if (rel.type === "one-many" && isForward) {
          // One-many forward: FK on rel.to side pointing back to primary
          const fkField = rel.fkField || rel.foreignKey || `${rel.inverse}Id`;
          try {
            for (const toResource of endpointList(rel.to)) {
              const rows = primaryIds.length > 0
                ? await db.findMany({
                    model: toResource,
                    where: [{ field: fkField, operator: "in", value: primaryIds }],
                    namespace,
                  })
                : [];
              store.recordsCache.set(toResource, rows);
            }
          } catch (error) {
            logger?.warn("forPushdownResult: one-many forward load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel.to).forEach((resource) => store.recordsCache.set(resource, []));
          }
        } else if (rel.type === "one-many" && isInverse) {
          // Inverse one-many = many-one from primary: primary has FK pointing to rel.from
          const fkField = rel.fkField || rel.foreignKey || `${rel.relation}Id`;
          const fkIds = [
            ...new Set(
              primaryRecords
                .map((r) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          try {
            await loadRecordsByIds(rel.from, fkIds);
          } catch (error) {
            logger?.warn("forPushdownResult: one-many inverse load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel.from).forEach((resource) => store.recordsCache.set(resource, []));
          }
        } else if (rel.type === "many-many") {
          const fromResources = isForward ? [primaryResource] : endpointList(rel.from);

          for (const fromResource of fromResources) {
            const relationKey = relationKeyFor(fromResource, rel);
            const tableName = getRelationJoinTableName(rel, fromResource);

            let joinRows: Record<string, unknown>[] = [];
            try {
              const filterField = isForward ? fromCol : toCol;
              joinRows = primaryIds.length > 0
                ? await db.findMany({
                    model: tableName,
                    where: [{ field: filterField, operator: "in", value: primaryIds }],
                    namespace,
                  })
                : [];
            } catch (error) {
              logger?.warn("forPushdownResult: many-many join load failed", { error: String(error), operation: "db-store-pushdown" });
              joinRows = [];
            }

            const normalizedRows = DbDataStore.normalizeJoinRows(joinRows, fromCol, toCol);
            const rowsForRelation = DbDataStore.filterJoinRowsForResource(
              schema,
              normalizedRows,
              rel.from,
              fromResource,
              "from",
            );

            store.joinCache.set(relationKey, rowsForRelation);

            const relatedIds = [
              ...new Set(
                rowsForRelation
                  .map((r) => (isForward ? r.to : r.from))
                  .filter(Boolean),
              ),
            ];
            const targetEndpoint = isForward ? rel.to : rel.from;

            try {
              await loadRecordsByIds(targetEndpoint, relatedIds);
            } catch (error) {
              logger?.warn("forPushdownResult: many-many related load failed", { error: String(error), operation: "db-store-pushdown" });
              endpointList(targetEndpoint).forEach((resource) => store.recordsCache.set(resource, []));
            }
          }
        }
        break; // matched — don't check remaining relations for same token
      }
    }

    // 3. Second pass: handle nested tokens (e.g. "tasks.tags.*")
    //    After loading first-level records, load second-level relations for each
    //    intermediate resource that was populated above.
    const loadedNested = new Set<string>();
    for (const token of query.select) {
      if (typeof token !== "string") continue;
      const parts = token.split(".");
      if (parts.length < 3) continue; // only nested tokens

      const firstRelName = parts[0];
      const secondRelName = parts[1];

      if (firstRelName === "parent" || firstRelName === "children") continue;

      const firstMatch = findRelationMatch(schema, primaryResource, firstRelName);
      if (!firstMatch) continue;

      const intermediateResources = endpointList(
        relationTargetEndpoint(firstMatch.relation, firstMatch.direction),
      );
      for (const intermediateResource of intermediateResources) {
        const intermediateRecords = store.recordsCache.get(intermediateResource) || [];
        const intermediateIds = intermediateRecords
          .map((r) => r.id as string)
          .filter(Boolean);

        const secondMatch = findRelationMatch(schema, intermediateResource, secondRelName);
        if (!secondMatch) continue;
        const rel2 = secondMatch.relation;
        const isF2 = secondMatch.direction === "forward";

        const nestedKey = `${intermediateResource}.${secondRelName}:${secondMatch.direction}`;
        if (loadedNested.has(nestedKey)) break;
        loadedNested.add(nestedKey);

        const fromCol2 = (rel2 as any).joinColumns?.from ?? "from";
        const toCol2 = (rel2 as any).joinColumns?.to ?? "to";

        if (rel2.type === "many-many") {
          const fromResources = isF2 ? [intermediateResource] : endpointList(rel2.from);
          for (const fromResource of fromResources) {
            const tableName2 = getRelationJoinTableName(rel2, fromResource);
            const relationKey2 = relationKeyFor(fromResource, rel2);
            let joinRows2: Record<string, unknown>[] = [];
            try {
              joinRows2 = intermediateIds.length > 0
                ? await db.findMany({
                    model: tableName2,
                    where: [{ field: isF2 ? fromCol2 : toCol2, operator: "in", value: intermediateIds }],
                    namespace,
                  })
                : [];
            } catch (error) {
              logger?.warn("forPushdownResult: nested many-many join load failed", { error: String(error), operation: "db-store-pushdown" });
              joinRows2 = [];
            }
            const normalizedRows2 = DbDataStore.normalizeJoinRows(joinRows2, fromCol2, toCol2);
            const rowsForRelation2 = DbDataStore.filterJoinRowsForResource(
              schema,
              normalizedRows2,
              rel2.from,
              fromResource,
              "from",
            );
            store.joinCache.set(relationKey2, rowsForRelation2);
            const relatedIds2 = [
              ...new Set(
                rowsForRelation2.map((r) => (isF2 ? r.to : r.from)).filter(Boolean),
              ),
            ];
            try {
              await loadRecordsByIds(
                relationTargetEndpoint(rel2, secondMatch.direction),
                relatedIds2,
              );
            } catch (error) {
              logger?.warn("forPushdownResult: nested many-many related load failed", { error: String(error), operation: "db-store-pushdown" });
              endpointList(relationTargetEndpoint(rel2, secondMatch.direction)).forEach((resource) => store.recordsCache.set(resource, []));
            }
          }
        } else if (rel2.type === "one-many" && isF2) {
          const fkField2 = rel2.fkField || rel2.foreignKey || `${rel2.inverse}Id`;
          try {
            for (const targetResource of endpointList(rel2.to)) {
              const rows2 = intermediateIds.length > 0
                ? await db.findMany({
                    model: targetResource,
                    where: [{ field: fkField2, operator: "in", value: intermediateIds }],
                    namespace,
                  })
                : [];
              store.mergeRecords(targetResource, rows2);
            }
          } catch (error) {
            logger?.warn("forPushdownResult: nested one-many load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel2.to).forEach((resource) => store.recordsCache.set(resource, []));
          }
        } else if (rel2.type === "many-one" && isF2) {
          const fkField2 = rel2.fkField || rel2.foreignKey || `${rel2.relation}Id`;
          const fkIds2 = [...new Set(
            intermediateRecords.map((r) => r[fkField2] as string).filter((v) => v != null && v !== ""),
          )];
          try {
            await loadRecordsByIds(rel2.to, fkIds2);
          } catch (error) {
            logger?.warn("forPushdownResult: nested many-one forward load failed", { error: String(error), operation: "db-store-pushdown" });
            endpointList(rel2.to).forEach((resource) => store.recordsCache.set(resource, []));
          }
        }
      }
    }

    await DbDataStore.applyActorVisibilityFilter(
      store,
      db,
      schema,
      namespace,
      actorId,
      logger,
    );
    return store;
  }

  /**
   * Pre-load join rows for a relation
   */
  async loadJoinRows(
    db: Adapter,
    relationKey: string,
    namespace: string = "datafn",
    relation?: { joinTable?: string; joinColumns?: { from: string; to: string }; metadata?: Array<{ name: string; type: string }> },
    logger?: DatafnLogger,
  ): Promise<void> {
    try {
      const [joinFrom, joinRel] = relationKey.split(".");
      const tableName = relation
        ? getRelationJoinTableName(relation as any, joinFrom)
        : `__datafn_join_${joinFrom}_${joinRel}`;
      const fromCol = relation?.joinColumns?.from || "from";
      const toCol = relation?.joinColumns?.to || "to";

      const rows = await db.findMany({
        model: tableName,
        where: [],
        namespace,
      });
      this.joinCache.set(
        relationKey,
        rows.map((r) => ({
          from: r[fromCol] as string,
          to: r[toCol] as string,
          ...r,
        })) as JoinRow[],
      );
    } catch (error) {
      logger?.warn("DbDataStore.loadJoinRows: failed to load join rows", { error: String(error), operation: "db-store-load-joins" });
      this.joinCache.set(relationKey, []);
    }
  }

  getRecords(resource: string): Record<string, unknown>[] {
    return this.recordsCache.get(resource) || [];
  }

  getRecord(resource: string, id: string): Record<string, unknown> | null {
    const records = this.recordsCache.get(resource) || [];
    return records.find((r) => r.id === id) || null;
  }

  getJoinRows(relationKey: string): JoinRow[] {
    return this.joinCache.get(relationKey) || [];
  }

  /**
   * PER-005: Targeted lookup — find all cached records where record[field] === value.
   * Avoids loading and scanning the full table via getRecords() in relation filter evaluation.
   */
  findRecords(resource: string, field: string, value: unknown): Record<string, unknown>[] {
    const records = this.recordsCache.get(resource);
    if (!records) return [];
    return records.filter(r => r[field] === value);
  }

  private static resolveEndpointResourceForId(
    schema: DatafnSchema,
    endpoint: string | readonly string[],
    id: unknown,
  ): string | undefined {
    return resolveEndpointResource(endpoint, id, schema) ?? resourceNameFromId(id);
  }

  private static normalizeJoinRows(
    rows: Record<string, unknown>[],
    fromCol: string,
    toCol: string,
  ): JoinRow[] {
    return rows.map((row) => ({
      from: row[fromCol] as string,
      to: row[toCol] as string,
      ...row,
    })) as JoinRow[];
  }

  private static filterJoinRowsForResource(
    schema: DatafnSchema,
    rows: JoinRow[],
    endpoint: string | readonly string[],
    resource: string,
    field: "from" | "to",
  ): JoinRow[] {
    const discriminatorField = field === "from" ? "fromResource" : "toResource";
    return rows.filter((row) => {
      const discriminator = row[discriminatorField];
      if (typeof discriminator === "string") {
        return discriminator === resource;
      }
      return resolveEndpointResource(endpoint, row[field], schema) === resource;
    });
  }

  /**
   * Helper to create a store for a single query.
   * Discovers and pre-loads all necessary resources from select tokens.
   *
   * @param preFilterWhere  Optional WHERE clauses applied to the primary
   *                        resource's `findMany` call.  Used for the
   *                        IN_MEMORY pre-filter optimisation (SCALE-004):
   *                        base-field filters are pushed to the adapter so
   *                        that only matching primary records are loaded into
   *                        memory before the full in-memory evaluation.
   */
  static async forQuery(
    db: Adapter,
    query: { resource: string; select?: string[]; [key: string]: unknown },
    schema: any,
    namespace: string = "datafn",
    preFilterWhere?: WhereClause[],
    logger?: DatafnLogger,
    actorId?: string,
  ): Promise<DbDataStore> {
    const resourcesToLoad = new Set<string>([query.resource]);
    const relationsToLoad = new Set<string>();

    const addRelationLoad = (rel: any, contextResource: string, relationName: string): string => {
      const match = findRelationMatch(schema, contextResource, relationName);
      if (!match) return contextResource;
      const targetResources = endpointList(relationTargetEndpoint(match.relation, match.direction));
      targetResources.forEach((resourceName) => resourcesToLoad.add(resourceName));
      if (match.relation.type === "many-many") {
        const fromResources = match.direction === "forward"
          ? [contextResource]
          : endpointList(match.relation.from);
        fromResources.forEach((fromResource) => {
          relationsToLoad.add(relationKeyFor(fromResource, match.relation));
        });
      }
      return targetResources[0] ?? contextResource;
    };

    // Discover related resources from select tokens
    if (Array.isArray(query.select)) {
      for (const token of query.select) {
        if (typeof token !== "string") continue;

        // Parse token to find relations
        const parts = token.split(".");
        const baseName = parts[0];
        const directive = parts.slice(1).join(".") || undefined;

        // Check if baseName is a relation
        if (schema.relations) {
          for (const rel of schema.relations) {
            const relationMatch = findRelationMatch(schema, query.resource, baseName);
            if (relationMatch?.relation === rel) {
              const targetResource = addRelationLoad(rel, query.resource, baseName);

              // For nested tokens (e.g., "tasks.tags.*"), discover second level
              if (
                directive &&
                directive !== "*" &&
                directive !== "#" &&
                directive !== "*#"
              ) {
                // This is a nested traversal like "tasks.tags.*"
                const nestedParts = directive.split(".");
                const nestedRelation = nestedParts[0];

                for (const nestedRel of schema.relations) {
                  const nestedMatch = findRelationMatch(schema, targetResource, nestedRelation);
                  if (nestedMatch?.relation === nestedRel) {
                    addRelationLoad(nestedRel, targetResource, nestedRelation);
                  }
                }
              }
            }
          }
        }
      }
    }

    // EXE-001: Shared traversal helper used by both filters and having discovery
    const traverseFilterFields = (filter: Record<string, unknown>, contextResource: string) => {
      for (const [key, value] of Object.entries(filter)) {
        // Handle logical operators
        if (key === "$and" || key === "$or") {
          if (Array.isArray(value)) {
            value.forEach((subFilter) => {
              if (typeof subFilter === "object" && subFilter !== null) {
                traverseFilterFields(subFilter as Record<string, unknown>, contextResource);
              }
            });
          }
          continue;
        }

        // Handle dot-path: "goal.label"
        if (key.includes(".")) {
          const parts = key.split(".");
          let currentResource = contextResource;
          for (let i = 0; i < parts.length - 1; i++) {
            const relName = parts[i];
            const rel = schema.relations?.find(
              (r: any) => findRelationMatch({ ...schema, relations: [r] }, currentResource, relName),
            );

            if (rel) {
              currentResource = addRelationLoad(rel, currentResource, relName);
            }
          }
          continue;
        }

        // Handle relation quantifiers: tags: { $any: ... }
        const rel = schema.relations?.find(
          (r: any) => findRelationMatch({ ...schema, relations: [r] }, contextResource, key),
        );

        if (rel && typeof value === "object" && value !== null) {
          const ops = value as Record<string, unknown>;
          if (ops.$any || ops.$all || ops.$none) {
            const targetResource = addRelationLoad(rel, contextResource, key);

            if (ops.$any && typeof ops.$any === "object")
              traverseFilterFields(ops.$any as Record<string, unknown>, targetResource);
            if (ops.$all && typeof ops.$all === "object")
              traverseFilterFields(ops.$all as Record<string, unknown>, targetResource);
            if (ops.$none && typeof ops.$none === "object")
              traverseFilterFields(ops.$none as Record<string, unknown>, targetResource);
          }
        }
      }
    };

    // Discover related resources from filters
    if (query.filters && typeof query.filters === "object") {
      traverseFilterFields(query.filters as Record<string, unknown>, query.resource);
    }

    // Phase 15: Discover related resources from groupBy
    if (Array.isArray(query.groupBy)) {
      for (const field of query.groupBy) {
        if (typeof field === "string" && field.includes(".")) {
          // Dot path in groupBy: "cat.type"
          const parts = field.split(".");
          let currentResource = query.resource;
          for (let i = 0; i < parts.length - 1; i++) {
            const relName = parts[i];
            const rel = schema.relations?.find(
              (r: any) => findRelationMatch({ ...schema, relations: [r] }, currentResource, relName),
            );

            if (rel) {
              currentResource = addRelationLoad(rel, currentResource, relName);
            }
          }
        }
      }
    }

    // Phase 15: Discover related resources from having
    // EXE-001: Reuse the shared traverseFilterFields helper (defined above)
    if (query.having && typeof query.having === "object") {
      traverseFilterFields(query.having as Record<string, unknown>, query.resource);
    }
    // === Targeted secondary loading (INMEM-001, INMEM-002, INMEM-003, INMEM-004) ===

    const store = new DbDataStore();

    // Step 1: Load primary resource with SCALE-004 pre-filter
    try {
      const where =
        preFilterWhere && preFilterWhere.length > 0 ? preFilterWhere : [];
      const records = await db.findMany({
        model: query.resource,
        where,
        namespace,
      });
      store.recordsCache.set(
        query.resource,
        records.sort((a, b) =>
          String(a.id || "").localeCompare(String(b.id || "")),
        ),
      );
    } catch (error) {
      logger?.warn("forQuery: primary resource load failed", { error: String(error), resource: query.resource, operation: "db-store-forQuery" });
      store.recordsCache.set(query.resource, []);
    }

    // Step 2: INMEM-003 fast path
    const primaryRecords = store.recordsCache.get(query.resource) || [];
    const preFilterApplied =
      preFilterWhere !== undefined && preFilterWhere.length > 0;
    if (primaryRecords.length === 0 && preFilterApplied) {
      return store;
    }

    const primaryIds = primaryRecords
      .map((r) => r.id as string)
      .filter(Boolean);

    // Step 3: Load join tables with targeted IN filter + many-many secondaries (INMEM-001)
    const manyManySecondaries = new Set<string>();
    for (const relationKey of relationsToLoad) {
      const [fromResource, relName] = relationKey.split(".");
      const rel = schema.relations?.find(
        (r: any) => endpointIncludes(r.from, fromResource) && r.relation === relName,
      );
      if (!rel) continue;

      const tableName = getRelationJoinTableName(rel as any, fromResource);
      const fromCol = (rel as any)?.joinColumns?.from || "from";
      const toCol = (rel as any)?.joinColumns?.to || "to";

      const primaryIsFrom = endpointIncludes((rel as any).from, query.resource);
      const filterField = primaryIsFrom ? fromCol : toCol;
      const secondaryIdField = primaryIsFrom ? toCol : fromCol;
      const secondaryEndpoint = primaryIsFrom ? (rel as any).to : (rel as any).from;

      try {
        let joinRows: Record<string, unknown>[] = [];
        if (primaryIds.length > 0) {
          joinRows = await db.findMany({
            model: tableName,
            where: [{ field: filterField, operator: "in", value: primaryIds }],
            namespace,
          });
        }

        const normalizedRows = DbDataStore.normalizeJoinRows(joinRows, fromCol, toCol);
        const rowsForRelation = DbDataStore.filterJoinRowsForResource(
          schema,
          normalizedRows,
          (rel as any).from,
          fromResource,
          "from",
        );

        store.joinCache.set(relationKey, rowsForRelation);

        const secondaryIds = [
          ...new Set(
            rowsForRelation
              .map((r) => (primaryIsFrom ? r.to : r.from))
              .filter(Boolean),
          ),
        ];
        const idsByResource = new Map<string, string[]>();
        for (const secondaryId of secondaryIds) {
          const secondaryResource = DbDataStore.resolveEndpointResourceForId(schema, secondaryEndpoint, secondaryId);
          if (!secondaryResource) continue;
          const ids = idsByResource.get(secondaryResource) ?? [];
          ids.push(secondaryId);
          idsByResource.set(secondaryResource, ids);
        }

        for (const [secondaryModel, ids] of idsByResource.entries()) {
          const records = ids.length > 0
            ? await db.findMany({
                model: secondaryModel,
                where: [
                  { field: "id", operator: "in", value: ids },
                ],
                namespace,
              })
              : [];
          store.mergeRecords(secondaryModel, records);
          manyManySecondaries.add(secondaryModel);
        }
      } catch (error) {
        logger?.warn("forQuery: join table load failed", { error: String(error), operation: "db-store-forQuery" });
        store.joinCache.set(relationKey, []);
        for (const secondaryModel of endpointList(secondaryEndpoint)) {
          store.recordsCache.set(secondaryModel, []);
          manyManySecondaries.add(secondaryModel);
        }
      }
    }

    // Step 4: Load non-many-many secondary resources with targeted IN queries
    for (const secondaryResource of resourcesToLoad) {
      if (secondaryResource === query.resource) continue;
      if (manyManySecondaries.has(secondaryResource)) continue;

      // Find the relation between query.resource and secondaryResource (INMEM-004)
      const relationMatch = schema.relations
        ?.map((rel: any) => {
          if (
            endpointIncludes(rel.from, query.resource) &&
            endpointIncludes(rel.to, secondaryResource)
          ) {
            return { relation: rel, direction: "forward" as const };
          }
          if (
            endpointIncludes(rel.to, query.resource) &&
            endpointIncludes(rel.from, secondaryResource)
          ) {
            return { relation: rel, direction: "inverse" as const };
          }
          return undefined;
        })
        .find(Boolean);

      if (!relationMatch) {
        // EXE-022: No direct relation path found for this secondary resource.
        // This can happen with nested select tokens (e.g. tasks.tags.*).
        // Fall back to empty rather than full table scan (correctness over coverage).
        logger?.warn("No direct relation found for secondary resource; skipping load", {
          operation: "forQuery",
          resource: secondaryResource,
        });
        store.recordsCache.set(secondaryResource, []);
        continue;
      }

      const rel = relationMatch.relation;
      const isForward = relationMatch.direction === "forward";

      try {
        let records: Record<string, unknown>[] = [];

        if ((rel as any).type === "many-one" && isForward) {
          // FK on primary records → load secondary by FK values
          const fkField =
            (rel as any).fkField || (rel as any).foreignKey || `${(rel as any).relation}Id`;
          const fkValues = [
            ...new Set(
              primaryRecords
                .map((r: any) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          if (fkValues.length > 0) {
            records = await db.findMany({
              model: secondaryResource,
              where: [{ field: "id", operator: "in", value: fkValues }],
              namespace,
            });
          }
        } else if ((rel as any).type === "many-one" && !isForward) {
          // Inverse many-one: secondary records have FK pointing to primary
          const fkField =
            (rel as any).fkField || (rel as any).foreignKey || `${(rel as any).relation}Id`;
          if (primaryIds.length > 0) {
            records = await db.findMany({
              model: secondaryResource,
              where: [{ field: fkField, operator: "in", value: primaryIds }],
              namespace,
            });
          }
        } else if ((rel as any).type === "one-many" && isForward) {
          // FK on secondary records pointing to primary
          const fkField =
            (rel as any).fkField ||
            (rel as any).foreignKey ||
            (rel as any).inverse ||
            `${query.resource}Id`;
          if (primaryIds.length > 0) {
            records = await db.findMany({
              model: secondaryResource,
              where: [{ field: fkField, operator: "in", value: primaryIds }],
              namespace,
            });
          }
        } else if ((rel as any).type === "one-many" && !isForward) {
          // Inverse one-many: primary has FK pointing to secondary (one side)
          const fkField =
            (rel as any).fkField ||
            (rel as any).foreignKey ||
            (rel as any).relation ||
            `${secondaryResource}Id`;
          const fkValues = [
            ...new Set(
              primaryRecords
                .map((r: any) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          if (fkValues.length > 0) {
            records = await db.findMany({
              model: secondaryResource,
              where: [{ field: "id", operator: "in", value: fkValues }],
              namespace,
            });
          }
        } else {
          // EXE-022: unhandled relation type → empty result with warning (no full-table scan)
          logger?.warn("Unhandled relation type for secondary resource; returning empty set instead of full scan", {
            operation: "forQuery",
            resource: secondaryResource,
            relationType: (rel as any).type,
          });
          records = [];
        }

        store.recordsCache.set(secondaryResource, records);
      } catch (error) {
        logger?.warn("forQuery: secondary resource load failed", { error: String(error), resource: secondaryResource, operation: "db-store-forQuery" });
        store.recordsCache.set(secondaryResource, []);
      }
    }

    await DbDataStore.applyActorVisibilityFilter(
      store,
      db,
      schema,
      namespace,
      actorId,
      logger,
    );
    return store;
  }
}
