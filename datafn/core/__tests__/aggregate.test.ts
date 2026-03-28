/**
 * Aggregation tests
 * Tests CLI-003: calculateAggregation returns null for empty/all-null sets (SQL semantics)
 */

import { describe, it, expect } from "vitest";
import { calculateAggregation } from "../src/aggregate.js";

describe("calculateAggregation — empty set (CLI-003)", () => {
  it("count on empty set returns 0", () => {
    expect(calculateAggregation("count", "value", [])).toBe(0);
  });

  it("min on empty set returns null", () => {
    expect(calculateAggregation("min", "value", [])).toBeNull();
  });

  it("max on empty set returns null", () => {
    expect(calculateAggregation("max", "value", [])).toBeNull();
  });

  it("sum on empty set returns null", () => {
    expect(calculateAggregation("sum", "value", [])).toBeNull();
  });

  it("avg on empty set returns null", () => {
    expect(calculateAggregation("avg", "value", [])).toBeNull();
  });
});

describe("calculateAggregation — all-null values (CLI-003)", () => {
  const nullRecords = [{ value: null }, { value: null }, { value: undefined }];

  it("min with all-null values returns null", () => {
    expect(calculateAggregation("min", "value", nullRecords)).toBeNull();
  });

  it("max with all-null values returns null", () => {
    expect(calculateAggregation("max", "value", nullRecords)).toBeNull();
  });

  it("sum with all-null values returns null", () => {
    expect(calculateAggregation("sum", "value", nullRecords)).toBeNull();
  });

  it("avg with all-null values returns null", () => {
    expect(calculateAggregation("avg", "value", nullRecords)).toBeNull();
  });

  it("count with all-null values still counts all records", () => {
    // count is not null-filtered — it counts records, not values
    expect(calculateAggregation("count", "value", nullRecords)).toBe(3);
  });
});

describe("calculateAggregation — normal operation (regression)", () => {
  const records = [
    { price: 10 },
    { price: 30 },
    { price: 20 },
    { price: null },
  ];

  it("min excludes nulls and returns smallest value", () => {
    expect(calculateAggregation("min", "price", records)).toBe(10);
  });

  it("max excludes nulls and returns largest value", () => {
    expect(calculateAggregation("max", "price", records)).toBe(30);
  });

  it("sum excludes nulls", () => {
    expect(calculateAggregation("sum", "price", records)).toBe(60);
  });

  it("avg excludes nulls", () => {
    expect(calculateAggregation("avg", "price", records)).toBe(20);
  });

  it("count includes all records (including nulls)", () => {
    expect(calculateAggregation("count", "price", records)).toBe(4);
  });
});
