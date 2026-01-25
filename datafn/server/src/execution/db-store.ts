/**
 * Database-backed DataStore implementation
 * Wraps @superfunctions/db.Adapter to provide DataStore interface for query execution
 *
 * This implementation pre-loads all necessary data to provide synchronous access
 * as required by the current select materialization logic.
 */

import type { Adapter } from "@superfunctions/db";
import type { DataStore, JoinRow } from "./store.js";

export class DbDataStore implements DataStore {
  private recordsCache: Map<string, Record<string, unknown>[]> = new Map();
  private joinCache: Map<string, JoinRow[]> = new Map();

  /**
   * Create a DataStore from DB adapter by pre-loading data for a query
   */
  static async create(
    db: Adapter,
    resources: string[],
    namespace: string = "datafn",
  ): Promise<DbDataStore> {
    const store = new DbDataStore();

    // Pre-load all records for requested resources
    for (const resource of resources) {
      try {
        const records = await db.findMany({
          model: resource,
          where: [],
          namespace,
        });

        // Sort by id for deterministic ordering
        const sorted = records.sort((a, b) => {
          const aId = String(a.id || "");
          const bId = String(b.id || "");
          return aId.localeCompare(bId);
        });

        store.recordsCache.set(resource, sorted);
      } catch (error) {
        store.recordsCache.set(resource, []);
      }
    }

    // Pre-load join tables (need to discover which ones exist)
    // For now, we'll load them on-demand via getJoinRows

    return store;
  }

  /**
   * Pre-load join rows for a relation
   */
  async loadJoinRows(
    db: Adapter,
    relationKey: string,
    namespace: string = "datafn",
  ): Promise<void> {
    try {
      const joinTableName = `__datafn_join_${relationKey.replace(".", "_")}`;
      const rows = await db.findMany({
        model: joinTableName,
        where: [],
        namespace,
      });
      this.joinCache.set(relationKey, rows as JoinRow[]);
    } catch (error) {
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
   * Helper to create a store for a single query
   * Discovers and pre-loads all necessary resources from select tokens
   */
  static async forQuery(
    db: Adapter,
    query: { resource: string; select?: string[]; [key: string]: unknown },
    schema: any,
    namespace: string = "datafn",
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

    // Discover related resources from filters
    if (query.filters && typeof query.filters === "object") {
      const traverseFilter = (filter: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(filter)) {
          // Handle logical operators
          if (key === "$and" || key === "$or") {
            if (Array.isArray(value)) {
              value.forEach((subFilter) => {
                if (typeof subFilter === "object" && subFilter !== null) {
                  traverseFilter(subFilter as Record<string, unknown>);
                }
              });
            }
            continue;
          }

          // Handle dot-path: "goal.label"
          if (key.includes(".")) {
            const parts = key.split(".");
            // Traverse relations path
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

                // Add to load set
                resourcesToLoad.add(targetResource);
                if (rel.from !== currentResource) {
                  resourcesToLoad.add(rel.from as string);
                }

                if (rel.type === "many-many") {
                  const relationKey =
                    rel.from === currentResource
                      ? `${rel.from}.${rel.relation}`
                      : `${rel.from}.${rel.relation}`; // Always use canonical relation key
                  // Actually canonical key is always FromResource.RelationName
                  // If we are traversing inverse, we might need the forward relation key?
                  // Yes, database adapter expects keys like "task.tags".
                  relationsToLoad.add(`${rel.from}.${rel.relation}`);
                }

                currentResource = targetResource;
              }
            }
            continue;
          }

          // Handle relation quantifiers: tags: { $any: ... }
          // Check if 'key' is a relation
          const rel = schema.relations?.find(
            (r: any) =>
              (r.from === query.resource && r.relation === key) ||
              (r.to === query.resource && r.inverse === key),
          );

          if (rel && typeof value === "object" && value !== null) {
            // It is a relation, check for quantifiers in value
            const ops = value as Record<string, unknown>;
            if (ops.$any || ops.$all || ops.$none) {
              const targetResource =
                rel.from === query.resource
                  ? (rel.to as string)
                  : (rel.from as string);

              resourcesToLoad.add(targetResource);
              if (rel.from !== query.resource) {
                resourcesToLoad.add(rel.from as string);
              }

              if (rel.type === "many-many") {
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
              }

              // Recursively traverse the nested filter in quantifier
              // The value of $any is the nested filter
              if (ops.$any && typeof ops.$any === "object")
                traverseFilter(ops.$any as Record<string, unknown>);
              if (ops.$all && typeof ops.$all === "object")
                traverseFilter(ops.$all as Record<string, unknown>);
              if (ops.$none && typeof ops.$none === "object")
                traverseFilter(ops.$none as Record<string, unknown>);
            }
          }
        }
      };

      traverseFilter(query.filters as Record<string, unknown>);
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
    // Re-use traverseFilter logic for having?
    // having structure matches filter structure roughly.
    // However, having can reference aliases which are not in schema.
    // traverseFilter ignores keys that are not relations/paths.
    // So it is safe to run on having.
    if (query.having && typeof query.having === "object") {
      // We need access to traverseFilter. It was defined inside the filters block.
      // We should move traverseFilter definition up or duplicate logic.
      // Duplicating logic is safer to avoid scope issues or refactoring large block.
      // Actually, we can just define traverseFilter outside the if block.
      // But I cannot easily move the definition without replacing the whole method.
      // I will just duplicate the traversal for `having` for now, or define a helper variable if I can access it.
      // `traverseFilter` is scoped to `if (query.filters)`.
      // So I cannot access it here.
      // I will COPY the logic for `having`. It's cleaner than refactoring the whole function.

      const traverseHaving = (filter: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(filter)) {
          if (key === "$and" || key === "$or") {
            if (Array.isArray(value)) {
              value.forEach((sub) => {
                if (typeof sub === "object" && sub !== null)
                  traverseHaving(sub as any);
              });
            }
            continue;
          }
          if (key.includes(".")) {
            // Same logic as filters path traversal
            const parts = key.split(".");
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
                if (rel.from !== currentResource)
                  resourcesToLoad.add(rel.from as string);
                if (rel.type === "many-many")
                  relationsToLoad.add(`${rel.from}.${rel.relation}`);
                currentResource = targetResource;
              }
            }
          }
          // Relations as keys (quantifiers) - rare in having but possible
          const rel = schema.relations?.find(
            (r: any) =>
              (r.from === query.resource && r.relation === key) ||
              (r.to === query.resource && r.inverse === key),
          );
          if (rel && typeof value === "object" && value !== null) {
            const ops = value as Record<string, unknown>;
            if (ops.$any || ops.$all || ops.$none) {
              const targetResource =
                rel.from === query.resource
                  ? (rel.to as string)
                  : (rel.from as string);
              resourcesToLoad.add(targetResource);
              if (rel.from !== query.resource)
                resourcesToLoad.add(rel.from as string);
              if (rel.type === "many-many")
                relationsToLoad.add(`${rel.from}.${rel.relation}`);
              if (ops.$any) traverseHaving(ops.$any as any);
              if (ops.$all) traverseHaving(ops.$all as any);
              if (ops.$none) traverseHaving(ops.$none as any);
            }
          }
        }
      };
      traverseHaving(query.having as Record<string, unknown>);
    }

    // Create store with all discovered resources
    const store = await DbDataStore.create(
      db,
      Array.from(resourcesToLoad),
      namespace,
    );

    // Load all required join tables
    for (const relationKey of relationsToLoad) {
      await store.loadJoinRows(db, relationKey, namespace);
    }

    return store;
  }
}
