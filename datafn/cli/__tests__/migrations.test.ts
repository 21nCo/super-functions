/**
 * Migration Tests
 * Tests TV-MIG-001, TV-MIG-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { diffSchemas } from "../src/migrations/diff.js";
import { renderPostgres } from "../src/migrations/render-postgres.js";
import type { DatafnSchema } from "@datafn/core";

// Test schema helper
const createSchema = (resources: any[], relations: any[] = []): DatafnSchema =>
  ({
    resources,
    relations,
  }) as DatafnSchema;

describe("Schema Migration Tests", () => {
  it("TV-MIG-001: Migration diff produces deterministic plan for a schema change", () => {
    const from = createSchema([
      {
        name: "task",
        version: 1,
        fields: [{ name: "title", type: "string", required: true }],
      },
    ]);

    const to = createSchema([
      {
        name: "task",
        version: 2,
        fields: [
          { name: "title", type: "string", required: true },
          { name: "done", type: "boolean", required: true },
        ],
      },
    ]);

    const plan = diffSchemas(from, to);

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toEqual({
      kind: "addField",
      resource: "task",
      field: "done",
      type: "boolean",
      required: true,
    });

    // Verify render matches expected SQL pattern
    const sql = renderPostgres(plan);
    expect(sql).toContain(
      'ALTER TABLE "task" ADD COLUMN "done" BOOLEAN NOT NULL;',
    );
  });

  it("TV-MIG-002: Invalid diffs are rejected deterministically", () => {
    const from = createSchema([
      {
        name: "task",
        version: 1,
        fields: [{ name: "title", type: "string", required: true }],
      },
    ]);

    // Missing resources in 'to'
    const invalidTo = { relations: [] } as unknown as DatafnSchema;

    try {
      diffSchemas(from, invalidTo);
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err).toBeTruthy();
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(err.message).toContain("Invalid schema");
    }
  });

  // Additional test for other changes
  it("Handles resource additions and removals", () => {
    const from = createSchema([
      {
        name: "old_table",
        version: 1,
        fields: [{ name: "id", type: "string", required: true }],
      },
    ]);

    const to = createSchema([
      {
        name: "new_table",
        version: 1,
        fields: [{ name: "id", type: "string", required: true }],
      },
    ]);

    const plan = diffSchemas(from, to);

    // Sort logic in diff puts removes/adds based on resource name iteration?
    // diff logic iterates all sorted resource names.
    // "new_table" comes before "old_table" alphabetically.
    // So "new_table" is checked first. from=undefined, to=defined -> addResource
    // Then "old_table". from=defined, to=undefined -> removeResource

    expect(plan.changes).toHaveLength(2);
    expect(plan.changes[0]).toEqual({
      kind: "addResource",
      resource: "new_table",
    });
    expect(plan.changes[1]).toEqual({
      kind: "removeResource",
      resource: "old_table",
    });

    const sql = renderPostgres(plan);
    expect(sql).toContain('CREATE TABLE "new_table" (id TEXT PRIMARY KEY);');
    expect(sql).toContain('DROP TABLE IF EXISTS "old_table";');
  });
});
