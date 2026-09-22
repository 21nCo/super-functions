import { describe, expect, it } from "vitest";

import { createSchemaCompiler, validateSchemaCollection } from "../src/validation.js";

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

  it.each(["ajv", "cfworker"] as const)(
    "resolves previously registered external schemas with %s",
    (engine) => {
      const compiler = createSchemaCompiler(engine);
      compiler.compile({ $id: "https://example.test/value", type: "string" });
      const validate = compiler.compile({
        type: "object",
        properties: { value: { $ref: "https://example.test/value" } },
      });

      expect(validate({ value: "ok" })).toBe(true);
      expect(validate({ value: 42 })).toBe(false);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "validates schema collections as independent roots with %s",
    (engine) => {
      const schemaId = "https://example.test/batch-value";
      expect(() => validateSchemaCollection(
        [
          {
            type: "object",
            definitions: { value: { type: "string" } },
            properties: { value: { $ref: "#/definitions/value" } },
          },
          {
            type: "object",
            properties: { value: { $ref: schemaId } },
          },
          {
            definitions: {
              value: { $id: schemaId, type: "string" },
            },
          },
        ],
        engine,
      )).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects duplicate identifiers in schema collections with %s",
    (engine) => {
      const schema = { $id: "https://example.test/duplicate", type: "string" };

      expect(() => validateSchemaCollection([schema, { ...schema }], engine))
        .toThrow(/already exists|Duplicate schema URI/);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "scopes schema identifiers to an owning %s compiler",
    (engine) => {
      const first = createSchemaCompiler(engine);
      const second = createSchemaCompiler(engine);
      const schema = { $id: "https://example.test/value", type: "string" };

      expect(() => first.compile(schema)).not.toThrow();
      expect(() => second.compile(schema)).not.toThrow();
      expect(() => first.compile({ ...schema })).toThrow(/already exists|Duplicate schema URI/);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "keeps anonymous schemas independent within a %s compiler",
    (engine) => {
      const compiler = createSchemaCompiler(engine);

      expect(() => compiler.compile({ type: "string" })).not.toThrow();
      expect(() => compiler.compile({ type: "number" })).not.toThrow();
    },
  );

  it("does not reserve the fallback's former fixed synthetic identifier", () => {
    const compiler = createSchemaCompiler("cfworker");

    compiler.compile({ type: "object" });
    expect(() => compiler.compile({
      $id: "https://mcpfn.invalid/schema/0",
      type: "object",
    })).not.toThrow();
  });

  it.each(["ajv", "cfworker"] as const)(
    "does not reserve collection-internal identifiers with %s",
    (engine) => {
      expect(() => validateSchemaCollection([
        { $id: "https://schema-collection.mcpfn.invalid/1-0", type: "string" },
        { type: "number" },
      ], engine)).not.toThrow();
      expect(() => validateSchemaCollection([
        { definitions: { value: { $id: "1-0", type: "string" } } },
        { type: "number" },
      ], engine)).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects unsupported explicitly declared dialects with %s",
    (engine) => {
      expect(() => createSchemaCompiler(engine).compile({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "string",
      })).toThrow();
    },
  );

  it.each([
    ["ajv", "http://json-schema.org/draft-07/schema#"],
    ["ajv", "http://json-schema.org/draft-07/schema"],
    ["cfworker", "http://json-schema.org/draft-07/schema#"],
    ["cfworker", "http://json-schema.org/draft-07/schema"],
  ] as const)("accepts the supported %s dialect alias %s", (engine, dialect) => {
    expect(() => createSchemaCompiler(engine).compile({
      $schema: dialect,
      type: "string",
    })).not.toThrow();
  });
});
