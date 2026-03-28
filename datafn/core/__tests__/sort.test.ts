/**
 * Sort utilities tests
 * Tests TV-SRT-001, TV-SRT-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { parseSortTerms, sortRecords } from "../src/sort.js";

describe("parseSortTerms (TV-SRT-001)", () => {
  it("bare field → asc", () => expect(parseSortTerms(["name"])).toEqual([{ field: "name", direction: "asc" }]));
  it("field:asc", () => expect(parseSortTerms(["name:asc"])).toEqual([{ field: "name", direction: "asc" }]));
  it("field:desc", () => expect(parseSortTerms(["name:desc"])).toEqual([{ field: "name", direction: "desc" }]));
  it("-field → desc", () => expect(parseSortTerms(["-createdAt"])).toEqual([{ field: "createdAt", direction: "desc" }]));
  it("multiple terms", () => expect(parseSortTerms(["-createdAt", "name"])).toEqual([
    { field: "createdAt", direction: "desc" },
    { field: "name", direction: "asc" },
  ]));
  it("undefined → []", () => expect(parseSortTerms(undefined)).toEqual([]));
  it("[] → []", () => expect(parseSortTerms([])).toEqual([]));
  it("rejects invalid directions", () => expect(() => parseSortTerms(["name:sideways"])).toThrow());
});

describe("sortRecords (TV-SRT-002)", () => {
  const records = [
    { id: "3", name: "Charlie", age: 30 },
    { id: "1", name: "Alice", age: 30 },
    { id: "2", name: "Bob", age: 25 },
  ];

  it("sorts by field asc with id tie-breaker", () => {
    const sorted = sortRecords(records, parseSortTerms(["age:asc"]));
    expect(sorted[0].id).toBe("2"); // Bob, age 25
    expect(sorted[1].id).toBe("1"); // Alice, age 30 (id tie-breaker)
    expect(sorted[2].id).toBe("3"); // Charlie, age 30
  });

  it("sorts descending", () => {
    const sorted = sortRecords(records, parseSortTerms(["name:desc"]));
    expect(sorted[0].name).toBe("Charlie");
    expect(sorted[1].name).toBe("Bob");
    expect(sorted[2].name).toBe("Alice");
  });

  it("null values sort after non-null in ascending", () => {
    const recs = [
      { id: "1", score: null },
      { id: "2", score: 5 },
      { id: "3", score: null },
    ];
    const sorted = sortRecords(recs, [{ field: "score", direction: "asc" }]);
    expect(sorted[0].score).toBe(5);
    expect(sorted[1].score).toBeNull();
    expect(sorted[2].score).toBeNull();
  });

  it("empty terms → id tie-breaker only", () => {
    const sorted = sortRecords(records, []);
    expect(sorted[0].id).toBe("1");
    expect(sorted[1].id).toBe("2");
    expect(sorted[2].id).toBe("3");
  });

  it("does not mutate original array", () => {
    const original = [...records];
    sortRecords(records, parseSortTerms(["name:desc"]));
    expect(records).toEqual(original);
  });
});
