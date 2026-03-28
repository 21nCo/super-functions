/**
 * Date conversion utilities tests
 * Tests TV-DTE-001, TV-DTE-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import {
  toEpochMs,
  fromEpochMs,
  coerceDateFieldsToEpoch,
  parseDateFieldsToDate,
} from "../src/date.js";

const ISO = "2024-01-01T00:00:00.000Z";
const EPOCH = 1704067200000;

describe("toEpochMs (TV-DTE-001)", () => {
  it("Date → epoch", () => expect(toEpochMs(new Date(ISO))).toBe(EPOCH));
  it("ISO string → epoch", () => expect(toEpochMs(ISO)).toBe(EPOCH));
  it("number → idempotent", () => expect(toEpochMs(EPOCH)).toBe(EPOCH));
  it("invalid string throws DFQL_INVALID", () => {
    let caught: unknown;
    try { toEpochMs("not-a-date"); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
  it("invalid Date throws DFQL_INVALID", () => {
    let caught: unknown;
    try { toEpochMs(new Date("bad")); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
  it("null throws DFQL_INVALID", () => {
    let caught: unknown;
    try { toEpochMs(null); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
  it("invalid epoch number throws DFQL_INVALID", () => {
    let caught: unknown;
    try { toEpochMs(Number.NaN); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
});

describe("fromEpochMs (TV-DTE-001)", () => {
  it("number → Date", () => expect(fromEpochMs(EPOCH).toISOString()).toBe(ISO));
  it("ISO string → Date", () => expect(fromEpochMs(ISO).toISOString()).toBe(ISO));
  it("Date → idempotent", () => {
    const d = new Date(ISO);
    expect(fromEpochMs(d)).toBe(d);
  });
  it("invalid string throws DFQL_INVALID", () => {
    let caught: unknown;
    try { fromEpochMs("not-a-date"); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
  it("invalid Date throws DFQL_INVALID", () => {
    let caught: unknown;
    try { fromEpochMs(new Date("bad")); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
  it("invalid number throws DFQL_INVALID", () => {
    let caught: unknown;
    try { fromEpochMs(Number.POSITIVE_INFINITY); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });
});

describe("coerceDateFieldsToEpoch (TV-DTE-002)", () => {
  const fields = [
    { name: "title", type: "string" as const },
    { name: "createdAt", type: "date" as const },
    { name: "count", type: "number" as const },
  ];

  it("converts date field to epoch", () => {
    const record: Record<string, unknown> = { title: "Test", createdAt: new Date(ISO), count: 5 };
    coerceDateFieldsToEpoch(record, fields);
    expect(record.createdAt).toBe(EPOCH);
  });

  it("leaves non-date fields unchanged", () => {
    const record: Record<string, unknown> = { title: "Test", createdAt: new Date(ISO), count: 5 };
    coerceDateFieldsToEpoch(record, fields);
    expect(record.title).toBe("Test");
    expect(record.count).toBe(5);
  });

  it("null date field is skipped", () => {
    const record: Record<string, unknown> = { createdAt: null };
    coerceDateFieldsToEpoch(record, fields);
    expect(record.createdAt).toBeNull();
  });

  it("undefined date field is skipped", () => {
    const record: Record<string, unknown> = {};
    coerceDateFieldsToEpoch(record, fields);
    expect(record.createdAt).toBeUndefined();
  });

  it("invalid date string throws DFQL_INVALID", () => {
    const record: Record<string, unknown> = { createdAt: "not-a-date" };
    let caught: unknown;
    try { coerceDateFieldsToEpoch(record, fields); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ code: "DFQL_INVALID" });
  });

  it("mutates record in place and returns it", () => {
    const record: Record<string, unknown> = { createdAt: new Date(ISO) };
    const result = coerceDateFieldsToEpoch(record, fields);
    expect(result).toBe(record);
  });
});

describe("parseDateFieldsToDate (TV-DTE-002)", () => {
  const fields = [
    { name: "createdAt", type: "date" as const },
    { name: "count", type: "number" as const },
  ];

  it("converts epoch to Date", () => {
    const record: Record<string, unknown> = { createdAt: EPOCH };
    parseDateFieldsToDate(record, fields);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect((record.createdAt as Date).toISOString()).toBe(ISO);
  });

  it("converts ISO string to Date", () => {
    const record: Record<string, unknown> = { createdAt: ISO };
    parseDateFieldsToDate(record, fields);
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it("leaves non-date fields unchanged", () => {
    const record: Record<string, unknown> = { createdAt: EPOCH, count: 5 };
    parseDateFieldsToDate(record, fields);
    expect(record.count).toBe(5);
  });

  it("null date field is skipped", () => {
    const record: Record<string, unknown> = { createdAt: null };
    parseDateFieldsToDate(record, fields);
    expect(record.createdAt).toBeNull();
  });

  it("roundtrip: epoch → Date → epoch", () => {
    const record: Record<string, unknown> = { createdAt: EPOCH };
    parseDateFieldsToDate(record, fields);
    coerceDateFieldsToEpoch(record, fields);
    expect(record.createdAt).toBe(EPOCH);
  });
});
