/**
 * Schema validation tests
 * Tests TV-SCHEMA-001 and TV-SCHEMA-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { validateSchema } from "../src/schema.js";

describe("validateSchema", () => {
  // TV-SCHEMA-001: Valid schema with indices normalization
  it("TV-SCHEMA-001: accepts valid schema and normalizes indices array to object", () => {
    const input = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "label", type: "string", required: true }],
          indices: ["label"],
        },
      ],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "label", type: "string", required: true }],
            indices: { base: ["label"], search: [], vector: [] },
          },
        ],
        relations: [],
      });
    }
  });

  // TV-SCHEMA-002: Invalid schema (missing resources)
  it("TV-SCHEMA-002: rejects schema missing resources", () => {
    const input = { relations: [] };

    const result = validateSchema(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toBe("Invalid schema: missing resources");
      expect(result.error.details).toEqual({ path: "resources" });
    }
  });

  // Additional validation tests
  it("rejects duplicate resource names", () => {
    const input = {
      resources: [
        { name: "task", version: 1, fields: [] },
        { name: "task", version: 2, fields: [] },
      ],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toContain("duplicate resource name");
    }
  });

  it("rejects duplicate field names within a resource", () => {
    const input = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [
            { name: "label", type: "string", required: true },
            { name: "label", type: "string", required: false },
          ],
        },
      ],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toContain("duplicate field name");
    }
  });

  it("validates version is an integer", () => {
    const input = {
      resources: [{ name: "task", version: 1.5, fields: [] }],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toContain("version must be integer");
    }
  });

  it("normalizes indices object format", () => {
    const input = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [],
          indices: { base: ["id"], search: ["label"], vector: [] },
        },
      ],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.resources[0].indices).toEqual({
        base: ["id"],
        search: ["label"],
        vector: [],
      });
    }
  });

  it("defaults missing relations to empty array", () => {
    const input = {
      resources: [{ name: "task", version: 1, fields: [] }],
    };

    const result = validateSchema(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.relations).toEqual([]);
    }
  });
});
