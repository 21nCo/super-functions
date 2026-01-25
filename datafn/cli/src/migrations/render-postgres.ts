/**
 * Render Postgres migration script from plan.
 */

import type { MigrationPlan } from "./types.js";

export function renderPostgres(plan: MigrationPlan): string {
  const lines: string[] = [];

  for (const change of plan.changes) {
    switch (change.kind) {
      case "addResource":
        // NOTE: In a real implementation, we'd need the full Schema to know columns to create.
        // Or the diff needs to include the initial columns.
        // For Phase 25 scope (TV-MIG-001 is about addField), we implement basic scaffolds.
        lines.push(`-- Create table ${change.resource}`);
        lines.push(`CREATE TABLE "${change.resource}" (id TEXT PRIMARY KEY);`);
        // Real implementation would iterate columns from schema lookup
        break;

      case "removeResource":
        lines.push(`DROP TABLE IF EXISTS "${change.resource}";`);
        break;

      case "addField":
        const nullClause = change.required ? "NOT NULL" : "NULL";
        const pgType = mapToPgType(change.type);
        lines.push(
          `ALTER TABLE "${change.resource}" ADD COLUMN "${change.field}" ${pgType} ${nullClause};`,
        );
        break;

      case "removeField":
        lines.push(
          `ALTER TABLE "${change.resource}" DROP COLUMN "${change.field}";`,
        );
        break;

      case "alterField":
        if (change.changes.type) {
          const newType = mapToPgType(change.changes.type);
          lines.push(
            `ALTER TABLE "${change.resource}" ALTER COLUMN "${change.field}" TYPE ${newType};`,
          );
        }
        if (change.changes.required !== undefined) {
          const constraint = change.changes.required
            ? "SET NOT NULL"
            : "DROP NOT NULL";
          lines.push(
            `ALTER TABLE "${change.resource}" ALTER COLUMN "${change.field}" ${constraint};`,
          );
        }
        break;
    }
  }

  return lines.join("\n");
}

function mapToPgType(type: string): string {
  switch (type) {
    case "string":
      return "TEXT";
    case "boolean":
      return "BOOLEAN";
    case "number":
      return "NUMERIC"; // or INTEGER/DOUBLE depending on nuance
    case "date":
      return "BIGINT"; // storing timestamp
    case "object":
      return "JSONB";
    case "array":
      return "JSONB";
    case "file":
      return "TEXT";
    default:
      return "TEXT";
  }
}
