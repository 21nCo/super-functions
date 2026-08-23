import { describe, expect, it } from "vitest";
import { validateAdminValue } from "./validator.js";

describe("validateAdminValue", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite JSON numbers (%s)",
    (value) => {
      expect(validateAdminValue({ type: "number" }, value)).toEqual([
        { path: "$", message: "must be a finite JSON number", keyword: "type" },
      ]);
    },
  );

  it.each([
    [{ type: "object", additionalProperties: true } as const, { nested: Number.NaN }, "$.nested"],
    [{ type: "object", properties: { nested: {} } } as const, { nested: Number.POSITIVE_INFINITY }, "$.nested"],
    [{ type: "array" } as const, [Number.NEGATIVE_INFINITY], "$[0]"],
  ])("rejects non-finite values through open schemas", (schema, value, path) => {
    expect(validateAdminValue(schema, value)).toContainEqual({
      path,
      message: "must be a finite JSON number",
      keyword: "type",
    });
  });

  it("does not satisfy required properties from an object's prototype", () => {
    const value = Object.create({ id: "inherited" }) as Record<string, unknown>;
    expect(validateAdminValue({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    }, value)).toContainEqual({
      path: "$.id",
      message: "is required",
      keyword: "required",
    });
  });

  it("compares object and array enum members structurally", () => {
    const schema = {
      enum: [{ mode: "safe", limits: [1, 2] }, ["fallback", { enabled: true }]],
    } as const;

    expect(validateAdminValue(schema, { limits: [1, 2], mode: "safe" })).toEqual([]);
    expect(validateAdminValue(schema, ["fallback", { enabled: true }])).toEqual([]);
    expect(validateAdminValue(schema, { mode: "safe", limits: [2, 1] })).toContainEqual({
      path: "$",
      message: "must be one of the declared values",
      keyword: "enum",
    });
  });

  it("compares object-valued constants structurally", () => {
    expect(validateAdminValue(
      { const: { mode: "safe", nested: { enabled: true } } },
      { nested: { enabled: true }, mode: "safe" },
    )).toEqual([]);
  });
});
