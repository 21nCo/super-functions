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
    "preserves the shared base for relative schema identifiers with %s",
    (engine) => {
      const valueSchema = { $id: "shared", type: "string" };
      const referringSchema = {
        type: "object",
        properties: { value: { $ref: "shared" } },
      };
      const compiler = createSchemaCompiler(engine);
      compiler.compile(valueSchema);
      const validate = compiler.compile(referringSchema);

      expect(validate({ value: "ok" })).toBe(true);
      expect(validate({ value: 42 })).toBe(false);
      expect(() => validateSchemaCollection([valueSchema, referringSchema], engine))
        .not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "does not alias relative references to absolute internal-looking identifiers with %s",
    (engine) => {
      const absoluteSchema = {
        $id: "https://0.schema-resource.mcpfn.invalid/shared",
        type: "string",
      };
      const referringSchema = { $ref: "shared" };
      const compiler = createSchemaCompiler(engine);
      compiler.compile(absoluteSchema);

      expect(() => compiler.compile(referringSchema))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(() => validateSchemaCollection([absoluteSchema, referringSchema], engine))
        .toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "does not satisfy a missing absolute reference with a synthetic root using %s",
    (engine) => {
      const schema = { $ref: "https://schema-collection.mcpfn.invalid/0-0" };
      expect(() => createSchemaCompiler(engine).compile(schema))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(() => validateSchemaCollection([schema], engine))
        .toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "resolves relative references inside $defs using %s",
    (engine) => {
      const shared = { $id: "shared", type: "string" };
      const referring = {
        type: "object",
        $defs: { value: { $ref: "shared" } },
        properties: { value: { $ref: "#/$defs/value" } },
      };
      const compiler = createSchemaCompiler(engine);
      compiler.compile(shared);
      const validate = compiler.compile(referring);
      expect(validate({ value: "ok" })).toBe(true);
      expect(validate({ value: 42 })).toBe(false);
      expect(() => validateSchemaCollection([shared, referring], engine)).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "resolves a relative identifier declared inside $defs using %s",
    (engine) => {
      const schema = {
        type: "object",
        $defs: { value: { $id: "shared", type: "string" } },
        properties: { value: { $ref: "shared" } },
      };
      const validate = createSchemaCompiler(engine).compile(schema);
      expect(validate({ value: "ok" })).toBe(true);
      expect(validate({ value: 42 })).toBe(false);
      expect(() => validateSchemaCollection([schema], engine)).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "does not alias a nested absolute $defs identifier to a relative reference using %s",
    (engine) => {
      const schema = {
        $defs: { value: { $id: "https://0.schema-resource.mcpfn.invalid/shared", type: "string" } },
        properties: { value: { $ref: "shared" } },
      };
      expect(() => createSchemaCompiler(engine).compile(schema))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(() => validateSchemaCollection([schema], engine))
        .toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects legacy identifiers inside $defs using %s",
    (engine) => {
      const schema = { $defs: { value: { id: "legacy", type: "string" } } };
      expect(() => createSchemaCompiler(engine).compile(schema))
        .toThrow(/keyword "id".*\$id/);
      expect(() => validateSchemaCollection([schema], engine))
        .toThrow(/keyword "id".*\$id/);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects malformed schemas inside $defs before registration using %s",
    (engine) => {
      const schema = {
        type: "object",
        $defs: { value: { type: 7 } },
        properties: { value: { $ref: "#/$defs/value" } },
      };
      expect(() => createSchemaCompiler(engine).compile(schema)).toThrow();
      expect(() => validateSchemaCollection([schema], engine)).toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "does not expose an earlier anonymous root through a later relative reference using %s",
    (engine) => {
      const anonymous = { type: "string" };
      const referring = {
        $id: "https://schema-collection.mcpfn.invalid/",
        $ref: "0-0",
      };
      const compiler = createSchemaCompiler(engine);
      const first = compiler.compile(anonymous);
      expect(() => compiler.compile(referring))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(() => validateSchemaCollection([anonymous, referring], engine))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(first("still valid")).toBe(true);
      expect(first(42)).toBe(false);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "keeps an explicit public identifier distinct from an anonymous root using %s",
    (engine) => {
      const anonymous = { type: "number" };
      const publicSchema = {
        $id: "https://schema-collection.mcpfn.invalid/0-0",
        type: "string",
      };
      const referring = { $ref: publicSchema.$id };
      const compiler = createSchemaCompiler(engine);
      const first = compiler.compile(anonymous);
      compiler.compile(publicSchema);
      const validate = compiler.compile(referring);
      expect(first(42)).toBe(true);
      expect(first("42")).toBe(false);
      expect(validate("ok")).toBe(true);
      expect(validate(42)).toBe(false);
      expect(() => validateSchemaCollection([anonymous, publicSchema, referring], engine))
        .not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "resolves nested references under an opaque URI base using %s",
    (engine) => {
      const schema = {
        $id: "urn:example:root",
        type: "object",
        $defs: { child: { $id: "child", type: "string" } },
        properties: { value: { $ref: "child" } },
      };
      const validate = createSchemaCompiler(engine).compile(schema);
      expect(validate({ value: "ok" })).toBe(true);
      expect(validate({ value: 42 })).toBe(false);
      expect(() => validateSchemaCollection([schema], engine)).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects unresolved references under an opaque URI base using %s",
    (engine) => {
      const schema = { $id: "urn:example:root", $ref: "missing" };
      expect(() => createSchemaCompiler(engine).compile(schema)).toThrow();
      expect(() => validateSchemaCollection([schema], engine)).toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "keeps an empty reference within an opaque resource using %s",
    (engine) => {
      const schema = {
        $id: "urn:example:root",
        type: "object",
        properties: { child: { anyOf: [{ type: "null" }, { $ref: "" }] } },
      };
      const validate = createSchemaCompiler(engine).compile(schema);
      expect(validate({ child: null })).toBe(true);
      expect(validate({ child: {} })).toBe(true);
      expect(validate({ child: 42 })).toBe(false);
      expect(() => validateSchemaCollection([schema], engine)).not.toThrow();
    },
  );

  it("keeps earlier edge validators correct after a resource rebase and a rejected registration", () => {
    const compiler = createSchemaCompiler("cfworker");
    const first = compiler.compile({ type: "string", minLength: 2 });
    const shared = compiler.compile({ $id: "shared", type: "number" });
    expect(() => compiler.compile({
      $ref: "https://schema-collection.mcpfn.invalid/0-0",
    })).toThrow(/resolve.*ref/i);
    // This absolute identifier occupies the former relative-resource origin.
    compiler.compile({ $id: "https://0.schema-resource.mcpfn.invalid/other", type: "null" });
    const referring = compiler.compile({ $ref: "shared" });
    expect(first("ok")).toBe(true);
    expect(first("x")).toBe(false);
    expect(shared(3)).toBe(true);
    expect(referring(3)).toBe(true);
    expect(referring("3")).toBe(false);
  });

  it("keeps a larger edge registry's independent validators available", () => {
    const compiler = createSchemaCompiler("cfworker");
    const validators = Array.from({ length: 120 }, (_, index) =>
      compiler.compile({ type: "integer", minimum: index }));
    for (const [index, validate] of validators.entries()) {
      expect(validate(index)).toBe(true);
      expect(validate(index - 1)).toBe(false);
    }
  });

  it.each(["ajv", "cfworker"] as const)(
    "rejects legacy identifiers, including beside empty references, with %s",
    (engine) => {
      const schema = {
        type: "object",
        definitions: {
          node: {
            id: "legacy-node",
            type: "object",
            properties: { child: { $ref: "" } },
          },
        },
      };

      expect(() => createSchemaCompiler(engine).compile(schema))
        .toThrow(/keyword "id".*\$id/);
      expect(() => validateSchemaCollection([schema], engine))
        .toThrow(/keyword "id".*\$id/);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects unresolved references while compiling with %s",
    (engine) => {
      expect(() => createSchemaCompiler(engine).compile({
        $ref: "https://example.test/missing",
      })).toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "resolves local references inside draft-07 dependencies with %s",
    (engine) => {
      const schema = {
        type: "object",
        definitions: {
          value: {
            type: "object",
            required: ["value"],
            properties: { value: { type: "string" } },
          },
        },
        properties: { type: { type: "boolean" }, value: {} },
        dependencies: { type: { $ref: "#/definitions/value" } },
      };
      const validate = createSchemaCompiler(engine).compile(schema);

      expect(validate({ type: true, value: "ok" })).toBe(true);
      expect(validate({ type: true, value: 42 })).toBe(false);
      expect(() => validateSchemaCollection([schema], engine)).not.toThrow();
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "rejects unresolved references inside draft-07 dependencies with %s",
    (engine) => {
      const schema = {
        type: "object",
        properties: { type: { type: "boolean" } },
        dependencies: { type: { $ref: "#/missing" } },
      };

      expect(() => createSchemaCompiler(engine).compile(schema))
        .toThrow(/resolve.*ref|can't resolve reference/i);
      expect(() => validateSchemaCollection([schema], engine))
        .toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "accepts an empty reference to the current resource with %s",
    (engine) => {
      const schema = {
        $id: "https://example.test/node",
        type: "object",
        properties: {
          child: { anyOf: [{ type: "null" }, { $ref: "" }] },
        },
      };
      const validate = createSchemaCompiler(engine).compile(schema);

      expect(validate({ child: null })).toBe(true);
      expect(validate({ child: {} })).toBe(true);
      expect(validate({ child: 42 })).toBe(false);
      expect(() => validateSchemaCollection([schema], engine)).not.toThrow();
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
    "rejects unresolved references in schema collections with %s",
    (engine) => {
      expect(() => validateSchemaCollection([
        {
          type: "object",
          properties: { value: { $ref: "#/missing" } },
        },
      ], engine)).toThrow(/resolve.*ref|can't resolve reference/i);
    },
  );

  it.each(["ajv", "cfworker"] as const)(
    "accepts cyclic references in schema collections with %s",
    (engine) => {
      expect(() => validateSchemaCollection([
        {
          $id: "https://example.test/left",
          type: "object",
          properties: { right: { $ref: "https://example.test/right" } },
        },
        {
          $id: "https://example.test/right",
          type: "object",
          properties: { left: { $ref: "https://example.test/left" } },
        },
      ], engine)).not.toThrow();
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

  it("does not reserve collection identifiers while compiling with the fallback", () => {
    const compiler = createSchemaCompiler("cfworker");

    compiler.compile({
      $id: "https://schema-collection.mcpfn.invalid/1-0",
      type: "object",
    });
    expect(() => compiler.compile({ type: "object" })).not.toThrow();
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
