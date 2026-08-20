import { describe, expect, it } from "vitest";
import type { TableSchema } from "@superfunctions/db";
import {
  generateDrizzleMigration,
  generateKyselyMigration,
  generatePrismaMigration,
} from "../utils/generators.js";
import { createMigrationPlan, diffTables } from "../utils/schema-diff.js";
import { introspectMySQL, introspectSQLite } from "../utils/introspection.js";
import { generateDrizzleSchemaFile } from "../utils/schema-generators.js";
import { hasUnsafeMySqlMetadataSyntax } from "../utils/mysql-types.js";

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
  it("reads MySQL visibility from EXTRA and preserves index prefixes", async () => {
    const db = {
      query: async (query: string) => {
        if (query.includes("information_schema.TABLES")) {
          return [[{ table_name: "plugfn_jobs" }]];
        }
        if (query.includes("information_schema.COLUMNS")) {
          expect(query).not.toContain("IS_VISIBLE");
          return [[{
            column_name: "legacy_note",
            data_type: "text",
            column_type: "text",
            character_maximum_length: 65_535,
            extra: "INVISIBLE",
            generation_expression: "",
            character_set_name: "utf8mb4",
            collation_name: "utf8mb4_0900_ai_ci",
            column_comment: "",
            is_nullable: "YES",
            column_default: null,
            column_key: "UNI",
          }]];
        }
        if (query.includes("information_schema.STATISTICS")) {
          expect(query).toContain("SUB_PART as sub_part");
          expect(query).toContain("INDEX_TYPE as index_type");
          return [[{
            name: "jobs_note_idx",
            table_name: "plugfn_jobs",
            non_unique: 0,
            column_name: "legacy_note",
            sub_part: 50,
            index_type: "FULLTEXT",
          }]];
        }
        throw new Error(`Unexpected query: ${query}`);
      },
    };

    const [table] = await introspectMySQL(db, "app", "plugfn_");

    expect(table.columns[0].isVisible).toBe(false);
    expect(table.indexes[0].prefixLengths).toEqual([50]);
    expect(table.indexes[0].indexType).toBe("FULLTEXT");
  });

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
          current: {
            columns: ["id"],
            unique: false,
            textColumns: ["id"],
            columnMetadata: [{ dataType: "text" }],
          },
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

  it("migrates existing MySQL TEXT before creating a bounded unique index", () => {
    const diffs = diffTables([syncJobs], [{
      name: "plugfn_sync_jobs",
      columns: [
        {
          dialect: "mysql",
          tableName: "plugfn_sync_jobs",
          columnName: "id",
          dataType: "text",
          maxLength: null,
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isUnique: true,
        },
        {
          dialect: "mysql",
          tableName: "plugfn_sync_jobs",
          columnName: "claim_token",
          dataType: "text",
          maxLength: null,
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isUnique: false,
        },
      ],
      indexes: [],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].columnChanges).toEqual([expect.objectContaining({
      column: "claim_token",
      change: "maxLength changed from unbounded to 64",
    })]);
    const plan = createMigrationPlan("plugfn", 5, 6, diffs);
    for (const generate of [generateDrizzleMigration, generatePrismaMigration]) {
      const content = generate(plan, [syncJobs], "mysql").content;
      expect(content).toContain(
        "ALTER TABLE plugfn_sync_jobs MODIFY COLUMN claim_token VARCHAR(64) NULL;",
      );
      expect(content.indexOf("MODIFY COLUMN claim_token"))
        .toBeLessThan(content.indexOf("CREATE UNIQUE INDEX"));
    }
    const kysely = generateKyselyMigration(plan, [syncJobs], "mysql").content;
    const up = kysely.slice(0, kysely.indexOf("export async function down"));
    const down = kysely.slice(kysely.indexOf("export async function down"));
    expect(up.indexOf("MODIFY COLUMN claim_token VARCHAR(64) NULL"))
      .toBeLessThan(up.indexOf("CREATE UNIQUE INDEX"));
    expect(down.indexOf("dropIndex('plugfn_sync_jobs_claim_token_idx')"))
      .toBeLessThan(down.indexOf("MODIFY COLUMN claim_token TEXT NULL"));
  });

  it("does not classify bounded VARCHAR columns as unbounded rollback text", () => {
    const replacementSchema = {
      ...syncJobs,
      indexes: [{ name: "plugfn_sync_jobs_claim_token_idx", fields: ["id"] }],
    } as unknown as TableSchema;
    const diffs = diffTables([replacementSchema], [{
      name: "plugfn_sync_jobs",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_sync_jobs",
        columnName: "claim_token",
        dataType: "varchar",
        maxLength: 64,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }, {
        dialect: "mysql",
        tableName: "plugfn_sync_jobs",
        columnName: "id",
        dataType: "varchar",
        maxLength: 64,
        isNullable: false,
        defaultValue: null,
        isPrimaryKey: true,
        isUnique: true,
      }],
      indexes: [{
        name: "plugfn_sync_jobs_claim_token_idx",
        tableName: "plugfn_sync_jobs",
        columns: ["claim_token"],
        isUnique: true,
      }],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].changedIndexes?.[0].current.textColumns).toBeUndefined();
    expect(() => generateKyselyMigration(
      createMigrationPlan("plugfn", 6, 7, diffs),
      [replacementSchema],
      "mysql",
    )).not.toThrow();
  });

  it("rejects MySQL VARCHAR bounds beyond the utf8mb4-safe limit", () => {
    const invalid = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: { ...syncJobs.fields.claimToken, maxLength: 16_384 },
      },
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);

    for (const generate of [
      generateDrizzleMigration,
      generatePrismaMigration,
      generateKyselyMigration,
    ]) {
      expect(() => generate(plan, [invalid], "mysql"))
        .toThrow("expected an integer between 1 and 16383");
    }
    expect(() => generateDrizzleSchemaFile(
      { version: 1, schemas: [invalid] },
      "plugfn",
      "plugfn",
      "mysql",
    )).toThrow("expected an integer between 1 and 16383");

    expect(() => diffTables([invalid], [{
      name: "plugfn_sync_jobs",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_sync_jobs",
        columnName: "claim_token",
        dataType: "varchar",
        maxLength: 16_384,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn")).toThrow("expected an integer between 1 and 16383");
  });

  it("rejects bounded MySQL string indexes above the utf8mb4 key budget", () => {
    const invalidIndex = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: { ...syncJobs.fields.claimToken, maxLength: 769 },
      },
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);

    for (const generate of [
      generateDrizzleMigration,
      generatePrismaMigration,
      generateKyselyMigration,
    ]) {
      expect(() => generate(plan, [invalidIndex], "mysql"))
        .toThrow("exceeds the utf8mb4 full-column index limit 768");
    }
  });

  it("accounts for non-string columns in composite MySQL index key budgets", () => {
    const composite = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: { ...syncJobs.fields.claimToken, maxLength: 768 },
        sequence: { type: "number", required: true, fieldName: "sequence" },
      },
      indexes: [{
        name: "plugfn_sync_jobs_composite_idx",
        fields: ["claimToken", "sequence"],
        unique: false,
      }],
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_sync_jobs",
      action: "create",
    }]);

    for (const generate of [
      generateDrizzleMigration,
      generatePrismaMigration,
      generateKyselyMigration,
    ]) {
      expect(() => generate(plan, [composite], "mysql"))
        .toThrow("encoded key size 3076 bytes exceeds the 3072-byte InnoDB limit");
    }
  });

  it("uses physical temporal widths in composite MySQL index budgets", () => {
    const composite = {
      modelName: "events",
      fields: {
        token: { type: "string", required: true, fieldName: "token", maxLength: 766 },
        recordedAt: {
          type: "datetime",
          required: true,
          fieldName: "recorded_at",
        },
        active: { type: "boolean", required: true, fieldName: "active" },
      },
      indexes: [{
        name: "events_token_recorded_idx",
        fields: ["token", "recordedAt", "active"],
      }],
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_events",
      action: "create",
    }]);

    expect(() => generateDrizzleMigration(plan, [composite], "mysql"))
      .not.toThrow();
    expect(generateDrizzleMigration(plan, [composite], "mysql").content)
      .toContain("events_token_recorded_idx ON plugfn_events (token, recorded_at, active)");
  });

  it("prefixes MySQL indexes for date fields stored as ISO text", () => {
    const dateText = {
      modelName: "events",
      fields: {
        id: { type: "string", required: true, fieldName: "id", maxLength: 64 },
        occurredAt: {
          type: "datetime",
          dateStorageType: "iso-text",
          required: true,
          fieldName: "occurred_at",
        },
      },
      indexes: [{
        name: "plugfn_events_occurred_at_idx",
        fields: ["occurredAt"],
        unique: false,
      }],
    } as unknown as TableSchema;
    const plan = createMigrationPlan("plugfn", 0, 1, [{
      tableName: "plugfn_events",
      action: "create",
    }]);

    expect(generateDrizzleMigration(plan, [dateText], "mysql").content)
      .toContain("plugfn_events_occurred_at_idx ON plugfn_events (occurred_at(191))");
    expect(generateKyselyMigration(plan, [dateText], "mysql").content)
      .toContain("plugfn_events_occurred_at_idx ON plugfn_events (occurred_at(191))");
  });

  it("detects an existing MySQL VARCHAR when the schema requires unbounded TEXT", () => {
    const unbounded = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: {
          type: "string",
          required: false,
          fieldName: "claim_token",
        },
      },
      indexes: [],
    } as unknown as TableSchema;
    const diffs = diffTables([unbounded], [{
      name: "plugfn_sync_jobs",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_sync_jobs",
        columnName: "claim_token",
        dataType: "varchar",
        columnType: "varchar(64)",
        maxLength: 64,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].columnChanges?.[0].change)
      .toContain("maxLength changed from 64 to unbounded");
  });

  it("preserves desired and prior defaults plus the complete MySQL rollback type", () => {
    const withDefault = {
      ...syncJobs,
      fields: {
        ...syncJobs.fields,
        claimToken: {
          ...syncJobs.fields.claimToken,
          defaultValue: "pending",
        },
      },
      indexes: [],
    } as unknown as TableSchema;
    const diffs = diffTables([withDefault], [{
      name: "plugfn_sync_jobs",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_sync_jobs",
        columnName: "claim_token",
        dataType: "enum",
        columnType: "enum('legacy','pending')",
        maxLength: 7,
        isNullable: false,
        defaultValue: "legacy",
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn");
    const plan = createMigrationPlan("plugfn", 5, 6, diffs);

    for (const generate of [generateDrizzleMigration, generatePrismaMigration]) {
      expect(generate(plan, [withDefault], "mysql").content).toContain(
        "MODIFY COLUMN claim_token VARCHAR(64) NULL DEFAULT 'pending';",
      );
    }
    const kysely = generateKyselyMigration(plan, [withDefault], "mysql").content;
    expect(kysely).toContain(
      "MODIFY COLUMN claim_token VARCHAR(64) NULL DEFAULT 'pending'",
    );
    expect(kysely).toContain(
      "MODIFY COLUMN claim_token enum('legacy','pending') NOT NULL DEFAULT 'legacy'",
    );
  });

  it("preserves MySQL AUTO_INCREMENT and ON UPDATE column attributes", () => {
    const attributesSchema = {
      modelName: "attributes",
      fields: {
        id: { type: "number", required: true, fieldName: "id" },
        updatedAt: {
          type: "datetime",
          required: false,
          fieldName: "updated_at",
        },
      },
      indexes: [],
    } as unknown as TableSchema;
    const diffs = diffTables([attributesSchema], [{
      name: "plugfn_attributes",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_attributes",
        columnName: "id",
        dataType: "int",
        columnType: "int unsigned",
        maxLength: null,
        extra: "auto_increment",
        generationExpression: "",
        isVisible: true,
        characterSet: null,
        collation: null,
        comment: "primary counter",
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: true,
        isUnique: true,
      }, {
        dialect: "mysql",
        tableName: "plugfn_attributes",
        columnName: "updated_at",
        dataType: "timestamp",
        columnType: "timestamp",
        maxLength: null,
        extra: "DEFAULT_GENERATED on update CURRENT_TIMESTAMP",
        generationExpression: "",
        isVisible: false,
        characterSet: null,
        collation: null,
        comment: "update clock",
        isNullable: false,
        defaultValue: "CURRENT_TIMESTAMP",
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn");
    const plan = createMigrationPlan("plugfn", 1, 2, diffs);

    const drizzle = generateDrizzleMigration(
      plan,
      [attributesSchema],
      "mysql",
    ).content;
    expect(drizzle).toContain(
      "MODIFY COLUMN id int unsigned NOT NULL auto_increment COMMENT 'primary counter';",
    );
    expect(drizzle).toContain(
      "MODIFY COLUMN updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP INVISIBLE COMMENT 'update clock';",
    );

    const kysely = generateKyselyMigration(
      plan,
      [attributesSchema],
      "mysql",
    ).content;
    expect(kysely).toContain(
      "MODIFY COLUMN id int unsigned NULL auto_increment COMMENT 'primary counter'",
    );
    expect(kysely).toContain(
      "MODIFY COLUMN updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP INVISIBLE COMMENT 'update clock'",
    );
  });

  it("removes temporal ON UPDATE metadata when changing to a non-temporal MySQL type", () => {
    const replacementSchema = {
      modelName: "attributes",
      fields: {
        legacyClock: {
          type: "string",
          required: false,
          fieldName: "legacy_clock",
          maxLength: 64,
        },
      },
      indexes: [],
    } as unknown as TableSchema;
    const diffs = diffTables([replacementSchema], [{
      name: "plugfn_attributes",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_attributes",
        columnName: "legacy_clock",
        dataType: "timestamp",
        columnType: "timestamp",
        maxLength: null,
        extra: "DEFAULT_GENERATED on update CURRENT_TIMESTAMP",
        generationExpression: "",
        isVisible: true,
        characterSet: null,
        collation: null,
        comment: null,
        isNullable: false,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn");
    const kysely = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [replacementSchema],
      "mysql",
    ).content;
    const up = kysely.slice(0, kysely.indexOf("export async function down"));
    const down = kysely.slice(kysely.indexOf("export async function down"));

    expect(up).toContain(
      "MODIFY COLUMN legacy_clock VARCHAR(64) NULL",
    );
    expect(up).not.toContain("ON UPDATE");
    expect(down).toContain(
      "MODIFY COLUMN legacy_clock timestamp NOT NULL on update CURRENT_TIMESTAMP",
    );
  });

  it("quotes character defaults and escapes introspected types in Kysely templates", () => {
    const metadataSchema = {
      modelName: "metadata",
      fields: {
        state: { type: "string", required: true, fieldName: "state", maxLength: 32 },
        marker: { type: "string", required: true, fieldName: "marker", maxLength: 32 },
        requestId: {
          type: "string",
          required: true,
          fieldName: "request_id",
          maxLength: 36,
        },
        quotedDefault: {
          type: "string",
          required: true,
          fieldName: "quoted_default",
          maxLength: 128,
        },
      },
      indexes: [],
    } as unknown as TableSchema;
    const diffs = diffTables([metadataSchema], [{
      name: "plugfn_metadata",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_metadata",
        columnName: "state",
        dataType: "varchar",
        columnType: "varchar(32)",
        maxLength: 32,
        isNullable: true,
        defaultValue: "CURRENT_TIMESTAMP",
        isPrimaryKey: false,
        isUnique: false,
      }, {
        dialect: "mysql",
        tableName: "plugfn_metadata",
        columnName: "marker",
        dataType: "enum",
        columnType: "enum('safe','${process.env.SECRET}','--','/*')",
        maxLength: 21,
        isNullable: false,
        defaultValue: "safe",
        isPrimaryKey: false,
        isUnique: false,
      }, {
        dialect: "mysql",
        tableName: "plugfn_metadata",
        columnName: "request_id",
        dataType: "varchar",
        columnType: "varchar(36)",
        maxLength: 36,
        extra: "DEFAULT_GENERATED",
        isNullable: true,
        defaultValue: "(uuid())",
        isPrimaryKey: false,
        isUnique: false,
      }, {
        dialect: "mysql",
        tableName: "plugfn_metadata",
        columnName: "quoted_default",
        dataType: "varchar",
        columnType: "varchar(128)",
        maxLength: 128,
        extra: "DEFAULT_GENERATED",
        isNullable: true,
        defaultValue: "(concat('a--b', '/*c*/', 'semi;colon'))",
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [],
      constraints: [],
    }], "plugfn");
    const content = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [metadataSchema],
      "mysql",
    ).content;

    expect(content).toContain("varchar(32) NOT NULL DEFAULT 'CURRENT_TIMESTAMP'");
    expect(content).toContain("enum('safe','\\${process.env.SECRET}','--','/*')");
    expect(content).toContain("varchar(36) NOT NULL DEFAULT (uuid())");
    expect(content).toContain(
      "varchar(128) NOT NULL DEFAULT (concat('a--b', '/*c*/', 'semi;colon'))",
    );
    expect(
      hasUnsafeMySqlMetadataSyntax("(concat('safe') /* outside quote */)"),
    ).toBe(true);
    expect(
      hasUnsafeMySqlMetadataSyntax("(concat('safe\\'; DROP TABLE users; --'))"),
    ).toBe(true);
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
        prefixLengths: [50],
        isUnique: true,
      }],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].changedIndexes?.[0].current.textColumns)
      .toEqual(["legacy_note"]);
    expect(diffs[0].changedIndexes?.[0].current.prefixLengths)
      .toEqual([50]);
    const content = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [replacementSchema],
      "mysql",
    ).content;
    const down = content.slice(content.indexOf("export async function down"));
    expect(down).toContain(
      "CREATE UNIQUE INDEX jobs_lookup_idx ON plugfn_jobs (legacy_note(50));",
    );
  });

  it("preserves removed MySQL FULLTEXT index type without adding prefixes", () => {
    const replacementSchema = {
      modelName: "jobs",
      fields: {
        id: { type: "string", required: true, fieldName: "id", maxLength: 64 },
        sequence: { type: "number", required: false, fieldName: "sequence" },
      },
      indexes: [{ name: "jobs_lookup_idx", fields: ["sequence"] }],
    } as unknown as TableSchema;
    const diffs = diffTables([replacementSchema], [{
      name: "plugfn_jobs",
      columns: [{
        dialect: "mysql",
        tableName: "plugfn_jobs",
        columnName: "legacy_body",
        dataType: "text",
        columnType: "text",
        maxLength: 65_535,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }, {
        dialect: "mysql",
        tableName: "plugfn_jobs",
        columnName: "sequence",
        dataType: "int",
        columnType: "int",
        maxLength: null,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
      }],
      indexes: [{
        name: "jobs_lookup_idx",
        tableName: "plugfn_jobs",
        columns: ["legacy_body"],
        indexType: "FULLTEXT",
        isUnique: false,
      }],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].changedIndexes?.[0].current.indexType).toBe("FULLTEXT");
    const content = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [replacementSchema],
      "mysql",
    ).content;
    const down = content.slice(content.indexOf("export async function down"));
    expect(down).toContain(
      "CREATE FULLTEXT INDEX jobs_lookup_idx ON plugfn_jobs (legacy_body);",
    );
    expect(down).not.toContain("legacy_body(191)");
  });

  it("preserves removed numeric-column metadata in a Kysely index rollback", () => {
    const replacementSchema = {
      modelName: "jobs",
      fields: {
        id: { type: "string", required: true, fieldName: "id" },
        count: { type: "number", required: false, fieldName: "count" },
      },
      indexes: [{ name: "jobs_lookup_idx", fields: ["count"] }],
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
          dialect: "mysql",
          tableName: "plugfn_jobs",
          columnName: "legacy_count",
          dataType: "int",
          columnType: "int unsigned",
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isUnique: false,
        },
      ],
      indexes: [{
        name: "jobs_lookup_idx",
        tableName: "plugfn_jobs",
        columns: ["legacy_count"],
        isUnique: false,
      }],
      constraints: [],
    }], "plugfn");

    expect(diffs[0].changedIndexes?.[0].current.columnMetadata)
      .toEqual([{ dataType: "int", columnType: "int unsigned" }]);
    const content = generateKyselyMigration(
      createMigrationPlan("plugfn", 1, 2, diffs),
      [replacementSchema],
      "mysql",
    ).content;
    const down = content.slice(content.indexOf("export async function down"));
    expect(down).toContain(
      "CREATE INDEX jobs_lookup_idx ON plugfn_jobs (legacy_count);",
    );
  });
});
