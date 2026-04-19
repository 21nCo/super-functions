import { describe, expect, it } from "vitest";
import { checkPrototypePollution, validateFieldValue } from "../src/validate.js";

describe("checkPrototypePollution", () => {
  // TV-SEC-025 — top-level __proto__
  it("rejects top-level __proto__", () => {
    // Note: __proto__ on object literals is special in JS — test with Object.create(null)
    const obj = Object.create(null);
    obj["__proto__"] = {};
    expect(checkPrototypePollution(obj)).toEqual({ ok: false, key: "__proto__" });
  });

  // TV-SEC-026 — nested constructor
  it("rejects nested constructor key", () => {
    const result = checkPrototypePollution({ nested: { constructor: {} } });
    expect(result).toEqual({ ok: false, key: "constructor" });
  });

  it("rejects nested prototype key", () => {
    const result = checkPrototypePollution({ nested: { prototype: {} } });
    expect(result).toEqual({ ok: false, key: "prototype" });
  });

  // TV-SEC-028 — clean record accepted
  it("accepts clean objects", () => {
    const result = checkPrototypePollution({ safe: "value" });
    expect(result).toEqual({ ok: true });
  });

  it("accepts clean nested objects", () => {
    const result = checkPrototypePollution({ a: { b: { c: "value" } } });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok for non-objects", () => {
    expect(checkPrototypePollution(null)).toEqual({ ok: true });
    expect(checkPrototypePollution(42)).toEqual({ ok: true });
    expect(checkPrototypePollution("hello")).toEqual({ ok: true });
    expect(checkPrototypePollution([1, 2, 3])).toEqual({ ok: true });
  });

  it("rejects disallowed keys nested inside arrays", () => {
    const payload = {
      select: [
        "id",
        { nested: { constructor: { prototype: {} } } },
      ],
    };
    expect(checkPrototypePollution(payload)).toEqual({ ok: false, key: "constructor" });
  });

  it("rejects __proto__ nested inside nested arrays", () => {
    const bad = Object.create(null);
    bad["__proto__"] = {};
    const payload = { select: [["id"], [bad]] };
    expect(checkPrototypePollution(payload)).toEqual({ ok: false, key: "__proto__" });
  });

  it("rejects deeply nested disallowed keys", () => {
    // Again need to use Object.create(null) for __proto__
    const level3 = Object.create(null);
    level3["__proto__"] = {};
    const deep = { level1: { level2: { level3 } } };
    expect(checkPrototypePollution(deep)).toEqual({ ok: false, key: "__proto__" });
  });
});

describe("validateFieldValue", () => {
  // --- string ---
  // TV-SEC-013 — string field rejects number
  it("rejects number for string field", () => {
    const result = validateFieldValue("string", 123, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expected string");
    expect(result.error).toContain("number");
  });

  it("accepts string for string field", () => {
    expect(validateFieldValue("string", "hello", false)).toEqual({ ok: true });
  });

  // --- number ---
  // TV-SEC-014 — number field rejects string
  it("rejects string for number field", () => {
    const result = validateFieldValue("number", "hello", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expected number");
  });

  // TV-SEC-015 — number field rejects NaN
  it("rejects NaN for number field", () => {
    const result = validateFieldValue("number", NaN, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("NaN");
  });

  it("accepts number for number field", () => {
    expect(validateFieldValue("number", 42, false)).toEqual({ ok: true });
  });

  // --- boolean ---
  // TV-SEC-016 — boolean field rejects string
  it("rejects string for boolean field", () => {
    const result = validateFieldValue("boolean", "true", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expected boolean");
  });

  it("accepts boolean for boolean field", () => {
    expect(validateFieldValue("boolean", true, false)).toEqual({ ok: true });
    expect(validateFieldValue("boolean", false, false)).toEqual({ ok: true });
  });

  // --- date ---
  // TV-SEC-017 — date field accepts ISO string
  it("accepts ISO 8601 date string", () => {
    expect(validateFieldValue("date", "2026-01-01T00:00:00Z", false)).toEqual({ ok: true });
  });

  // TV-SEC-018 — date field accepts epoch number
  it("accepts epoch number for date field", () => {
    expect(validateFieldValue("date", 1767225600000, false)).toEqual({ ok: true });
  });

  it("rejects invalid epoch numbers for date field", () => {
    const result = validateFieldValue("date", Number.NaN, false);
    expect(result.ok).toBe(false);
  });

  it("rejects non-ISO string for date field", () => {
    const result = validateFieldValue("date", "not-a-date", false);
    expect(result.ok).toBe(false);
  });

  it("rejects boolean for date field", () => {
    const result = validateFieldValue("date", true, false);
    expect(result.ok).toBe(false);
  });

  // --- object ---
  // TV-SEC-019 — object field rejects array
  it("rejects array for object field", () => {
    const result = validateFieldValue("object", [1, 2], false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expected object");
    expect(result.error).toContain("array");
  });

  it("accepts plain object for object field", () => {
    expect(validateFieldValue("object", { key: "value" }, false)).toEqual({ ok: true });
  });

  // --- array ---
  it("accepts array for array field", () => {
    expect(validateFieldValue("array", [1, 2, 3], false)).toEqual({ ok: true });
  });

  it("rejects object for array field", () => {
    const result = validateFieldValue("array", { key: "value" }, false);
    expect(result.ok).toBe(false);
  });

  // --- file ---
  it("accepts string for file field", () => {
    expect(validateFieldValue("file", "https://example.com/img.png", false)).toEqual({ ok: true });
  });

  it("rejects number for file field", () => {
    const result = validateFieldValue("file", 42, false);
    expect(result.ok).toBe(false);
  });

  // --- nullable ---
  // TV-SEC-020 — nullable field accepts null
  it("accepts null when nullable is true", () => {
    expect(validateFieldValue("string", null, true)).toEqual({ ok: true });
  });

  it("rejects null when nullable is false", () => {
    const result = validateFieldValue("string", null, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("null");
  });

  // --- json ---
  it("accepts string for json field", () => {
    expect(validateFieldValue("json", "hello", false)).toEqual({ ok: true });
  });

  it("accepts number for json field", () => {
    expect(validateFieldValue("json", 42, false)).toEqual({ ok: true });
  });

  it("accepts boolean for json field", () => {
    expect(validateFieldValue("json", true, false)).toEqual({ ok: true });
  });

  it("accepts object for json field", () => {
    expect(validateFieldValue("json", { key: "value" }, false)).toEqual({ ok: true });
  });

  it("accepts array for json field", () => {
    expect(validateFieldValue("json", [1, 2, 3], false)).toEqual({ ok: true });
  });

  it("accepts null for json field when nullable", () => {
    expect(validateFieldValue("json", null, true)).toEqual({ ok: true });
  });

  it("rejects null for json field when not nullable", () => {
    const result = validateFieldValue("json", null, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("null");
  });

  // --- unknown type ---
  it("rejects unknown schema types", () => {
    const result = validateFieldValue("foobar", "test", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown schema type");
  });
});
