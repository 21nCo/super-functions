import { describe, expect, it } from "vitest";
import type { DatafnSchema } from "../../core-types.js";
import { validateMutationAuthz, validateQueryAuthz } from "../authz.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      capabilities: ["timestamps", "archivable"] as any,
      fields: [{ name: "text", type: "string", required: false }],
      permissions: {
        read: { fields: ["id", "text"] },
        write: { fields: ["text"] },
      },
    },
  ],
  relations: [],
};

describe("authz capability fields", () => {
  it("allows selecting capability readonly fields without explicit read policy entry", () => {
    const result = validateQueryAuthz(
      {
        resource: "todos",
        version: 1,
        select: ["id", "createdAt", "updatedAt"],
      },
      schema,
    );

    expect(result.ok).toBe(true);
  });

  it("does not require readonly capability fields in write policy", () => {
    const result = validateMutationAuthz(
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        id: "todo:1",
        record: { createdAt: 123 },
      },
      schema,
    );

    expect(result.ok).toBe(true);
  });

  it("enforces write policy for non-readonly capability fields like isArchived", () => {
    const result = validateMutationAuthz(
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        id: "todo:1",
        record: { isArchived: true },
      },
      schema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.path).toBe("record.isArchived");
    }
  });
});
