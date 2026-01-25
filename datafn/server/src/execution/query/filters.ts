/**
 * DFQL filter evaluation
 */

type FilterValue = unknown;
type FilterOperator = Record<string, unknown>;

/**
 * Evaluate a filter expression against a record
 */
export function evaluateFilter(
  record: Record<string, unknown>,
  filters: Record<string, unknown>,
  resourceName: string,
  schema: any, // DatafnSchema
  store: any, // DataStore
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    // Logical operators
    if (key === "$and") {
      if (!Array.isArray(value)) return false;
      const allMatch = value.every((subFilter: unknown) => {
        if (typeof subFilter !== "object" || subFilter === null) return false;
        return evaluateFilter(
          record,
          subFilter as Record<string, unknown>,
          resourceName,
          schema,
          store,
        );
      });
      if (!allMatch) return false;
      continue;
    }

    if (key === "$or") {
      if (!Array.isArray(value)) return false;
      const anyMatch = value.some((subFilter: unknown) => {
        if (typeof subFilter !== "object" || subFilter === null) return false;
        return evaluateFilter(
          record,
          subFilter as Record<string, unknown>,
          resourceName,
          schema,
          store,
        );
      });
      if (!anyMatch) return false;
      continue;
    }

    // Dot-path filter: "goal.label"
    if (key.includes(".")) {
      const parts = key.split(".");
      const relName = parts[0];
      const remainder = parts.slice(1).join(".");

      // Resolve relation
      const rel = findRelation(schema, resourceName, relName);
      if (rel) {
        // It's a relation traversal
        const relatedRecords = getRelatedRecords(
          record,
          rel,
          store,
          resourceName,
        );

        // If to-one (or to-many acting as implicit ANY)
        // "goal.label": "X" on null goal -> false
        if (relatedRecords.length === 0) return false;

        // Expand the dot path: "goal.label" : "X" -> on related records, filter is { "label": "X" }
        // Recursive call ? No, simplified check.
        // We need to match `remainder` path against value "X" on related records.
        // Construct a virtual filter: { [remainder]: value }
        const virtualFilter = { [remainder]: value };

        // Implicit ANY for to-many
        const targetResource = rel.from === resourceName ? rel.to : rel.from;
        const match = relatedRecords.some((r) =>
          evaluateFilter(
            r,
            virtualFilter,
            targetResource as string,
            schema,
            store,
          ),
        );
        if (!match) return false;
        continue;
      }
      
      // Not a relation: Treat as nested object property
      // Traverse dot path on the record itself
      // e.g. "address.city": "London"
      let currentVal: any = record;
      for (const part of parts) {
        if (currentVal === null || currentVal === undefined) {
          currentVal = undefined;
          break;
        }
        currentVal = currentVal[part];
      }
      
      // Now evaluate value/operator against resolved value
      const fieldValue = currentVal;
      
      // Check operators (same logic as simple field)
      if (Array.isArray(value)) {
        if (!value.includes(fieldValue)) return false;
        continue;
      }
      if (typeof value === "object" && value !== null) {
        // Skip relation quantifiers check here as nested objects aren't relations?
        // Actually if value has operators, we should evaluate them.
        const ops = value as Record<string, unknown>;
        // But nested object path CANNOT be a relation quantifier target if we are here (not a relation).
        
        const opRes = evaluateOperator(fieldValue, value as FilterOperator);
        if (!opRes) return false;
        continue;
      }
      
      if (!compareValues(fieldValue, value)) return false;
      continue;
    }

    // Field filter
    let fieldValue = record[key];

    // Array value = "in" operator
    if (Array.isArray(value)) {
      if (!value.includes(fieldValue)) return false;
      continue;
    }

    // Object value = operator object
    if (typeof value === "object" && value !== null) {
      const ops = value as Record<string, unknown>;

      // Relation quantifiers
      if (ops.$any || ops.$all || ops.$none) {
        if (
          !evaluateRelationFilter(record, key, ops, resourceName, schema, store)
        )
          return false;
        continue;
      }

      const opRes = evaluateOperator(fieldValue, value as FilterOperator);
      if (!opRes) {
        return false;
      }
      continue;
    }

    // Simple equality
    if (fieldValue !== value) return false;
  }

  return true;
}

function compareValues(a: unknown, b: unknown): boolean {
  return a === b;
}

function findRelation(schema: any, resourceName: string, relationName: string) {
  return schema.relations?.find(
    (r: any) =>
      (r.from === resourceName && r.relation === relationName) ||
      (r.to === resourceName && r.inverse === relationName) ||
      (r.from === resourceName && r.inverse === relationName), // Added check for inverse relation from the 'from' side
  );
}

// Get related records from store (using cached records or join rows)
function getRelatedRecords(
  record: any,
  rel: any,
  store: any,
  resourceName: string,
): Record<string, unknown>[] {
  const recordId = record.id as string;
  // ^ Robust resource check? Or rely on rel definition.
  // If we passed proper resourceName to evaluateFilter, we can trust it.
  // But let's use the `store` API which is simple `getRecords`.

  // Logic similar to `select.ts` expandRelationToRecords
  // We need to implement lookup logic here.

  // Simplification: use `store` methods.
  const isForward = rel.from === resourceName;

  if (rel.type === "many-one") {
    if (isForward) {
      // Forward: task -> goal. record.goalId -> goal.id
      const fk = (rel as any).fkField || (rel as any).foreignKey;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(rel.to, targetId as string);
      return target ? [target] : [];
    } else {
      // Inverse: goal -> tasks. task.goalId = goal.id
      // Scan target table? Or use index?
      // DbDataStore loads all records. We can scan.
      const allTargets = store.getRecords(rel.from);
      const sourceId = record.id;
      const fk = (rel as any).fkField || (rel as any).foreignKey;
      return allTargets.filter((r: any) => r[fk] === sourceId);
    }
  } else if (rel.type === "one-many") {
    // Same as many-one inverse but swapped
    if (isForward) {
      // Forward: goal -> tasks. task.goalId = goal.id
      const allTargets = store.getRecords(rel.to);
      const sourceId = record.id;
      const fk = (rel as any).fkField || (rel as any).foreignKey;
      return allTargets.filter((r: any) => r[fk] === sourceId);
    } else {
      // Inverse: task -> goal. record.goalId = goal.id
      const fk = (rel as any).fkField || (rel as any).foreignKey;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(rel.from, targetId as string);
      return target ? [target] : [];
    }
  } else if (rel.type === "many-many") {
    // Join table based.
    // Join table key: FromResource.RelationName
    // If forward (task->tags): use `task.tags`. Row: fromId=task, toId=tag.
    // If inverse (tag->tasks): use `task.tags` (canonical). Row: fromId=task, toId=tag.

    // Canonical definition handles key.
    const canonicalKey = `${rel.from}.${rel.relation}`;
    const joinRows = store.getJoinRows(canonicalKey);

    if (isForward) {
      // task -> tags. Join from = task.id. Return to objects.
      const relatedIds = joinRows
        .filter((row: any) => row.from === record.id)
        .map((row: any) => row.to);
      const targets = store.getRecords(rel.to);
      return targets.filter((r: any) => relatedIds.includes(r.id));
    } else {
      // tag -> tasks. Join to = tag.id. Return from objects.
      const relatedIds = joinRows
        .filter((row: any) => row.to === record.id)
        .map((row: any) => row.from);
      const targets = store.getRecords(rel.from);
      return targets.filter((r: any) => relatedIds.includes(r.id));
    }
  }
  return [];
}

function evaluateRelationFilter(
  record: any,
  relationName: string,
  ops: any,
  resourceName: string,
  schema: any,
  store: any,
): boolean {
  const rel = findRelation(schema, resourceName, relationName);
  if (!rel) return false; // Unknown relation

  const relatedRecords = getRelatedRecords(record, rel, store, resourceName);
  const targetResource = rel.from === resourceName ? rel.to : rel.from;

  if (ops.$any) {
    const subFilter = ops.$any as Record<string, unknown>;
    const count = relatedRecords.filter((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    ).length;
    return count > 0;
  }

  if (ops.$all) {
    const subFilter = ops.$all as Record<string, unknown>;
    // Requirement: "all related rows match ... and false when zero related rows"
    if (relatedRecords.length === 0) return false;
    return relatedRecords.every((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    );
  }

  if (ops.$none) {
    const subFilter = ops.$none as Record<string, unknown>;
    // Requirement: "no related rows match ... (and true when zero related rows)"
    if (relatedRecords.length === 0) return true;
    return !relatedRecords.some((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    );
  }

  return true;
}

/**
 * Evaluate an operator object against a field value
 */
function evaluateOperator(
  fieldValue: unknown,
  operator: FilterOperator,
): boolean {
  for (const [op, opValue] of Object.entries(operator)) {
    switch (op) {
      case "eq":
        if (fieldValue !== opValue) return false;
        break;

      case "ne":
        if (fieldValue === opValue) return false;
        break;

      case "gt":
        if (typeof fieldValue !== "number" || typeof opValue !== "number")
          return false;
        if (!(fieldValue > opValue)) return false;
        break;

      case "gte":
        if (typeof fieldValue !== "number" || typeof opValue !== "number")
          return false;
        if (!(fieldValue >= opValue)) return false;
        break;

      case "lt":
        if (typeof fieldValue !== "number" || typeof opValue !== "number")
          return false;
        if (!(fieldValue < opValue)) return false;
        break;

      case "lte":
        if (typeof fieldValue !== "number" || typeof opValue !== "number")
          return false;
        if (!(fieldValue <= opValue)) return false;
        break;

      case "like":
      case "ilike": {
        if (typeof fieldValue !== "string" || typeof opValue !== "string")
          return false;
        const pattern = opValue.replace(/%/g, ".*");
        const regex = new RegExp(`^${pattern}$`, op === "ilike" ? "i" : "");
        if (!regex.test(fieldValue)) return false;
        break;
      }

      case "not_like":
      case "not_ilike": {
        if (typeof fieldValue !== "string" || typeof opValue !== "string")
          return false;

        const pattern = opValue.replace(/%/g, ".*");
        const regex = new RegExp(`^${pattern}$`, op === "not_ilike" ? "i" : "");
        const matched = regex.test(fieldValue);
        if (matched) return false;
        break;
      }

      case "in": {
        if (!Array.isArray(opValue))
          throw new DatafnExecutionError("DFQL_INVALID", "Operator 'in' requires array value", `filters.${key}`);
        if (!opValue.includes(fieldValue)) return false;
        break;
      }

      case "not_in": {
        if (!Array.isArray(opValue))
          throw new DatafnExecutionError("DFQL_INVALID", "Operator 'not_in' requires array value", `filters.${key}`);
        if (opValue.includes(fieldValue)) return false;
        break;
      }

      case "is_null":
        if (opValue === true && fieldValue !== null) return false;
        if (opValue === false && fieldValue === null) return false;
        break;

      case "is_not_null":
        if (opValue === true && fieldValue === null) return false;
        if (opValue === false && fieldValue !== null) return false;
        break;

      case "is_empty": {
        // true if null/undefined OR "" OR []
        const isEmpty =
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === "" ||
          (Array.isArray(fieldValue) && fieldValue.length === 0);
        if (opValue === true && !isEmpty) return false;
        if (opValue === false && isEmpty) return false;
        break;
      }

      case "is_not_empty": {
        const isEmpty =
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === "" ||
          (Array.isArray(fieldValue) && fieldValue.length === 0);
        if (opValue === true && isEmpty) return false;
        if (opValue === false && !isEmpty) return false;
        break;
      }

      // Comparison aliases
      case "before": // <
        if (typeof fieldValue !== "number" && typeof fieldValue !== "string")
          return false;
        if (typeof opValue !== typeof fieldValue) return false;
        if (!((fieldValue as any) < (opValue as any))) return false;
        break;

      case "after": // >
        if (typeof fieldValue !== "number" && typeof fieldValue !== "string")
          return false;
        if (typeof opValue !== typeof fieldValue) return false;
        if (!((fieldValue as any) > (opValue as any))) return false;
        break;

      case "between": {
        // >= low and <= high
        if (!Array.isArray(opValue) || opValue.length !== 2)
          throw new DatafnExecutionError("DFQL_INVALID", "Operator 'between' requires array [low, high]", `filters.${key}`);
        const [low, high] = opValue;
        // Basic type check
        if (
          (typeof fieldValue !== "number" && typeof fieldValue !== "string") ||
          fieldValue === null
        )
          return false;
        if (!((fieldValue as any) >= low && (fieldValue as any) <= high))
          return false;
        break;
      }

      case "not_between": {
        // < low or > high
        if (!Array.isArray(opValue) || opValue.length !== 2)
          throw new DatafnExecutionError("DFQL_INVALID", "Operator 'not_between' requires array [low, high]", `filters.${key}`);
        const [low, high] = opValue;
        if (
          (typeof fieldValue !== "number" && typeof fieldValue !== "string") ||
          fieldValue === null
        )
          return false;
        if (!((fieldValue as any) < low || (fieldValue as any) > high))
          return false; // Match condition is "outside range"
        break;
      }

      default:
        // Unknown operator - should be caught during validation
        // Using "DFQL_UNSUPPORTED" code equivalent error
        const err: any = new Error(`Unsupported DFQL feature: operator.${op}`);
        err.code = "DFQL_UNSUPPORTED";
        throw err;
    }
  }
  return true;
}
