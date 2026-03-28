/**
 * Database-backed DataStore implementation
 * Wraps @superfunctions/db.Adapter to provide DataStore interface for query execution
 *
 * This implementation pre-loads all necessary data to provide synchronous access
 * as required by the current select materialization logic.
 */

import type { Adapter, WhereClause } from "@superfunctions/db";
import type { DataStore, JoinRow } from "./store.js";
import { getJoinTableName } from "@datafn/core";
import type { DatafnLogger } from "../logger.js";
import { isPrivateShareableResource, resolveAccessLevel } from "../validation/authz.js";

export class DbDataStore implements DataStore {
  private recordsCache: Map<string, Record<string, unknown>[]> = new Map();
  private joinCache: Map<string, JoinRow[]> = new Map();

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

    // 2. Process each select token (first pass: load first-level related resources)
    for (const token of query.select) {
      if (typeof token !== "string" || token === "*") continue;

      const parts = token.split(".");
      const baseName = parts[0];

      // Skip HTREE tokens (they need the full resource table, not targeted loading)
      if (baseName === "parent" || baseName === "children") continue;
      // Plain fields (no dot, not a relation) are skipped after relation check below

      for (const rel of schema.relations) {
        const isForward =
          rel.from === primaryResource && rel.relation === baseName;
        const isInverse =
          rel.to === primaryResource && rel.inverse === baseName;

        if (!isForward && !isInverse) continue;

        const loadKey = `${rel.from}.${rel.relation}:${isForward ? "fwd" : "inv"}`;
        if (loaded.has(loadKey)) break;
        loaded.add(loadKey);

        const fromCol = (rel as any).joinColumns?.from ?? "from";
        const toCol = (rel as any).joinColumns?.to ?? "to";

        if (rel.type === "many-one" && isForward) {
          // FK is on the primary (from) side — load the single related record per primary
          const fkField = rel.fkField ?? `${rel.relation}Id`;
          const fkIds = [
            ...new Set(
              primaryRecords
                .map((r) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          try {
            const rows = fkIds.length > 0
              ? await db.findMany({
                  model: rel.to,
                  where: [{ field: "id", operator: "in", value: fkIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel.to as string, rows);
          } catch (error) {
            logger?.warn("forPushdownResult: many-one forward load failed", { error: String(error), resource: rel.to as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel.to as string, []);
          }
        } else if (rel.type === "many-one" && isInverse) {
          // Inverse many-one = one-many from primary: FK on rel.from pointing to primary
          const fkField = rel.fkField ?? `${rel.inverse}Id`;
          try {
            const rows = primaryIds.length > 0
              ? await db.findMany({
                  model: rel.from,
                  where: [{ field: fkField, operator: "in", value: primaryIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel.from as string, rows);
          } catch (error) {
            logger?.warn("forPushdownResult: many-one inverse load failed", { error: String(error), resource: rel.from as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel.from as string, []);
          }
        } else if (rel.type === "one-many" && isForward) {
          // One-many forward: FK on rel.to side pointing back to primary
          const fkField = rel.fkField ?? `${rel.inverse}Id`;
          try {
            const rows = primaryIds.length > 0
              ? await db.findMany({
                  model: rel.to as string,
                  where: [{ field: fkField, operator: "in", value: primaryIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel.to as string, rows);
          } catch (error) {
            logger?.warn("forPushdownResult: one-many forward load failed", { error: String(error), resource: rel.to as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel.to as string, []);
          }
        } else if (rel.type === "one-many" && isInverse) {
          // Inverse one-many = many-one from primary: primary has FK pointing to rel.from
          const fkField = rel.fkField ?? `${rel.relation}Id`;
          const fkIds = [
            ...new Set(
              primaryRecords
                .map((r) => r[fkField] as string)
                .filter((v) => v != null && v !== ""),
            ),
          ];
          try {
            const rows = fkIds.length > 0
              ? await db.findMany({
                  model: rel.from as string,
                  where: [{ field: "id", operator: "in", value: fkIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel.from as string, rows);
          } catch (error) {
            logger?.warn("forPushdownResult: one-many inverse load failed", { error: String(error), resource: rel.from as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel.from as string, []);
          }
        } else if (rel.type === "many-many") {
          const relationKey = `${rel.from}.${rel.relation}`;
          const tableName = getJoinTableName(rel.from as string, rel.relation, rel.joinTable);

          let joinRows: Record<string, unknown>[] = [];
          try {
            // For forward: join rows where fromCol IN primaryIds
            // For inverse: join rows where toCol IN primaryIds
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

          store.joinCache.set(
            relationKey,
            joinRows.map((r) => ({
              from: r[fromCol] as string,
              to: r[toCol] as string,
              ...r,
            })) as JoinRow[],
          );

          // Collect unique related IDs
          const relatedIds = [
            ...new Set(
              joinRows
                .map((r) => (isForward ? r[toCol] : r[fromCol]) as string)
                .filter(Boolean),
            ),
          ];
          const targetModel = isForward ? (rel.to as string) : (rel.from as string);

          try {
            const rows = relatedIds.length > 0
              ? await db.findMany({
                  model: targetModel,
                  where: [{ field: "id", operator: "in", value: relatedIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(targetModel, rows);
          } catch (error) {
            logger?.warn("forPushdownResult: many-many related load failed", { error: String(error), resource: targetModel, operation: "db-store-pushdown" });
            store.recordsCache.set(targetModel, []);
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

      // Determine the intermediate resource
      let intermediateResource: string | null = null;
      for (const rel of schema.relations) {
        const isForward = rel.from === primaryResource && rel.relation === firstRelName;
        const isInverse = rel.to === primaryResource && rel.inverse === firstRelName;
        if (!isForward && !isInverse) continue;
        if (rel.type === "one-many" && isForward) intermediateResource = rel.to as string;
        else if (rel.type === "one-many" && isInverse) intermediateResource = rel.from as string;
        else if (rel.type === "many-one" && isForward) intermediateResource = rel.to as string;
        else if (rel.type === "many-one" && isInverse) intermediateResource = rel.from as string;
        else if (rel.type === "many-many") intermediateResource = isForward ? rel.to as string : rel.from as string;
        break;
      }
      if (!intermediateResource) continue;

      // Get already-loaded intermediate records
      const intermediateRecords = store.recordsCache.get(intermediateResource) || [];
      const intermediateIds = intermediateRecords
        .map((r) => r.id as string)
        .filter(Boolean);

      // Find the second-level relation on the intermediate resource
      for (const rel2 of schema.relations) {
        const isF2 = rel2.from === intermediateResource && rel2.relation === secondRelName;
        const isI2 = rel2.to === intermediateResource && rel2.inverse === secondRelName;
        if (!isF2 && !isI2) continue;

        const nestedKey = `${intermediateResource}.${rel2.from}.${rel2.relation}:${isF2 ? "fwd" : "inv"}`;
        if (loadedNested.has(nestedKey)) break;
        loadedNested.add(nestedKey);

        const fromCol2 = (rel2 as any).joinColumns?.from ?? "from";
        const toCol2 = (rel2 as any).joinColumns?.to ?? "to";

        if (rel2.type === "many-many" && isF2) {
          const tableName2 = getJoinTableName(rel2.from as string, rel2.relation, rel2.joinTable);
          const relationKey2 = `${rel2.from}.${rel2.relation}`;
          let joinRows2: Record<string, unknown>[] = [];
          try {
            joinRows2 = intermediateIds.length > 0
              ? await db.findMany({
                  model: tableName2,
                  where: [{ field: fromCol2, operator: "in", value: intermediateIds }],
                  namespace,
                })
              : [];
          } catch (error) {
            logger?.warn("forPushdownResult: nested many-many join load failed", { error: String(error), operation: "db-store-pushdown" });
            joinRows2 = [];
          }
          store.joinCache.set(
            relationKey2,
            joinRows2.map((r) => ({
              from: r[fromCol2] as string,
              to: r[toCol2] as string,
              ...r,
            })) as JoinRow[],
          );
          const relatedIds2 = [...new Set(
            joinRows2.map((r) => r[toCol2] as string).filter(Boolean),
          )];
          try {
            const rows2 = relatedIds2.length > 0
              ? await db.findMany({
                  model: rel2.to as string,
                  where: [{ field: "id", operator: "in", value: relatedIds2 }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel2.to as string, rows2);
          } catch (error) {
            logger?.warn("forPushdownResult: nested many-many related load failed", { error: String(error), resource: rel2.to as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel2.to as string, []);
          }
        } else if (rel2.type === "one-many" && isF2) {
          const fkField2 = rel2.fkField ?? `${rel2.inverse}Id`;
          try {
            const rows2 = intermediateIds.length > 0
              ? await db.findMany({
                  model: rel2.to as string,
                  where: [{ field: fkField2, operator: "in", value: intermediateIds }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel2.to as string, rows2);
          } catch (error) {
            logger?.warn("forPushdownResult: nested one-many load failed", { error: String(error), resource: rel2.to as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel2.to as string, []);
          }
        } else if (rel2.type === "many-one" && isF2) {
          const fkField2 = rel2.fkField ?? `${rel2.relation}Id`;
          const fkIds2 = [...new Set(
            intermediateRecords.map((r) => r[fkField2] as string).filter((v) => v != null && v !== ""),
          )];
          try {
            const rows2 = fkIds2.length > 0
              ? await db.findMany({
                  model: rel2.to as string,
                  where: [{ field: "id", operator: "in", value: fkIds2 }],
                  namespace,
                })
              : [];
            store.recordsCache.set(rel2.to as string, rows2);
          } catch (error) {
            logger?.warn("forPushdownResult: nested many-one forward load failed", { error: String(error), resource: rel2.to as string, operation: "db-store-pushdown" });
            store.recordsCache.set(rel2.to as string, []);
          }
        }
        break;
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
      const tableName = getJoinTableName(joinFrom, joinRel, relation?.joinTable);
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
            // Check if this is a relation from the query resource
            if (rel.from === query.resource && rel.relation === baseName) {
              // Load target resource (for ids-only, .*, and nested)
              resourcesToLoad.add(rel.to as string);

              // If many-many, track relation for join table loading
              if (rel.type === "many-many") {
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
              }

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
                  if (
                    (nestedRel.from === rel.to &&
                      nestedRel.relation === nestedRelation) ||
                    (nestedRel.to === rel.to &&
                      nestedRel.inverse === nestedRelation)
                  ) {
                    resourcesToLoad.add(nestedRel.to as string);
                    resourcesToLoad.add(nestedRel.from as string);
                    if (nestedRel.type === "many-many") {
                      relationsToLoad.add(
                        `${nestedRel.from}.${nestedRel.relation}`,
                      );
                    }
                  }
                }
              }
            }
            // Check if this is an inverse relation
            else if (rel.to === query.resource && rel.inverse === baseName) {
              // Load the FROM resource (e.g., for goal.tasks, load task records)
              resourcesToLoad.add(rel.from as string);
              resourcesToLoad.add(rel.to as string);
              if (rel.type === "many-many") {
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
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
              (r: any) =>
                (r.from === currentResource && r.relation === relName) ||
                (r.to === currentResource && r.inverse === relName),
            );

            if (rel) {
              const targetResource =
                rel.from === currentResource
                  ? (rel.to as string)
                  : (rel.from as string);

              resourcesToLoad.add(targetResource);
              if (rel.from !== currentResource) {
                resourcesToLoad.add(rel.from as string);
              }
              if (rel.type === "many-many") {
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
              }
              currentResource = targetResource;
            }
          }
          continue;
        }

        // Handle relation quantifiers: tags: { $any: ... }
        const rel = schema.relations?.find(
          (r: any) =>
            (r.from === contextResource && r.relation === key) ||
            (r.to === contextResource && r.inverse === key),
        );

        if (rel && typeof value === "object" && value !== null) {
          const ops = value as Record<string, unknown>;
          if (ops.$any || ops.$all || ops.$none) {
            const targetResource =
              rel.from === contextResource
                ? (rel.to as string)
                : (rel.from as string);

            resourcesToLoad.add(targetResource);
            if (rel.from !== contextResource) {
              resourcesToLoad.add(rel.from as string);
            }
            if (rel.type === "many-many") {
              relationsToLoad.add(`${rel.from}.${rel.relation}`);
            }

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
              (r: any) =>
                (r.from === currentResource && r.relation === relName) ||
                (r.to === currentResource && r.inverse === relName),
            );

            if (rel) {
              const targetResource =
                rel.from === currentResource
                  ? (rel.to as string)
                  : (rel.from as string);

              resourcesToLoad.add(targetResource);
              if (rel.from !== currentResource) {
                resourcesToLoad.add(rel.from as string);
              }

              if (rel.type === "many-many") {
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
              }
              currentResource = targetResource;
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
        (r: any) => r.from === fromResource && r.relation === relName,
      );

      const tableName = getJoinTableName(fromResource, relName, (rel as any)?.joinTable);
      const fromCol = (rel as any)?.joinColumns?.from || "from";
      const toCol = (rel as any)?.joinColumns?.to || "to";

      // Determine which side the primary resource is on
      const primaryIsFrom = fromResource === query.resource;
      const filterField = primaryIsFrom ? fromCol : toCol;
      const secondaryIdField = primaryIsFrom ? toCol : fromCol;
      const secondaryModel = primaryIsFrom
        ? (rel?.to as string)
        : fromResource;

      try {
        let joinRows: Record<string, unknown>[] = [];
        if (primaryIds.length > 0) {
          joinRows = await db.findMany({
            model: tableName,
            where: [{ field: filterField, operator: "in", value: primaryIds }],
            namespace,
          });
        }

        store.joinCache.set(
          relationKey,
          joinRows.map((r) => ({
            from: r[fromCol] as string,
            to: r[toCol] as string,
            ...r,
          })) as JoinRow[],
        );

        // Load secondary model with targeted IDs from join rows
        if (secondaryModel) {
          const secondaryIds = [
            ...new Set(
              joinRows
                .map((r) => r[secondaryIdField] as string)
                .filter(Boolean),
            ),
          ];
          const records =
            secondaryIds.length > 0
              ? await db.findMany({
                  model: secondaryModel,
                  where: [
                    { field: "id", operator: "in", value: secondaryIds },
                  ],
                  namespace,
                })
              : [];
          store.recordsCache.set(secondaryModel, records);
          manyManySecondaries.add(secondaryModel);
        }
      } catch (error) {
        logger?.warn("forQuery: join table load failed", { error: String(error), operation: "db-store-forQuery" });
        store.joinCache.set(relationKey, []);
        if (secondaryModel) {
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
      const rel = schema.relations?.find(
        (r: any) =>
          (r.from === query.resource && r.to === secondaryResource) ||
          (r.to === query.resource && r.from === secondaryResource),
      );

      if (!rel) {
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

      const isForward = (rel as any).from === query.resource;

      try {
        let records: Record<string, unknown>[] = [];

        if ((rel as any).type === "many-one" && isForward) {
          // FK on primary records → load secondary by FK values
          const fkField =
            (rel as any).fkField ?? `${(rel as any).relation}Id`;
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
            (rel as any).fkField ?? `${(rel as any).relation}Id`;
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
            (rel as any).fkField ??
            (rel as any).inverse ??
            `${(rel as any).from}Id`;
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
            (rel as any).fkField ??
            (rel as any).inverse ??
            `${(rel as any).from}Id`;
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
