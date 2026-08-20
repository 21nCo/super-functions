import { describe, expect, it } from "vitest";
import type { TableSchema } from "@superfunctions/db";
import {
  generateDrizzleMigration,
  generateKyselyMigration,
  generatePrismaMigration,
} from "../utils/generators.js";
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

  it("replaces a same-name index whose columns or uniqueness do not match", () => {
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
        indexes: [{
          name: "plugfn_sync_jobs_claim_token_idx",
          tableName: "plugfn_sync_jobs",
          columns: ["id"],
          isUnique: false,
        }],
        constraints: [],
      }],
      "plugfn",
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        changedIndexes: [{
          name: "plugfn_sync_jobs_claim_token_idx",
          current: { columns: ["id"], unique: false },
          required: { columns: ["claim_token"], unique: true },
        }],
      }),
    ]);

    const plan = createMigrationPlan("plugfn", 5, 6, diffs);
    const mysqlSql = generateDrizzleMigration(plan, [syncJobs], "mysql").content;
    expect(mysqlSql).toContain(
      "DROP INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs;",
    );
    expect(mysqlSql).toContain(
      "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token(191));",
    );
    const kysely = generateKyselyMigration(plan, [syncJobs], "mysql").content;
    expect(kysely).toContain(
      "dropIndex('plugfn_sync_jobs_claim_token_idx').on('plugfn_sync_jobs').execute()",
    );
    expect(kysely).toContain(
      "sql`CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token(191));`.execute(db)",
    );
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

    const mysqlIndex =
      "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token(191));";
    expect(generateDrizzleMigration(plan, [syncJobs], "mysql").content).toContain(mysqlIndex);
    expect(generatePrismaMigration(plan, [syncJobs], "mysql").content).toContain(mysqlIndex);
    expect(generateDrizzleMigration(plan, [syncJobs], "mysql").content).not.toContain(
      "INDEX IF NOT EXISTS",
    );
    expect(generateKyselyMigration(plan, [syncJobs], "mysql").content).toContain(
      "dropIndex('plugfn_sync_jobs_claim_token_idx').on('plugfn_sync_jobs').execute()",
    );
  });

  it("emits dialect-valid indexes when creating a MySQL table", () => {
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);
    const expected =
      "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token(191));";

    expect(generateDrizzleMigration(plan, [syncJobs], "mysql").content).toContain(expected);
    expect(generatePrismaMigration(plan, [syncJobs], "mysql").content).toContain(expected);
  });
});
