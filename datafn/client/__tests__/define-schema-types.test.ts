import { describe, it, expectTypeOf } from "vitest";
import {
  defineSchema,
  field,
  type DatafnFieldSchema,
  type DatafnSchema,
} from "@datafn/core";
import type { ResourceNames } from "../src/client.js";
import type { DatafnResourceRecord } from "../src/tables/table.js";

describe("defineSchema type preservation", () => {
  const schema = defineSchema({
    resources: [
      {
        name: "todos",
        version: 1,
        fields: [
          { name: "title", type: "string" as const, required: true },
          { name: "summary", type: "string" as const, required: false },
          {
            name: "note",
            type: "string" as const,
            required: false,
            nullable: true,
          },
          {
            name: "slug",
            type: "string" as const,
            required: true,
            nullable: true,
          },
        ],
      },
      {
        name: "tags",
        version: 1,
        fields: [{ name: "label", type: "string" as const, required: true }],
      },
    ],
  });

  it("ResourceNames resolves to literal union", () => {
    expectTypeOf<ResourceNames<typeof schema>>().toEqualTypeOf<
      "todos" | "tags"
    >();
  });

  it("resource records preserve field names and value types", () => {
    type Todo = DatafnResourceRecord<typeof schema, "todos">;
    expectTypeOf<Todo["title"]>().toEqualTypeOf<string>();
    expectTypeOf<Todo["summary"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Todo["note"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Todo["slug"]>().toEqualTypeOf<string | null>();
  });

  it("schema satisfies DatafnSchema", () => {
    expectTypeOf(schema).toMatchTypeOf<DatafnSchema>();
  });

  it("explicit annotation still works", () => {
    const widened: DatafnSchema = schema;
    expectTypeOf(widened).toEqualTypeOf<DatafnSchema>();
  });
});

describe("field builder type preservation", () => {
  const reusableId = field.string("id", {
    required: true,
    unique: true,
  });
  const sharedFields = [
    field.boolean("isStarred", { default: false }),
    field.file("attachment"),
  ];
  const builderSchema = defineSchema({
    resources: [
      {
        name: "tasks",
        version: 1,
        fields: [
          reusableId,
          field.string("status", {
            required: true,
            enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
          }),
          field.string("description"),
          field.number("estimate", { required: true, nullable: true }),
          field.string("note", { nullable: true }),
          field.object("metadata"),
          field.array("labels", { default: [] }),
          field.date("dueAt"),
          field.json("settings"),
          ...sharedFields,
        ],
        indices: {
          base: ["id", "status", "isStarred"],
        },
      },
    ],
  });

  it("infers enums, requiredness, and nullability independently", () => {
    type Task = DatafnResourceRecord<typeof builderSchema, "tasks">;
    expectTypeOf<Task["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Task["status"]>().toEqualTypeOf<
      "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"
    >();
    expectTypeOf<Task["description"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Task["estimate"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Task["note"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Task["isStarred"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Task["attachment"]>().toEqualTypeOf<string | undefined>();
  });

  it("infers explicit undefined options as runtime defaults", () => {
    const optional = field.string("optional", {
      required: undefined,
      nullable: undefined,
    });
    expectTypeOf(optional.required).toEqualTypeOf<false>();
    expectTypeOf(optional.nullable).toEqualTypeOf<false>();
  });

  it("returns plain DatafnFieldSchema-compatible values", () => {
    expectTypeOf(reusableId).toMatchTypeOf<DatafnFieldSchema>();
    expectTypeOf<
      (typeof sharedFields)[number]
    >().toMatchTypeOf<DatafnFieldSchema>();
  });

  it("rejects invalid field options and index names", () => {
    // @ts-expect-error number defaults must be numeric
    field.number("estimate", { default: "large" });
    // @ts-expect-error boolean enums must contain booleans
    field.boolean("done", { enum: ["yes", "no"] });
    // @ts-expect-error numeric bounds do not apply to strings
    field.string("title", { min: 1 });
    // @ts-expect-error builder-owned properties cannot be overridden
    field.string("title", { name: "other" });
    // @ts-expect-error unknown options are rejected
    field.file("attachment", { contentType: "image/png" });

    defineSchema({
      // @ts-expect-error index names must reference a declared field
      resources: [
        {
          name: "invalid",
          version: 1,
          fields: [field.string("title")],
          indices: ["titel"],
        },
      ],
    });
  });
});
