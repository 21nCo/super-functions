/**
 * Codegen Tests
 * Tests TV-CODEGEN-001, TV-CODEGEN-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { generateTypes } from "../src/index.js";
import type { DatafnSchema } from "@datafn/core";

const validSchema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "title", type: "string", required: true },
        { name: "done", type: "boolean", required: false },
      ],
    },
    {
      name: "goal",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "target_date", type: "date", required: true },
      ],
    },
  ],
  relations: [],
};

const invalidSchema = {
  // Missing 'fields' or 'resources' entirely
  relations: [],
} as unknown as DatafnSchema;

describe("TypeScript Codegen Tests", () => {
  it("TV-CODEGEN-001: Output is deterministic and contains expected types", () => {
    const output = generateTypes(validSchema);

    // Verify deterministic ordering of resources (Goal before Task alphabetically)
    const goalIndex = output.indexOf("export interface Goal");
    const taskIndex = output.indexOf("export interface Task");
    expect(goalIndex).toBeGreaterThan(-1);
    expect(taskIndex).toBeGreaterThan(-1);
    expect(goalIndex).toBeLessThan(taskIndex);

    // Verify fields (alphabetical within resource)
    // Goal: id, target_date
    const goalBlock = output.slice(goalIndex, taskIndex);
    expect(goalBlock).toContain("id: string;");
    expect(goalBlock).toContain("target_date: number;");

    // Task: done, id, title
    const taskBlock = output.slice(taskIndex);
    expect(taskBlock).toContain("done?: boolean;");
    expect(taskBlock).toContain("id: string;");
    expect(taskBlock).toContain("title: string;");

    // Verify Tables mapping
    expect(output).toContain("export interface Tables {");
    expect(output).toContain("  goal: Goal;");
    expect(output).toContain("  task: Task;");

    // Verify TypedClient
    expect(output).toContain("export type TypedClient = DatafnClient & {");
    expect(output).toContain("  goal: DatafnTable<Goal>;");
    expect(output).toContain("  task: DatafnTable<Task>;");
  });

  it("TV-CODEGEN-002: Invalid schema input is rejected deterministically", () => {
    try {
      generateTypes(invalidSchema);
      // Should fail
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err).toBeTruthy();
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(err.message).toContain("Invalid schema");
      expect(err.details).toBeDefined();
    }
  });
});
