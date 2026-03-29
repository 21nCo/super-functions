import { defineSchema } from "@datafn/core";

const schema = defineSchema({
  resources: [
    {
      name: "documents",
      version: 1,
      idPrefix: "doc:",
      capabilities: [
        "timestamps",
        "audit",
        {
          shareable: {
            levels: ["viewer", "editor", "owner"],
            default: "private",
            visibilityDefault: "private",
            supportsScopeGrants: true,
            crossNsShareable: true,
          },
        },
      ],
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
        { name: "content", type: "string", required: true, minLength: 1, maxLength: 20_000 },
      ],
      indices: {
        base: ["title"],
        search: ["title", "content"],
      },
    },
  ],
  relations: [],
});

export default schema;
