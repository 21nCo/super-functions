import { describe, expect, it } from "vitest";

import { ensureBuiltinKv, KV_RESOURCE_NAME } from "../src/kv.js";
import type { DatafnSchema } from "../src/types.js";

describe("ensureBuiltinKv", () => {
  it("appends the built-in kv resource when it is missing", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    };

    const result = ensureBuiltinKv(schema);
    const kvResource = result.resources.find((resource) => resource.name === KV_RESOURCE_NAME);

    expect(kvResource).toEqual({
      name: "kv",
      version: 1,
      idPrefix: "kv",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "value", type: "json", required: false },
      ],
      indices: ["id"],
      permissions: {
        read: { fields: ["id", "value"] },
        write: { fields: ["id", "value"] },
      },
    });
  });

  it("keeps an already compatible kv resource unchanged", () => {
    const existingKv = {
      name: "kv",
      version: 1,
      idPrefix: "custom-kv",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "value", type: "json", required: false },
        { name: "namespace", type: "string", required: false },
      ],
      indices: {
        base: ["id"],
        search: ["namespace"],
        vector: [],
      },
      permissions: {
        read: { fields: ["id", "value", "namespace"] },
        write: { fields: ["id", "value", "namespace"] },
      },
    } satisfies DatafnSchema["resources"][number];

    const schema: DatafnSchema = {
      resources: [existingKv],
    };

    const result = ensureBuiltinKv(schema);

    expect(result).toBe(schema);
    expect(result.resources[0]).toEqual(existingKv);
  });

  it("expands an explicit built-in kv placeholder", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "kv",
          version: 1,
          fields: [],
        },
      ],
    };

    const result = ensureBuiltinKv(schema);

    expect(result).not.toBe(schema);
    expect(result.resources[0]).toEqual({
      name: "kv",
      version: 1,
      idPrefix: "kv",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "value", type: "json", required: false },
      ],
      indices: ["id"],
      permissions: {
        read: { fields: ["id", "value"] },
        write: { fields: ["id", "value"] },
      },
    });
  });

  it("expands a legacy built-in kv placeholder that only declares value", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "kv",
          version: 1,
          fields: [{ name: "value", type: "string", required: false }],
        },
      ],
    };

    const result = ensureBuiltinKv(schema);

    expect(result).not.toBe(schema);
    expect(result.resources[0]).toEqual({
      name: "kv",
      version: 1,
      idPrefix: "kv",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "value", type: "json", required: false },
      ],
      indices: ["id"],
      permissions: {
        read: { fields: ["id", "value"] },
        write: { fields: ["id", "value"] },
      },
    });
  });

  it("rejects an incompatible existing kv resource instead of rewriting it", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "kv",
          version: 1,
          fields: [{ name: "id", type: "string", required: true }],
          indices: [],
          permissions: {
            read: { fields: ["id"] },
            write: { fields: ["id"] },
          },
        },
      ],
    };

    expect(() => ensureBuiltinKv(schema)).toThrow('KV resource is missing required field "value"');
    expect(schema.resources[0]).toEqual({
      name: "kv",
      version: 1,
      fields: [{ name: "id", type: "string", required: true }],
      indices: [],
      permissions: {
        read: { fields: ["id"] },
        write: { fields: ["id"] },
      },
    });
  });
});
