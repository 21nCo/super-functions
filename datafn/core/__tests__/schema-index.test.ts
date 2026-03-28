/**
 * Schema index tests
 * Tests TV-IDX-001, TV-IDX-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import {
  buildSchemaIndex,
  getResource,
  getField,
  getRelationsFrom,
  getRelation,
  getRelationTarget,
  findRelationBidirectional,
} from "../src/schema-index.js";

const multiResourceSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "done", type: "boolean" as const, required: true },
      ],
    },
    {
      name: "tags",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: true }],
    },
  ],
  relations: [
    { from: "todos", to: "tags", type: "many-many" as const, relation: "tags" },
  ],
};

describe("buildSchemaIndex", () => {
  it("TV-IDX-001: builds a non-null index from multi-resource schema", () => {
    const index = buildSchemaIndex(multiResourceSchema);
    expect(index).toBeDefined();
    expect(index.resourcesByName).toBeInstanceOf(Map);
    expect(index.fieldsByResource).toBeInstanceOf(Map);
    expect(index.relationsByResource).toBeInstanceOf(Map);
    expect(index.relationsFromResource).toBeInstanceOf(Map);
  });

  it("TV-IDX-001 (negative): empty schema returns empty maps", () => {
    const index = buildSchemaIndex({ resources: [] });
    expect(index.resourcesByName.size).toBe(0);
    expect(index.fieldsByResource.size).toBe(0);
    expect(index.relationsFromResource.size).toBe(0);
  });
});

describe("getResource", () => {
  const index = buildSchemaIndex(multiResourceSchema);

  it("TV-IDX-001: returns resource for known name", () => {
    expect(getResource(index, "todos")?.name).toBe("todos");
    expect(getResource(index, "tags")?.name).toBe("tags");
  });

  it("TV-IDX-001: returns undefined for unknown name", () => {
    expect(getResource(index, "nonexistent")).toBeUndefined();
  });
});

describe("getField", () => {
  const index = buildSchemaIndex(multiResourceSchema);

  it("TV-IDX-001: returns field schema for known resource and field", () => {
    expect(getField(index, "todos", "title")?.type).toBe("string");
    expect(getField(index, "todos", "done")?.type).toBe("boolean");
  });

  it("TV-IDX-001: returns undefined for unknown field", () => {
    expect(getField(index, "todos", "nonexistent")).toBeUndefined();
  });

  it("TV-IDX-001: returns undefined for unknown resource", () => {
    expect(getField(index, "nonexistent", "title")).toBeUndefined();
  });
});

describe("getRelationsFrom", () => {
  const index = buildSchemaIndex(multiResourceSchema);

  it("TV-IDX-001: returns relations for from-resource", () => {
    const relations = getRelationsFrom(index, "todos");
    expect(relations).toHaveLength(1);
    expect(relations[0].relation).toBe("tags");
  });

  it("TV-IDX-001: returns empty array for resource with no outgoing relations", () => {
    expect(getRelationsFrom(index, "tags")).toHaveLength(0);
  });

  it("returns empty array for unknown resource", () => {
    expect(getRelationsFrom(index, "unknown")).toHaveLength(0);
  });
});

describe("getRelation", () => {
  const index = buildSchemaIndex(multiResourceSchema);

  it("TV-IDX-001: returns relation by from-resource and name", () => {
    const rel = getRelation(index, "todos", "tags");
    expect(rel?.to).toBe("tags");
  });

  it("TV-IDX-001: returns undefined for unknown relation name", () => {
    expect(getRelation(index, "todos", "nonexistent")).toBeUndefined();
  });
});

describe("getRelationTarget", () => {
  it("TV-IDX-001: returns to resource name for string to", () => {
    const rel = multiResourceSchema.relations[0];
    expect(getRelationTarget(rel)).toBe("tags");
  });

  it("TV-IDX-002: returns first element for array to", () => {
    const rel = { from: ["a", "b"], to: ["c", "d"], type: "many-many" as const, relation: "linked" };
    expect(getRelationTarget(rel)).toBe("c");
  });
});

describe("TV-IDX-002: array from/to relations", () => {
  const schemaWithArrayFrom = {
    resources: [
      { name: "a", version: 1, fields: [] },
      { name: "b", version: 1, fields: [] },
      { name: "c", version: 1, fields: [] },
    ],
    relations: [
      { from: ["a", "b"], to: ["c"], type: "many-many" as const, relation: "linked" },
    ],
  };

  it("indexes array from relations under each from-resource", () => {
    const index = buildSchemaIndex(schemaWithArrayFrom);
    expect(getRelationsFrom(index, "a")).toHaveLength(1);
    expect(getRelationsFrom(index, "b")).toHaveLength(1);
  });

  it("getRelationTarget returns first element of array to", () => {
    expect(getRelationTarget(schemaWithArrayFrom.relations[0])).toBe("c");
  });

  it("finds array-based relations in either direction", () => {
    expect(findRelationBidirectional(schemaWithArrayFrom, "a", "linked")).toBeDefined();

    const inverseSchema = {
      ...schemaWithArrayFrom,
      relations: [
        {
          from: ["a", "b"],
          to: ["c"],
          type: "many-many" as const,
          relation: "linked",
          inverse: "linkedBy",
        },
      ],
    };

    expect(findRelationBidirectional(inverseSchema, "c", "linkedBy")).toBeDefined();
  });
});
