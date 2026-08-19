import { describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../core-types.js";
import {
  validateMutationAuthz,
  validateQueryAuthz,
  validateShareableOperationAccess
} from "../authz.js";

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

const defaultPermissionsSchema: DatafnSchema = {
  defaultPermissions: {
    read: "allResourceFields",
    write: "allResourceFields",
    relationWrites: "all"
  },
  resources: [
    {
      name: "todos",
      version: 1,
      capabilities: ["timestamps", "archivable"] as any,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "text", type: "string", required: false }
      ]
    },
    {
      name: "categories",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "label", type: "string", required: false }
      ]
    },
    {
      name: "auditLogs",
      version: 1,
      defaultPermissions: false,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "event", type: "string", required: false }
      ]
    }
  ],
  relations: [
    {
      from: "todos",
      to: "categories",
      type: "many-many",
      relation: "tags",
      inverse: "todos"
    }
  ]
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

  it("allows shareable merge to create a missing private record", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const result = await validateShareableOperationAccess({
      db,
      schema: {
        resources: [
          {
            name: "properties",
            version: 1,
            capabilities: [
              "timestamps",
              "audit",
              {
                shareable: {
                  levels: ["viewer", "editor", "owner"],
                  default: "private"
                }
              }
            ] as any,
            fields: [{ name: "label", type: "string", required: false }]
          }
        ],
        relations: []
      },
      resource: "properties",
      operation: "merge",
      id: "property:new",
      actorId: "user:alice",
      namespace: "ns:1",
      requireActorForPrivate: true
    });

    expect(result.ok).toBe(true);
  });

  it("applies schema default permissions to declared resource fields", () => {
    const queryResult = validateQueryAuthz(
      {
        resource: "todos",
        version: 1,
        select: ["id", "text", "createdAt"]
      },
      defaultPermissionsSchema
    );
    expect(queryResult.ok).toBe(true);

    const mutationResult = validateMutationAuthz(
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        record: {
          id: "todo:1",
          text: "Write the thing"
        }
      },
      defaultPermissionsSchema
    );
    expect(mutationResult.ok).toBe(true);
  });

  it("keeps schema default permissions scoped to declared resource fields", () => {
    const result = validateMutationAuthz(
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        id: "todo:1",
        record: {
          internalOnly: true
        }
      },
      defaultPermissionsSchema
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.path).toBe("record.internalOnly");
    }
  });

  it("applies schema default permissions to declared relation writes", () => {
    const forwardResult = validateMutationAuthz(
      {
        resource: "todos",
        version: 1,
        operation: "relate",
        relation: "tags",
        id: "todo:1",
        targetId: "category:1"
      },
      defaultPermissionsSchema
    );
    expect(forwardResult.ok).toBe(true);

    const inverseResult = validateMutationAuthz(
      {
        resource: "categories",
        version: 1,
        operation: "relate",
        relation: "todos",
        id: "category:1",
        targetId: "todo:1"
      },
      defaultPermissionsSchema
    );
    expect(inverseResult.ok).toBe(true);
  });

  it("allows resources to opt out of schema default permissions", () => {
    const result = validateQueryAuthz(
      {
        resource: "auditLogs",
        version: 1,
        select: ["event"]
      },
      defaultPermissionsSchema
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.path).toBe("resource");
    }
  });
});
