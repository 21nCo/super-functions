/**
 * Unit tests for DFQL-to-Adapter conversion utilities (Phase 00)
 *
 * Test vectors covered:
 *   TV-CONVERT-001 — Simple equality shorthand
 *   TV-CONVERT-002 — Multiple operator conversion ($gte, $ne)
 *   TV-CONVERT-003 — $and flattening
 *   TV-CONVERT-004 — Unpushable filters ($or, relation quantifiers)
 *   TV-SORT-001    — DFQL sort to OrderBy[]
 *
 * Additional edge-case coverage:
 *   non-$-prefixed operators (eq, ne, gte, …)
 *   dot-path keys → null
 *   like / ilike operators
 *   extractPushableFilters partial extraction (SCALE-004 mode)
 *   convertDfqlSort default id:asc
 */

import { describe, it, expect } from "vitest";
import {
  convertDfqlFilters,
  extractPushableFilters,
  convertDfqlSort,
  classifyQuery,
} from "../src/execution/query/planner.js";

const polymorphicCollectionSchema = {
  resources: [
    { name: "collection", fields: [{ name: "label", type: "string" }] },
    { name: "node", fields: [{ name: "label", type: "string" }] },
    { name: "objective", fields: [{ name: "label", type: "string" }] },
  ],
  relations: [
    {
      from: ["node", "objective"],
      to: "collection",
      relation: "collections",
      inverse: "items",
      type: "many-many",
    },
  ],
};

// ---------------------------------------------------------------------------
// convertDfqlFilters
// ---------------------------------------------------------------------------

describe("convertDfqlFilters", () => {
  // TV-CONVERT-001: Simple equality shorthand
  it("TV-CONVERT-001: shorthand equality { status: 'active' } → eq clause", () => {
    const result = convertDfqlFilters({ status: "active" });
    expect(result).toEqual([
      { field: "status", operator: "eq", value: "active" },
    ]);
  });

  // TV-CONVERT-002: Multiple operator conversion
  it("TV-CONVERT-002: $gte and $ne operators are converted correctly", () => {
    const result = convertDfqlFilters({
      priority: { $gte: 3 },
      status: { $ne: "done" },
    });
    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.arrayContaining([
        { field: "priority", operator: "gte", value: 3 },
        { field: "status", operator: "ne", value: "done" },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  // TV-CONVERT-003: $and flattening
  it("TV-CONVERT-003: $and sub-filters are flattened into a single array", () => {
    const result = convertDfqlFilters({
      $and: [{ status: "active" }, { priority: { $gt: 1 } }],
    });
    expect(result).toEqual([
      { field: "status", operator: "eq", value: "active" },
      { field: "priority", operator: "gt", value: 1 },
    ]);
  });

  // TV-CONVERT-004a: $or → null
  it("TV-CONVERT-004: $or filter returns null (cannot push down)", () => {
    const result = convertDfqlFilters({
      $or: [{ status: "active" }, { status: "pending" }],
    });
    expect(result).toBeNull();
  });

  // TV-CONVERT-004b: relation quantifier → null
  it("TV-CONVERT-004: relation quantifier $any returns null", () => {
    const result = convertDfqlFilters({
      tags: { $any: { label: { $eq: "urgent" } } },
    });
    expect(result).toBeNull();
  });

  it("relation quantifier $all returns null", () => {
    const result = convertDfqlFilters({
      tasks: { $all: { status: "active" } },
    });
    expect(result).toBeNull();
  });

  it("relation quantifier $none returns null", () => {
    const result = convertDfqlFilters({
      comments: { $none: { spam: true } },
    });
    expect(result).toBeNull();
  });

  // Dot-path filter → null
  it("dot-path key 'goal.label' returns null (cannot push down)", () => {
    const result = convertDfqlFilters({ "goal.label": "G1" });
    expect(result).toBeNull();
  });

  // Non-$-prefixed operators
  it("non-$-prefixed operators (eq, ne, gt, gte, lt, lte, in) are accepted", () => {
    const result = convertDfqlFilters({
      status: { eq: "active" },
      priority: { gte: 2, lte: 10 },
    });
    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.arrayContaining([
        { field: "status", operator: "eq", value: "active" },
        { field: "priority", operator: "gte", value: 2 },
        { field: "priority", operator: "lte", value: 10 },
      ]),
    );
  });

  // $in operator
  it("$in operator is converted to 'in'", () => {
    const result = convertDfqlFilters({ status: { $in: ["active", "pending"] } });
    expect(result).toEqual([
      { field: "status", operator: "in", value: ["active", "pending"] },
    ]);
  });

  it("$is_null operator is converted to null equality", () => {
    const result = convertDfqlFilters({ trashedAt: { $is_null: true } });
    expect(result).toEqual([
      { field: "trashedAt", operator: "eq", value: null },
    ]);
  });

  it("$is_empty remains in-memory because empty semantics are field-type dependent", () => {
    const result = convertDfqlFilters({ title: { $is_empty: true } });
    expect(result).toBeNull();
  });

  // $like / $ilike operators
  it("$like operator is converted to 'like'", () => {
    const result = convertDfqlFilters({ name: { $like: "%foo%" } });
    expect(result).toEqual([{ field: "name", operator: "like", value: "%foo%" }]);
  });

  it("$ilike operator is converted to 'ilike'", () => {
    const result = convertDfqlFilters({ name: { $ilike: "%FOO%" } });
    expect(result).toEqual([
      { field: "name", operator: "ilike", value: "%FOO%" },
    ]);
  });

  // Unknown operator → null
  it("unknown operator $fuzzy returns null", () => {
    const result = convertDfqlFilters({ name: { $fuzzy: "foo" } });
    expect(result).toBeNull();
  });

  // Empty filter object → empty array (not null)
  it("empty filter object returns empty array", () => {
    const result = convertDfqlFilters({});
    expect(result).toEqual([]);
  });

  // Numeric shorthand equality
  it("shorthand equality with numeric value", () => {
    const result = convertDfqlFilters({ priority: 5 });
    expect(result).toEqual([{ field: "priority", operator: "eq", value: 5 }]);
  });

  // Null shorthand equality
  it("shorthand equality with null value", () => {
    const result = convertDfqlFilters({ deletedAt: null });
    expect(result).toEqual([{ field: "deletedAt", operator: "eq", value: null }]);
  });

  // Array shorthand equality (arrays treated as scalar, not operator object)
  it("array value treated as shorthand equality", () => {
    const result = convertDfqlFilters({ ids: ["a", "b"] });
    expect(result).toEqual([{ field: "ids", operator: "eq", value: ["a", "b"] }]);
  });

  // Schema-based relation detection
  it("schema-based relation key returns null", () => {
    const schema = {
      relations: [
        { from: "task", to: "tag", relation: "tags", inverse: "tasks" },
      ],
    };
    // "tags" is a relation on "task" — should not be pushable
    const result = convertDfqlFilters({ tags: { eq: "urgent" } }, "task", schema);
    expect(result).toBeNull();
  });

  it("schema-based: non-relation key with schema passes through", () => {
    const schema = {
      relations: [
        { from: "task", to: "tag", relation: "tags", inverse: "tasks" },
      ],
    };
    // "status" is not a relation — should be pushable
    const result = convertDfqlFilters(
      { status: "active" },
      "task",
      schema,
    );
    expect(result).toEqual([{ field: "status", operator: "eq", value: "active" }]);
  });

  // $and containing an unpushable sub-filter → null
  it("$and with unpushable sub-filter returns null", () => {
    const result = convertDfqlFilters({
      $and: [
        { status: "active" },
        { $or: [{ priority: { $gt: 1 } }, { priority: { $lt: 5 } }] },
      ],
    });
    expect(result).toBeNull();
  });

  // All $-prefixed operators
  it("all comparison operators: $eq $ne $gt $gte $lt $lte", () => {
    const result = convertDfqlFilters({
      a: { $eq: 1 },
      b: { $ne: 2 },
      c: { $gt: 3 },
      d: { $gte: 4 },
      e: { $lt: 5 },
      f: { $lte: 6 },
    });
    expect(result).toEqual([
      { field: "a", operator: "eq", value: 1 },
      { field: "b", operator: "ne", value: 2 },
      { field: "c", operator: "gt", value: 3 },
      { field: "d", operator: "gte", value: 4 },
      { field: "e", operator: "lt", value: 5 },
      { field: "f", operator: "lte", value: 6 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// extractPushableFilters
// ---------------------------------------------------------------------------

describe("extractPushableFilters", () => {
  it("all pushable: remaining is null", () => {
    const { pushable, remaining } = extractPushableFilters({
      status: "active",
      priority: { $gte: 3 },
    });
    expect(pushable).toEqual([
      { field: "status", operator: "eq", value: "active" },
      { field: "priority", operator: "gte", value: 3 },
    ]);
    expect(remaining).toBeNull();
  });

  it("mixed: separates pushable base-field from relation quantifier", () => {
    const { pushable, remaining } = extractPushableFilters({
      status: { $eq: "active" },
      tags: { $any: { label: { $eq: "urgent" } } },
    });
    expect(pushable).toEqual([
      { field: "status", operator: "eq", value: "active" },
    ]);
    expect(remaining).toEqual({
      tags: { $any: { label: { $eq: "urgent" } } },
    });
  });

  it("$or stays in remaining", () => {
    const { pushable, remaining } = extractPushableFilters({
      $or: [{ status: "active" }, { status: "pending" }],
      priority: 1,
    });
    expect(pushable).toEqual([{ field: "priority", operator: "eq", value: 1 }]);
    expect(remaining).toEqual({
      $or: [{ status: "active" }, { status: "pending" }],
    });
  });

  it("dot-path stays in remaining", () => {
    const { pushable, remaining } = extractPushableFilters({
      "goal.label": "G1",
      status: "active",
    });
    expect(pushable).toEqual([
      { field: "status", operator: "eq", value: "active" },
    ]);
    expect(remaining).toEqual({ "goal.label": "G1" });
  });

  it("$and: splits pushable sub-filters from unpushable ones", () => {
    const { pushable, remaining } = extractPushableFilters({
      $and: [
        { status: "active" },
        { tags: { $any: { label: "urgent" } } },
      ],
    });
    expect(pushable).toEqual([
      { field: "status", operator: "eq", value: "active" },
    ]);
    expect(remaining).toEqual({
      $and: [{ tags: { $any: { label: "urgent" } } }],
    });
  });

  it("empty filter: pushable is empty, remaining is null", () => {
    const { pushable, remaining } = extractPushableFilters({});
    expect(pushable).toEqual([]);
    expect(remaining).toBeNull();
  });

  it("TV-INMEM-001: base-field status pushed, relation filter remains", () => {
    // Mirrors TV-INMEM-001 from TEST_VECTORS.md
    const { pushable, remaining } = extractPushableFilters(
      {
        status: { $eq: "active" },
        tags: { $any: { label: { $eq: "urgent" } } },
      },
      "task",
    );
    expect(pushable).toEqual([
      { field: "status", operator: "eq", value: "active" },
    ]);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveProperty("tags");
  });
});

// ---------------------------------------------------------------------------
// convertDfqlSort
// ---------------------------------------------------------------------------

describe("convertDfqlSort", () => {
  // TV-SORT-001
  it("TV-SORT-001: DFQL sort strings converted to OrderBy[]", () => {
    const result = convertDfqlSort(["name:asc", "-priority", "id"]);
    expect(result).toEqual([
      { field: "name", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "id", direction: "asc" },
    ]);
  });

  it("undefined sort defaults to [{ field: 'id', direction: 'asc' }]", () => {
    const result = convertDfqlSort(undefined);
    expect(result).toEqual([{ field: "id", direction: "asc" }]);
  });

  it("empty array defaults to [{ field: 'id', direction: 'asc' }]", () => {
    const result = convertDfqlSort([]);
    expect(result).toEqual([{ field: "id", direction: "asc" }]);
  });

  it("field:desc syntax", () => {
    const result = convertDfqlSort(["createdAt:desc"]);
    expect(result).toEqual([{ field: "createdAt", direction: "desc" }]);
  });

  it("bare field name defaults to asc", () => {
    const result = convertDfqlSort(["title"]);
    expect(result).toEqual([{ field: "title", direction: "asc" }]);
  });

  it("multiple terms preserve order", () => {
    const result = convertDfqlSort(["priority:desc", "id:asc"]);
    expect(result).toEqual([
      { field: "priority", direction: "desc" },
      { field: "id", direction: "asc" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// classifyQuery
// ---------------------------------------------------------------------------

// Schema fixture used in TV-PLAN-001
const taskSchema = {
  resources: [
    {
      name: "task",
      fields: [
        { name: "title", type: "string" },
        { name: "status", type: "string" },
        { name: "priority", type: "number" },
      ],
    },
    { name: "tag", fields: [{ name: "label", type: "string" }] },
    { name: "category", fields: [{ name: "name", type: "string" }] },
    {
      name: "goal",
      fields: [
        { name: "label", type: "string" },
        { name: "parentPath", type: "string" },
      ],
    },
  ],
  relations: [
    {
      from: "task",
      to: "tag",
      relation: "tags",
      inverse: "tasks",
      type: "many-many",
    },
    {
      from: "task",
      to: "category",
      relation: "category",
      inverse: "tasks",
      type: "many-one",
    },
    {
      from: "task",
      to: "goal",
      relation: "goal",
      inverse: "tasks",
      type: "many-one",
    },
  ],
};

describe("classifyQuery", () => {
  // TV-PLAN-001: Simple query → FULL_PUSHDOWN
  it("TV-PLAN-001: base-field filters + scalar select → FULL_PUSHDOWN", () => {
    const strategy = classifyQuery(
      {
        resource: "task",
        filters: { status: { $eq: "active" } },
        sort: ["priority:desc", "id:asc"],
        limit: 10,
        select: ["id", "title", "status", "priority"],
      },
      taskSchema,
    );
    expect(strategy).toBe("FULL_PUSHDOWN");
  });

  // TV-PLAN-002: Relation select → PARTIAL_PUSHDOWN
  it("TV-PLAN-002: relation select token tags.* → PARTIAL_PUSHDOWN", () => {
    const strategy = classifyQuery({
      resource: "task",
      filters: { status: { $eq: "active" } },
      select: ["id", "title", "tags.*"],
      limit: 10,
    });
    expect(strategy).toBe("PARTIAL_PUSHDOWN");
  });

  // TV-PLAN-003: Relation filter → IN_MEMORY
  it("TV-PLAN-003: $any relation quantifier → IN_MEMORY", () => {
    const strategy = classifyQuery({
      resource: "task",
      filters: { tags: { $any: { label: { $eq: "urgent" } } } },
      limit: 10,
    });
    expect(strategy).toBe("IN_MEMORY");
  });

  // TV-PLAN-004: GroupBy → IN_MEMORY
  it("TV-PLAN-004: groupBy → IN_MEMORY", () => {
    const strategy = classifyQuery({
      resource: "task",
      groupBy: ["status"],
      aggregations: { count: { op: "count", field: "*" } },
    });
    expect(strategy).toBe("IN_MEMORY");
  });

  // Edge cases
  it("select: ['*'] with no relation tokens → FULL_PUSHDOWN", () => {
    expect(classifyQuery({ resource: "task", select: ["*"] }, taskSchema)).toBe(
      "FULL_PUSHDOWN",
    );
  });

  it("select: ['id', 'title'] → FULL_PUSHDOWN", () => {
    expect(
      classifyQuery({ resource: "task", select: ["id", "title"] }, taskSchema),
    ).toBe("FULL_PUSHDOWN");
  });

  it("count: true only → FULL_PUSHDOWN", () => {
    expect(classifyQuery({ resource: "task", count: true }, taskSchema)).toBe(
      "FULL_PUSHDOWN",
    );
  });

  it("having present → IN_MEMORY", () => {
    expect(
      classifyQuery({
        resource: "task",
        having: { count: { $gte: 5 } },
      }),
    ).toBe("IN_MEMORY");
  });

  it("search present → IN_MEMORY", () => {
    expect(
      classifyQuery({
        resource: "task",
        search: { query: "hello", type: "fullText" },
      }),
    ).toBe("IN_MEMORY");
  });

  it("$all relation quantifier → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "task", filters: { tags: { $all: { label: "urgent" } } } }),
    ).toBe("IN_MEMORY");
  });

  it("$none relation quantifier → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "task", filters: { tags: { $none: { label: "spam" } } } }),
    ).toBe("IN_MEMORY");
  });

  it("dot-path filter key 'goal.label' → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "task", filters: { "goal.label": "G1" } }),
    ).toBe("IN_MEMORY");
  });

  it("HTREE parent.* select → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "goal", select: ["id", "parent.*"] }),
    ).toBe("IN_MEMORY");
  });

  it("HTREE children.* select → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "goal", select: ["id", "children.*"] }),
    ).toBe("IN_MEMORY");
  });

  it("HTREE children.** select → IN_MEMORY", () => {
    expect(
      classifyQuery({ resource: "goal", select: ["id", "children.**"] }),
    ).toBe("IN_MEMORY");
  });

  it("category.* relation select → PARTIAL_PUSHDOWN", () => {
    expect(
      classifyQuery({ resource: "task", select: ["id", "category.*"] }),
    ).toBe("PARTIAL_PUSHDOWN");
  });

  it("nested traversal tasks.tags.* → PARTIAL_PUSHDOWN", () => {
    expect(
      classifyQuery({ resource: "project", select: ["id", "tasks.tags.*"] }),
    ).toBe("PARTIAL_PUSHDOWN");
  });

  it("bare relation name 'tags' with schema → PARTIAL_PUSHDOWN", () => {
    expect(
      classifyQuery({ resource: "task", select: ["id", "tags"] }, taskSchema),
    ).toBe("PARTIAL_PUSHDOWN");
  });

  it("bare inverse polymorphic relation name with schema → PARTIAL_PUSHDOWN", () => {
    expect(
      classifyQuery(
        { resource: "collection", select: ["id", "items"] },
        polymorphicCollectionSchema,
      ),
    ).toBe("PARTIAL_PUSHDOWN");
  });

  it("bare relation name 'tags' without schema → FULL_PUSHDOWN (can't detect)", () => {
    // Without schema, a bare 'tags' token looks like a field
    expect(
      classifyQuery({ resource: "task", select: ["id", "tags"] }),
    ).toBe("FULL_PUSHDOWN");
  });

  it("$any inside $and → IN_MEMORY", () => {
    expect(
      classifyQuery({
        resource: "task",
        filters: {
          $and: [
            { status: "active" },
            { tags: { $any: { label: "urgent" } } },
          ],
        },
      }),
    ).toBe("IN_MEMORY");
  });

  it("$or filters → IN_MEMORY", () => {
    expect(
      classifyQuery({
        resource: "task",
        filters: {
          $or: [{ status: "active" }, { status: "pending" }],
        },
      }),
    ).toBe("IN_MEMORY");
  });

  it("no select, no filters → FULL_PUSHDOWN", () => {
    expect(classifyQuery({ resource: "task" })).toBe("FULL_PUSHDOWN");
  });

  it("select with mixed scalar + relation → PARTIAL_PUSHDOWN (first relation wins)", () => {
    expect(
      classifyQuery(
        { resource: "task", select: ["id", "title", "tags.*", "status"] },
        taskSchema,
      ),
    ).toBe("PARTIAL_PUSHDOWN");
  });
});
