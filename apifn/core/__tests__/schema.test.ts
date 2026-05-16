import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Type } from "@sinclair/typebox";
import {
  convertSchema,
  convertTypeBoxSchema,
  convertZodSchema,
  deduplicateSchemas,
  detectSchemaType,
} from "../src/index.js";

describe("schema conversion", () => {
  it("TV-SCHEMA-001: converts zod objects with optional fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
      nested: z.object({ active: z.boolean() }),
      tags: z.array(z.string()),
    });

    const converted = convertZodSchema(schema);

    expect(converted.type).toBe("object");
    expect(converted.properties).toMatchObject({
      name: { type: "string" },
      age: { type: "number" },
      nested: {
        type: "object",
        properties: {
          active: { type: "boolean" },
        },
        required: ["active"],
      },
      tags: {
        type: "array",
        items: { type: "string" },
      },
    });
    expect(converted.required).toEqual(expect.arrayContaining(["name", "nested", "tags"]));
    expect(converted.required).not.toContain("age");
  });

  it("TV-SCHEMA-002: converts zod enum", () => {
    const converted = convertZodSchema(z.enum(["active", "inactive", "pending"]));

    expect(converted).toMatchObject({
      type: "string",
      enum: ["active", "inactive", "pending"],
    });
  });

  it("TV-SCHEMA-003: passes through TypeBox schema and strips symbol metadata", () => {
    const schema = Type.Object({
      id: Type.String(),
      count: Type.Integer({ minimum: 0 }),
    });

    const converted = convertTypeBoxSchema(schema);

    expect(converted).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        count: { type: "integer", minimum: 0 },
      },
      required: ["id", "count"],
    });
    expect(Object.getOwnPropertySymbols(converted)).toHaveLength(0);
  });

  it("TV-SCHEMA-004: passes through plain JSON Schema unchanged", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
      },
      required: ["id"],
    } as const;

    expect(convertSchema(jsonSchema)).toBe(jsonSchema);
  });

  it("TV-SCHEMA-005: detects schema type correctly and errors for unsupported inputs", () => {
    expect(detectSchemaType(z.string())).toBe("zod");
    expect(detectSchemaType(Type.String())).toBe("typebox");
    expect(detectSchemaType({ type: "string" })).toBe("jsonschema");
    expect(() => detectSchemaType(42 as never)).toThrow(/Unsupported schema type/i);
  });

  it("TV-SCHEMA-006: deduplicates repeated schemas into single component ref", () => {
    const userZod = z.object({ id: z.string(), name: z.string() });
    const userA = convertZodSchema(userZod);
    const userB = convertZodSchema(userZod);

    const deduped = deduplicateSchemas([
      { name: "User", schema: userA },
      { name: "User", schema: userB },
    ]);

    expect(Object.keys(deduped.components)).toHaveLength(1);
    expect(deduped.components.User).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
    });
    expect(deduped.refs).toEqual([
      "#/components/schemas/User",
      "#/components/schemas/User",
    ]);
  });

  it("deduplicates unnamed structurally equal schemas", () => {
    const deduped = deduplicateSchemas([
      { schema: { type: "object", properties: { id: { type: "string" } } } },
      { schema: { type: "object", properties: { id: { type: "string" } } } },
    ]);

    expect(Object.keys(deduped.components)).toHaveLength(1);
    expect(deduped.refs[0]).toBe(deduped.refs[1]);
  });
});
