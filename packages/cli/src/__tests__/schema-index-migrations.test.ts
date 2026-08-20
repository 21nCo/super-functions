import { describe, expect, it } from "vitest";
import type { TableSchema } from "@superfunctions/db";
import { generateDrizzleMigration, generateKyselyMigration } from "../utils/generators.js";
import { createMigrationPlan, diffTables } from "../utils/schema-diff.js";

const syncJobs = {
  modelName: "syncJobs",
  fields: {
    id: { type: "string", required: true, fieldName: "id" },
    claimToken: { type: "string", required: false, fieldName: "claim_token" },
  },
  indexes: [
    { name: "plugfn_sync_jobs_claim_token_idx", fields: ["claimToken"], unique: true },
  ],
} as unknown as TableSchema;

describe("schema index migrations", () => {
  it("detects a required index missing from an existing table", () => {
    const diffs = diffTables(
      [syncJobs],
      [{
        name: "plugfn_sync_jobs",
        columns: [
          {
            tableName: "plugfn_sync_jobs",
            columnName: "id",
            dataType: "text",
            isNullable: false,
            defaultValue: null,
            isPrimaryKey: true,
            isUnique: true,
          },
          {
            tableName: "plugfn_sync_jobs",
            columnName: "claim_token",
            dataType: "text",
            isNullable: true,
            defaultValue: null,
            isPrimaryKey: false,
            isUnique: false,
          },
        ],
        indexes: [],
        constraints: [],
      }],
      "plugfn",
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        tableName: "plugfn_sync_jobs",
        action: "alter",
        missingIndexes: [{
          name: "plugfn_sync_jobs_claim_token_idx",
          columns: ["claim_token"],
          unique: true,
        }],
      }),
    ]);
  });

  it("emits missing indexes for SQL and Kysely migrations", () => {
    const plan = createMigrationPlan("plugfn", 5, 6, [{
      tableName: "plugfn_sync_jobs",
      action: "alter",
      missingIndexes: [{
        name: "plugfn_sync_jobs_claim_token_idx",
        columns: ["claim_token"],
        unique: true,
      }],
    }]);

    expect(generateDrizzleMigration(plan, [syncJobs], "postgres").content).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token);",
    );
    expect(generateKyselyMigration(plan, [syncJobs], "postgres").content).toContain(
      "createIndex('plugfn_sync_jobs_claim_token_idx').on('plugfn_sync_jobs').columns([\"claim_token\"]).unique().execute()",
    );
  });
});
