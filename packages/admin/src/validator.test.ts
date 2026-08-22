import { describe, expect, it } from "vitest";
import { validateAdminValue } from "./validator.js";

describe("validateAdminValue", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite JSON numbers (%s)",
    (value) => {
      expect(validateAdminValue({ type: "number" }, value)).toEqual([
        { path: "$", message: "must be number", keyword: "type" },
      ]);
    },
  );

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
});
