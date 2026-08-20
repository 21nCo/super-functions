import { describe, expect, it } from "vitest";
import type { TableSchema } from "@superfunctions/db";
import {
  generateDrizzleMigration,
  generateKyselyMigration,
  generatePrismaMigration,
} from "../utils/generators.js";
import { createMigrationPlan, diffTables } from "../utils/schema-diff.js";
import { introspectSQLite } from "../utils/introspection.js";
import { generateDrizzleSchemaFile } from "../utils/schema-generators.js";

const syncJobs = {
  modelName: "syncJobs",
  fields: {
    id: { type: "string", required: true, fieldName: "id" },
    claimToken: {
      type: "string",
      required: false,
      fieldName: "claim_token",
      maxLength: 64,
    },
  },
  indexes: [
    { name: "plugfn_sync_jobs_claim_token_idx", fields: ["claimToken"], unique: true },
  ],
} as unknown as TableSchema;

describe("schema index migrations", () => {
  it("preserves SQLite index uniqueness during introspection", async () => {
    const db = {
      all: async (query: string, params: unknown[]) => {
        if (query.includes("FROM sqlite_master") && query.includes("type = 'table'")) {
          return [{ table_name: "plugfn_sync_jobs" }];
        }
        if (query.includes("PRAGMA table_info")) {
          return [
            { name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
            { name: "claim_token", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
          ];
        }
        if (query.includes("pragma_index_list")) {
          expect(params).toEqual(["plugfn_sync_jobs"]);
          return [{ name: "plugfn_sync_jobs_claim_token_idx", is_unique: 1 }];
        }
        if (query.includes("pragma_index_info")) {
          expect(params).toEqual(["plugfn_sync_jobs_claim_token_idx"]);
          return [{ name: "claim_token", seqno: 0 }];
        }
        throw new Error(`Unexpected query: ${query}`);
      },
    };

    const [table] = await introspectSQLite(db);

    expect(table.indexes).toEqual([{
      name: "plugfn_sync_jobs_claim_token_idx",
      tableName: "plugfn_sync_jobs",
      columns: ["claim_token"],
      isUnique: true,
    }]);
    expect(diffTables([syncJobs], [table], "plugfn")).toEqual([]);
  });

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
          current: { columns: ["id"], unique: false, textColumns: ["id"] },
          required: { columns: ["claim_token"], unique: true },
        }],
      }),
    ]);

    const plan = createMigrationPlan("plugfn", 5, 6, diffs);
    const mysqlIndex =
      "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token);";
    expect(generateDrizzleMigration(plan, [syncJobs], "mysql").content)
      .toContain(mysqlIndex);
    expect(generateKyselyMigration(plan, [syncJobs], "mysql").content)
      .toContain(mysqlIndex);
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

    for (const generate of [
      generateDrizzleMigration,
      generatePrismaMigration,
      generateKyselyMigration,
    ]) {
      expect(generate(plan, [syncJobs], "mysql").content).toContain(
        "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token);",
      );
    }
  });

  it("drops a new index before its indexed column in Kysely rollbacks", () => {
    const plan = createMigrationPlan("plugfn", 5, 6, [{
      tableName: "plugfn_sync_jobs",
      action: "alter",
      missingColumns: ["claim_token"],
      missingIndexes: [{
        name: "plugfn_sync_jobs_claim_token_idx",
        columns: ["claim_token"],
        unique: true,
      }],
    }]);
    const content = generateKyselyMigration(plan, [syncJobs], "postgres").content;
    const down = content.slice(content.indexOf("export async function down"));

    expect(down.indexOf("dropIndex('plugfn_sync_jobs_claim_token_idx')"))
      .toBeLessThan(down.indexOf("dropColumn('claim_token')"));
  });

  it("rejects unique MySQL indexes on unbounded TEXT columns", () => {
    const unboundedSyncJobs = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: {
          type: "string",
          required: false,
          fieldName: "claim_token",
        },
      },
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);
    expect(() => generateDrizzleMigration(plan, [unboundedSyncJobs], "mysql"))
      .toThrow("Cannot generate unique MySQL index plugfn_sync_jobs_claim_token_idx on unbounded TEXT column(s): claim_token");
    expect(() => generatePrismaMigration(plan, [unboundedSyncJobs], "mysql"))
      .toThrow("Cannot generate unique MySQL index plugfn_sync_jobs_claim_token_idx on unbounded TEXT column(s): claim_token");
  });

  it("creates bounded MySQL claim tokens with full-value uniqueness", () => {
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);
    for (const generate of [generateDrizzleMigration, generatePrismaMigration]) {
      const content = generate(plan, [syncJobs], "mysql").content;
      expect(content).toContain("claim_token VARCHAR(64)");
      expect(content).toContain(
        "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token);",
      );
      expect(content).not.toContain("claim_token(191)");
    }
    const kysely = generateKyselyMigration(plan, [syncJobs], "mysql").content;
    expect(kysely).toContain("addColumn('claim_token', 'varchar(64)'");
    expect(kysely).toContain(
      "CREATE UNIQUE INDEX plugfn_sync_jobs_claim_token_idx ON plugfn_sync_jobs (claim_token);",
    );
    const drizzleSchema = generateDrizzleSchemaFile(
      { version: 6, schemas: [syncJobs] },
      "plugfn",
      "plugfn",
      "mysql",
    );
    expect(drizzleSchema).toContain(
      "claimToken: varchar('claim_token', { length: 64 })",
    );
    expect(drizzleSchema).toContain(
      "uniqueIndex('plugfn_sync_jobs_claim_token_idx').on(table.claimToken)",
    );
  });

  it("preserves removed TEXT-column metadata in a Kysely index rollback", () => {
    const replacementSchema = {
      modelName: "jobs",
      fields: {
        id: { type: "string", required: true, fieldName: "id" },
        sequence: { type: "number", required: false, fieldName: "sequence" },
      },
      indexes: [{ name: "jobs_lookup_idx", fields: ["sequence"] }],
    } as unknown as TableSchema;
    const diffs = diffTables([replacementSchema], [{
      name: "plugfn_jobs",
      columns: [
        {
          tableName: "plugfn_jobs",
          columnName: "id",
          dataType: "text",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isUnique: true,
        },
        {
          tableName: "plugfn_jobs",
          columnName: "legacy_note",
          dataType: "text",
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isUnique: false,
        },
      ],
      indexes: [{
        name: "jobs_lookup_idx",
        tableName: "plugfn_jobs",
        columns: ["legacy_note"],
        isUnique: false,
      }],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].changedIndexes?.[0].current.textColumns)
      .toEqual(["legacy_note"]);
    const content = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [replacementSchema],
      "mysql",
    ).content;
    const down = content.slice(content.indexOf("export async function down"));
    expect(down).toContain(
      "CREATE INDEX jobs_lookup_idx ON plugfn_jobs (legacy_note(191));",
    );
  });
});
