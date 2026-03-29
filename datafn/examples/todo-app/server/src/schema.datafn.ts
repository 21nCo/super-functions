import { defineSchema } from "@datafn/core";

const schema = defineSchema({
  capabilities: ["timestamps", "audit"],
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo",
      capabilities: ["trash", "archivable"],
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        {
          name: "text",
          type: "string",
          required: true,
          minLength: 1,
          maxLength: 500,
        },
        { name: "completed", type: "boolean", required: true, default: false },
        {
          name: "priority",
          type: "number",
          required: false,
          min: 1,
          max: 5,
          default: 3,
        },
      ],
      indices: {
        base: ["completed"],
        search: ["text"],
      },
      permissions: {
        read: {
          fields: ["id", "text", "completed", "priority"],
        },
        write: {
          fields: ["text", "completed", "priority"],
        },
      },
    },
    {
      name: "categories",
      version: 1,
      idPrefix: "cat",
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        {
          name: "name",
          type: "string",
          required: true,
          minLength: 1,
          maxLength: 100,
        },
        { name: "color", type: "string", required: true, default: "#646cff" },
      ],
      indices: {
        base: ["name"],
        search: ["name"],
      },
      permissions: {
        read: {
          fields: ["id", "name", "color"],
        },
        write: {
          fields: ["name", "color"],
        },
      },
    },
  ],
  relations: [
    {
      from: "todos",
      to: "categories",
      type: "many-many",
      relation: "tags",
      inverse: "todos",
    },
  ],
});

export default schema;
