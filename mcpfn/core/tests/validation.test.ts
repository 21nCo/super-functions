import { describe, expect, it } from "vitest";

import { createSchemaCompiler } from "../src/validation.js";

describe("schema validation engines", () => {
  it.each(["ajv", "cfworker"] as const)(
    "uses draft-07 $ref sibling semantics with %s",
    (engine) => {
      const validate = createSchemaCompiler(engine).compile({
        definitions: { value: { type: "string" } },
        $ref: "#/definitions/value",
        minLength: 5,
      });

      expect(validate("abc")).toBe(true);
    },
  );

  it.each([
    { type: "object", properties: { value: { minimum: "invalid" } } },
    { type: "object", required: "value" },
    { type: "string", pattern: "[" },
  ])("rejects malformed schemas before edge validation", (schema) => {
    expect(() => createSchemaCompiler("cfworker").compile(schema as object))
      .toThrow(/schema is invalid/);
  });

  it("normalizes fallback validation errors", () => {
    const validate = createSchemaCompiler("cfworker").compile({ type: "string" });

    expect(validate(42)).toBe(false);
    expect(validate.errors).toEqual([
      expect.objectContaining({
        instancePath: "",
        keyword: "type",
      }),
    ]);
  });

  it("scopes schema identifiers to an owning compiler", () => {
    const first = createSchemaCompiler("ajv");
    const second = createSchemaCompiler("ajv");
    const schema = { $id: "https://example.test/value", type: "string" };

    expect(() => first.compile(schema)).not.toThrow();
    expect(() => second.compile(schema)).not.toThrow();
    expect(() => first.compile({ ...schema })).toThrow(/already exists/);
  });
});
