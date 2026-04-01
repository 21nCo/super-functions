import { defineSchema } from "@datafn/core";

export const demoSchema = defineSchema({
  resources: [
    {
      name: "note",
      version: 1,
      fields: [
        { name: "title", type: "string", required: false },
        { name: "summary", type: "string", required: false },
        { name: "surface", type: "string", required: false },
      ],
    },
  ],
});

export const demoNamespace = "extfn:svelte-demo";
