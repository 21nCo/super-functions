import { describe, it, expectTypeOf } from "vitest";
import { defineSchema, type DatafnSchema } from "@datafn/core";
import type { ResourceNames } from "../src/client.js";
import type { DatafnResourceRecord } from "../src/tables/table.js";

describe("defineSchema type preservation", () => {
  const schema = defineSchema({
    resources: [
      { name: "todos", version: 1, fields: [{ name: "title", type: "string" as const, required: true }] },
      { name: "tags", version: 1, fields: [{ name: "label", type: "string" as const, required: true }] },
    ],
  });

  it("ResourceNames resolves to literal union", () => {
    expectTypeOf<ResourceNames<typeof schema>>().toEqualTypeOf<"todos" | "tags">();
  });

  it("resource records preserve field names and value types", () => {
    type Todo = DatafnResourceRecord<typeof schema, "todos">;
    expectTypeOf<Todo["title"]>().toEqualTypeOf<string>();
  });

  it("schema satisfies DatafnSchema", () => {
    expectTypeOf(schema).toMatchTypeOf<DatafnSchema>();
  });

  it("explicit annotation still works", () => {
    const widened: DatafnSchema = schema;
    expectTypeOf(widened).toEqualTypeOf<DatafnSchema>();
  });
});
