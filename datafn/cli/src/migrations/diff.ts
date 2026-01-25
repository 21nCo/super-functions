/**
 * Diffing logic for DataFn schemas.
 */

import {
  type DatafnSchema,
  validateSchema,
  unwrapEnvelope,
} from "@datafn/core";
import type { MigrationPlan, MigrationChange } from "./types.js";

/**
 * Compute the migration plan to transition 'from' schema to 'to' schema.
 */
export function diffSchemas(
  fromInput: unknown,
  toInput: unknown,
): MigrationPlan {
  // Validate both schemas deterministically via envelope
  const from = unwrapEnvelope(validateSchema(fromInput));
  const to = unwrapEnvelope(validateSchema(toInput));

  const changes: MigrationChange[] = [];

  // Sort resources for deterministic diff
  const fromResources = new Map(from.resources.map((r) => [r.name, r]));
  const toResources = new Map(to.resources.map((r) => [r.name, r]));

  // 1. Added/Removed Resources
  const allResourceNames = new Set([
    ...fromResources.keys(),
    ...toResources.keys(),
  ]);
  const sortedResourceNames = Array.from(allResourceNames).sort();

  for (const name of sortedResourceNames) {
    const fromRes = fromResources.get(name);
    const toRes = toResources.get(name);

    if (!fromRes && toRes) {
      changes.push({ kind: "addResource", resource: name });
      // Implicitly, all fields are added, but usually migration logic separates table creation from column addition
      // or treats table creation as including initial columns.
      // For simplicity in this phase (and as per standard patterns),
      // "addResource" implies creating the table.
      // However, if we want detailed "addField" ops, we could generate them.
      // But typically `CREATE TABLE` includes columns.
      // Wait, let's check Test Vector TV-MIG-001 expectation.
      // TV-MIG-001 shows `changes: [{ kind: "addField", ... }]` for a simple field addition.
      // If we add a whole table, the plan usually just says "addResource".
      // But we might need to know the initial schema of that resource.
      // Let's assume for now `diffSchemas` produces granular changes or robust `addResource` handled by renderer.
      // Actually, for `addField` to work, the resource must exist.
      // If `addResource` is emitted, the renderer needs to look up the definition in `to` schema.
    } else if (fromRes && !toRes) {
      changes.push({ kind: "removeResource", resource: name });
    } else if (fromRes && toRes) {
      // Shared resource: check fields
      const fromFields = new Map(fromRes.fields.map((f) => [f.name, f]));
      const toFields = new Map(toRes.fields.map((f) => [f.name, f]));

      const allFieldNames = new Set([...fromFields.keys(), ...toFields.keys()]);
      const sortedFieldNames = Array.from(allFieldNames).sort();

      for (const fieldName of sortedFieldNames) {
        const fromField = fromFields.get(fieldName);
        const toField = toFields.get(fieldName);

        if (!fromField && toField) {
          changes.push({
            kind: "addField",
            resource: name,
            field: fieldName,
            type: toField.type,
            required: toField.required,
          });
        } else if (fromField && !toField) {
          changes.push({
            kind: "removeField",
            resource: name,
            field: fieldName,
          });
        } else if (fromField && toField) {
          // Check for modifications
          const typeChanged = fromField.type !== toField.type;
          const requiredChanged = fromField.required !== toField.required;

          if (typeChanged || requiredChanged) {
            changes.push({
              kind: "alterField",
              resource: name,
              field: fieldName,
              changes: {
                ...(typeChanged ? { type: toField.type } : {}),
                ...(requiredChanged ? { required: toField.required } : {}),
              },
            });
          }
        }
      }
    }
  }

  return { changes };
}
