/**
 * DFQL normalization tests
 * Tests TV-NORM-001 and TV-NORM-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { normalizeDfql, dfqlKey } from "../src/normalize.js";

describe("normalizeDfql", () => {
  it("sorts object keys alphabetically", () => {
    const input = { z: 1, a: 2, m: 3 };
    const result = normalizeDfql(input);

    expect(JSON.stringify(result)).toBe('{"a":2,"m":3,"z":1}');
  });

  it("recursively sorts nested objects", () => {
    const input = {
      filters: { priority: 5, label: "Task" },
      select: ["id", "label"],
      resource: "task",
    };

    const result = normalizeDfql(input);
    const keys = Object.keys(result as Record<string, unknown>);

    expect(keys).toEqual(["filters", "resource", "select"]);
    const filters = (result as Record<string, unknown>).filters as Record<
      string,
      unknown
    >;
    expect(Object.keys(filters)).toEqual(["label", "priority"]);
  });

  it("removes undefined values", () => {
    const input = { a: 1, b: undefined, c: 3 };
    const result = normalizeDfql(input) as Record<string, unknown>;

    expect(result).toEqual({ a: 1, c: 3 });
    expect("b" in result).toBe(false);
  });

  it("preserves null values", () => {
    const input = { a: null, b: 2 };
    const result = normalizeDfql(input);

    expect(result).toEqual({ a: null, b: 2 });
  });

  it("preserves arrays without sorting", () => {
    const input = { arr: [3, 1, 2] };
    const result = normalizeDfql(input);

    expect((result as Record<string, unknown>).arr).toEqual([3, 1, 2]);
  });

  it("normalizes arrays of objects", () => {
    const input = [
      { z: 1, a: 2 },
      { c: 3, b: 4 },
    ];

    const result = normalizeDfql(input) as Array<Record<string, unknown>>;

    expect(Object.keys(result[0])).toEqual(["a", "z"]);
    expect(Object.keys(result[1])).toEqual(["b", "c"]);
  });

  it("handles primitives", () => {
    expect(normalizeDfql(42)).toBe(42);
    expect(normalizeDfql("hello")).toBe("hello");
    expect(normalizeDfql(true)).toBe(true);
    expect(normalizeDfql(null)).toBe(null);
  });

  it("serializes Date objects without collapsing them to empty objects", () => {
    expect(normalizeDfql(new Date("2024-01-01T00:00:00.000Z"))).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("drops unsafe object keys while normalizing", () => {
    const poisoned = Object.create(null) as Record<string, unknown>;
    poisoned.safe = 1;
    poisoned.__proto__ = { polluted: true };

    expect(normalizeDfql(poisoned)).toEqual({ safe: 1 });
  });
});

describe("dfqlKey", () => {
  it("produces the same key for equivalent objects with different key order", () => {
    const obj1 = { resource: "task", version: 1, select: ["id"] };
    const obj2 = { select: ["id"], version: 1, resource: "task" };

    expect(dfqlKey(obj1)).toBe(dfqlKey(obj2));
  });

  it("produces JSON string representation", () => {
    const input = { a: 1, b: 2 };
    const key = dfqlKey(input);

    expect(key).toBe('{"a":1,"b":2}');
    expect(() => JSON.parse(key)).not.toThrow();
  });

  it("produces different keys for different objects", () => {
    const obj1 = { resource: "task", version: 1 };
    const obj2 = { resource: "goal", version: 1 };

    expect(dfqlKey(obj1)).not.toBe(dfqlKey(obj2));
  });

  it("handles nested objects deterministically", () => {
    const obj1 = {
      filters: { priority: { gte: 3 }, isArchived: false },
      resource: "task",
    };
    const obj2 = {
      resource: "task",
      filters: { isArchived: false, priority: { gte: 3 } },
    };

    expect(dfqlKey(obj1)).toBe(dfqlKey(obj2));
  });

  it("TV-NORM-001 & TV-NORM-002: key stability across key orderings", () => {
    // Simulating test vectors - two semantically equivalent queries
    const query1 = {
      resource: "task",
      version: 1,
      filters: { isArchived: false },
      select: ["id", "label"],
    };

    const query2 = {
      select: ["id", "label"],
      filters: { isArchived: false },
      version: 1,
      resource: "task",
    };

    const key1 = dfqlKey(query1);
    const key2 = dfqlKey(query2);

    expect(key1).toBe(key2);
    expect(key1).toBe(
      '{"filters":{"isArchived":false},"resource":"task","select":["id","label"],"version":1}'
    );
  });

  it("returns a string for undefined input", () => {
    expect(dfqlKey(undefined)).toBe("undefined");
  });
});
