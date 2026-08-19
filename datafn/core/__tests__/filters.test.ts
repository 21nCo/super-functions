/**
 * Filter evaluation tests
 * Tests TV-FLT-001 through TV-FLT-006 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { evaluateFilter, normalizeFilterOps } from "../src/filters.js";

describe("evaluateFilter — comparison operators (TV-FLT-001)", () => {
  const record = { name: "Alice", age: 30, score: 85.5 };

  it("$eq match", () => expect(evaluateFilter(record, { name: { $eq: "Alice" } })).toBe(true));
  it("$eq no match", () => expect(evaluateFilter(record, { name: { $eq: "Bob" } })).toBe(false));
  it("$ne", () => expect(evaluateFilter(record, { name: { $ne: "Bob" } })).toBe(true));
  it("$gt true", () => expect(evaluateFilter(record, { age: { $gt: 25 } })).toBe(true));
  it("$gt false", () => expect(evaluateFilter(record, { age: { $gt: 30 } })).toBe(false));
  it("$gte", () => expect(evaluateFilter(record, { age: { $gte: 30 } })).toBe(true));
  it("$lt", () => expect(evaluateFilter(record, { age: { $lt: 35 } })).toBe(true));
  it("$lte true", () => expect(evaluateFilter(record, { age: { $lte: 30 } })).toBe(true));
  it("$lte false", () => expect(evaluateFilter(record, { age: { $lte: 29 } })).toBe(false));

  it("unsupported operator throws DFQL_UNSUPPORTED", () => {
    expect(() => evaluateFilter(record, { age: { $foobar: 10 } })).toThrow();
  });
});

describe("evaluateFilter — set operators (TV-FLT-002)", () => {
  const record = { status: "active", role: "admin" };

  it("$in match", () => expect(evaluateFilter(record, { status: { $in: ["active", "pending"] } })).toBe(true));
  it("$in no match", () => expect(evaluateFilter(record, { status: { $in: ["deleted", "pending"] } })).toBe(false));
  it("$nin match", () => expect(evaluateFilter(record, { role: { $nin: ["user", "guest"] } })).toBe(true));
  it("$nin no match", () => expect(evaluateFilter(record, { role: { $nin: ["admin", "user"] } })).toBe(false));

  it("$in with non-array throws", () => {
    expect(() => evaluateFilter(record, { status: { $in: "not-an-array" } })).toThrow();
  });
});

describe("evaluateFilter — string operators (TV-FLT-003)", () => {
  const record = { name: "Alice Johnson", email: "alice@example.com" };

  it("$contains string", () => expect(evaluateFilter(record, { name: { $contains: "Johnson" } })).toBe(true));
  it("$contains no match", () => expect(evaluateFilter(record, { name: { $contains: "Bob" } })).toBe(false));
  it("$startsWith", () => expect(evaluateFilter(record, { name: { $startsWith: "Alice" } })).toBe(true));
  it("$endsWith", () => expect(evaluateFilter(record, { name: { $endsWith: "Johnson" } })).toBe(true));
  it("$like case-sensitive", () => expect(evaluateFilter(record, { name: { $like: "Alice%" } })).toBe(true));
  it("$ilike case-insensitive", () => expect(evaluateFilter(record, { name: { $ilike: "alice%" } })).toBe(true));
  it("$like is case-sensitive (no match)", () => expect(evaluateFilter(record, { name: { $like: "alice%" } })).toBe(false));
  it("$not_like", () => expect(evaluateFilter(record, { name: { $not_like: "Bob%" } })).toBe(true));
  it("$not_ilike", () => expect(evaluateFilter(record, { name: { $not_ilike: "bob%" } })).toBe(true));
  it("$not_like treats non-string values as non-matches", () =>
    expect(evaluateFilter({ count: 42 }, { count: { $not_like: "4%" } })).toBe(true));
  it("normalizeFilterOps remaps contains family operators", () =>
    expect(normalizeFilterOps({ name: { contains: "Ali", startsWith: "A", endsWith: "n" } })).toEqual({
      name: { $contains: "Ali", $startsWith: "A", $endsWith: "n" },
    }));
  it("normalizeFilterOps strips undefined filters and operators", () =>
    expect(
      normalizeFilterOps({
        isArchived: undefined,
        status: { eq: "active", ne: undefined },
        dateUnix: undefined,
      }),
    ).toEqual({
      status: { $eq: "active" },
    }));
});

describe("evaluateFilter — null/empty/range operators (TV-FLT-004)", () => {
  const record1 = { name: null, tags: [], age: 25 };
  const record2 = { name: "Alice", tags: ["urgent"], age: 25 };

  it("$is_null true", () => expect(evaluateFilter(record1, { name: { $is_null: true } })).toBe(true));
  it("$is_null false", () => expect(evaluateFilter(record2, { name: { $is_null: true } })).toBe(false));
  it("$is_not_null", () => expect(evaluateFilter(record2, { name: { $is_not_null: true } })).toBe(true));
  it("$is_empty array", () => expect(evaluateFilter(record1, { tags: { $is_empty: true } })).toBe(true));
  it("$is_not_empty", () => expect(evaluateFilter(record2, { tags: { $is_not_empty: true } })).toBe(true));
  it("$between in range", () => expect(evaluateFilter(record1, { age: { $between: [20, 30] } })).toBe(true));
  it("$between out of range", () => expect(evaluateFilter(record1, { age: { $between: [30, 40] } })).toBe(false));
  it("$not_between", () => expect(evaluateFilter(record1, { age: { $not_between: [30, 40] } })).toBe(true));
  it("$before", () => expect(evaluateFilter(record1, { age: { $before: 30 } })).toBe(true));
  it("$after", () => expect(evaluateFilter(record1, { age: { $after: 20 } })).toBe(true));
});

describe("evaluateFilter — logical operators (TV-FLT-005)", () => {
  const record = { age: 30, status: "active" };

  it("$and all true", () => expect(evaluateFilter(record, { $and: [{ age: { $gt: 20 } }, { status: { $eq: "active" } }] })).toBe(true));
  it("$and one false", () => expect(evaluateFilter(record, { $and: [{ age: { $gt: 40 } }, { status: { $eq: "active" } }] })).toBe(false));
  it("$or one true", () => expect(evaluateFilter(record, { $or: [{ age: { $gt: 40 } }, { status: { $eq: "active" } }] })).toBe(true));
  it("$or all false", () => expect(evaluateFilter(record, { $or: [{ age: { $gt: 40 } }, { status: { $eq: "deleted" } }] })).toBe(false));
});

describe("evaluateFilter — dot-path nested objects (TV-FLT-006)", () => {
  const record = { id: "1", meta: { color: "red", priority: 5 } };

  it("nested path match", () => expect(evaluateFilter(record, { "meta.color": { $eq: "red" } })).toBe(true));
  it("nested path number", () => expect(evaluateFilter(record, { "meta.priority": { $gt: 3 } })).toBe(true));
  it("nested path not found → false", () => expect(evaluateFilter(record, { "meta.nonexistent": { $eq: "x" } })).toBe(false));
});

describe("evaluateFilter — direct equality (no operator)", () => {
  it("direct string equality", () => expect(evaluateFilter({ name: "Alice" }, { name: "Alice" })).toBe(true));
  it("direct equality mismatch", () => expect(evaluateFilter({ name: "Alice" }, { name: "Bob" })).toBe(false));
});

describe("evaluateFilter — $contains on array", () => {
  it("array contains", () => expect(evaluateFilter({ tags: ["a", "b"] }, { tags: { $contains: "a" } })).toBe(true));
  it("array does not contain", () => expect(evaluateFilter({ tags: ["a", "b"] }, { tags: { $contains: "c" } })).toBe(false));
});

describe("evaluateFilter — depth limit (CLI-009)", () => {
  const record = { age: 30 };

  /** Build a filter with n levels of $and wrapping a leaf `{ age: { $gt: 20 } }`. */
  function nestFilter(depth: number): Record<string, unknown> {
    let filter: Record<string, unknown> = { age: { $gt: 20 } };
    for (let i = 0; i < depth; i++) {
      filter = { $and: [filter] };
    }
    return filter;
  }

  it("nesting depth at MAX_FILTER_DEPTH (10 $and wrappers) is accepted", () => {
    expect(() => evaluateFilter(record, nestFilter(10))).not.toThrow();
    expect(evaluateFilter(record, nestFilter(10))).toBe(true);
  });

  it("nesting depth above MAX_FILTER_DEPTH (11 $and wrappers) throws DFQL_INVALID", () => {
    let caught: any;
    try {
      evaluateFilter(record, nestFilter(11));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught?.code).toBe("DFQL_INVALID");
    expect(caught?.message).toContain("depth");
  });

  it("a shallow filter (depth 1) is unaffected by the limit", () => {
    expect(() => evaluateFilter(record, nestFilter(1))).not.toThrow();
  });
});

describe("evaluateFilter — relation resolver", () => {
  const record = { id: "1", title: "Todo" };
  const resolveRelation = (_res: string, _id: string, rel: string) => {
    if (rel === "tags") return [{ id: "t1", name: "urgent" }];
    return [];
  };

  it("dot-path via relation resolver", () => {
    expect(
      evaluateFilter(record, { "tags.name": { $eq: "urgent" } }, {
        resolveRelation,
        resource: "todos",
      }),
    ).toBe(true);
  });

  it("relation resolver no match", () => {
    expect(
      evaluateFilter(record, { "tags.name": { $eq: "boring" } }, {
        resolveRelation,
        resource: "todos",
      }),
    ).toBe(false);
  });

  it("missing dot-path without resolver → false", () => {
    expect(evaluateFilter(record, { "tags.name": { $eq: "urgent" } })).toBe(false);
  });

  it("enforces depth limits across relation traversal", () => {
    const deepRecord = { id: "1" };
    const deepResolveRelation = (_resource: string, _id: string, relation: string) => {
      if (relation.startsWith("rel")) {
        return [{ id: "1" }];
      }
      return [];
    };

    const filter = {
      "rel0.rel1.rel2.rel3.rel4.rel5.rel6.rel7.rel8.rel9.rel10.name": { $eq: "urgent" },
    };

    expect(() =>
      evaluateFilter(deepRecord, filter, {
        resolveRelation: deepResolveRelation,
        resource: "todos",
      }),
    ).toThrow();
  });
});
