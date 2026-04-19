/**
 * Schema validation tests
 * Tests TV-SCHEMA-001, TV-SCHEMA-002, TV-NS-004, TV-NS-005, TV-NS-006 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { validateSchema, isNamespaced } from "../src/schema.js";

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
        namespaced: true,
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
          fields: [
            { name: "id", type: "string", required: true },
            { name: "label", type: "string", required: true },
          ],
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

describe("validateSchema — relation from/to resource validation (CLI-004)", () => {
  it("rejects relation.from referencing an unknown resource", () => {
    const input = {
      resources: [{ name: "task", version: 1, fields: [] }],
      relations: [{ type: "one-many", from: "nonexistent", to: "task" }],
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toContain("nonexistent");
      expect(result.error.details.path).toBe("relations.from");
    }
  });

  it("rejects relation.to referencing an unknown resource", () => {
    const input = {
      resources: [{ name: "task", version: 1, fields: [] }],
      relations: [{ type: "one-many", from: "task", to: "nonexistent" }],
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.message).toContain("nonexistent");
      expect(result.error.details.path).toBe("relations.to");
    }
  });

  it("accepts relation where both from and to reference valid resources", () => {
    const input = {
      resources: [
        { name: "task", version: 1, fields: [] },
        { name: "tag", version: 1, fields: [] },
      ],
      relations: [{ type: "many-many", from: "task", to: "tag", relation: "tags" }],
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(true);
  });

  it("rejects relation.from array that contains an unknown resource", () => {
    const input = {
      resources: [{ name: "task", version: 1, fields: [] }],
      relations: [
        { type: "many-many", from: ["task", "ghost"], to: "task", relation: "rel" },
      ],
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("ghost");
      expect(result.error.details.path).toBe("relations.from");
    }
  });

  it("includes list of available resources in the error message", () => {
    const input = {
      resources: [
        { name: "task", version: 1, fields: [] },
        { name: "comment", version: 1, fields: [] },
      ],
      relations: [{ type: "one-many", from: "task", to: "missing" }],
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Available: task, comment');
    }
  });

  it("normalizes legacy field shorthands and still rejects invalid types", () => {
    const missingRequired = validateSchema({
      resources: [{ name: "task", version: 1, fields: [{ name: "title", type: "string" }] }],
    });
    expect(missingRequired.ok).toBe(true);
    if (missingRequired.ok) {
      expect(missingRequired.result.resources[0]?.fields).toEqual([
        { name: "title", type: "string", required: false },
      ]);
    }

    const legacyIdAlias = validateSchema({
      resources: [{ name: "task", version: 1, fields: [{ name: "id", type: "id" }] }],
    });
    expect(legacyIdAlias.ok).toBe(true);
    if (legacyIdAlias.ok) {
      expect(legacyIdAlias.result.resources[0]?.fields).toEqual([
        { name: "id", type: "string", required: true },
      ]);
    }

    const invalidType = validateSchema({
      resources: [{ name: "task", version: 1, fields: [{ name: "title", type: "wat", required: true }] }],
    });
    expect(invalidType.ok).toBe(false);
  });

  it("rejects invalid relation endpoint shapes", () => {
    const result = validateSchema({
      resources: [{ name: "task", version: 1, fields: [] }],
      relations: [{ from: 123, to: "task", type: "one-many" }],
    });
    expect(result.ok).toBe(false);
  });

  it("returns normalized relation capabilities", () => {
    const result = validateSchema({
      resources: [
        { name: "task", version: 1, fields: [] },
        { name: "tag", version: 1, fields: [] },
      ],
      relations: [
        {
          from: "task",
          to: "tag",
          type: "many-many",
          relation: "tags",
          capabilities: ["audit", "timestamps", "audit"],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.relations?.[0]?.capabilities).toEqual(["timestamps", "audit"]);
    }
  });

  it("rejects non-array index buckets without throwing", () => {
    const result = validateSchema({
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "id", type: "string", required: true }],
          indices: { base: "id" },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });
});

describe("validateSchema — namespaced field (TV-NS-004, TV-NS-005, TV-NS-006)", () => {
  const baseResource = { name: "todos", version: 1, fields: [{ name: "title", type: "string", required: true }] };

  // TV-NS-004: namespaced: true
  it("TV-NS-004: accepts schema with namespaced: true", () => {
    const result = validateSchema({ resources: [baseResource], namespaced: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.namespaced).toBe(true);
    }
  });

  // TV-NS-005: namespaced: false
  it("TV-NS-005: accepts schema with namespaced: false", () => {
    const result = validateSchema({ resources: [baseResource], namespaced: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.namespaced).toBe(false);
    }
  });

  it("defaults to namespaced: true when neither field is set", () => {
    const result = validateSchema({ resources: [baseResource] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.namespaced).toBe(true);
    }
  });
});

describe("isNamespaced() helper", () => {
  it("returns true when namespaced is true", () => {
    expect(isNamespaced({ resources: [], namespaced: true })).toBe(true);
  });

  it("returns false when namespaced is false", () => {
    expect(isNamespaced({ resources: [], namespaced: false })).toBe(false);
  });

  it("defaults to true when namespaced is not set", () => {
    expect(isNamespaced({ resources: [] })).toBe(true);
  });
});
