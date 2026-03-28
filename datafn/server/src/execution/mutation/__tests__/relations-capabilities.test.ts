/**
 * Tests for relation capability injection and stripping in relation mutations (JRT-001..004, SEC-001, COMP-001)
 * Spec: 2026-03-07-new-q7m3k9r2-spec / PHASE_03
 *
 * Tests directly call executeRelate / executeModifyRelation to inspect join-row payloads
 * without going through the HTTP layer, since actorId is the critical parameter under test.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { Adapter } from "@superfunctions/db";
import { executeRelate, executeModifyRelation } from "../relations.js";
import type { DatafnSchema } from "../../../core-types.js";

// ─── Schema with timestamps+audit capabilities ────────────────────────────────

const SCHEMA_TIMESTAMPS_AUDIT: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "tags",
      version: 1,
      fields: [{ name: "name", type: "string" as const, required: true }],
    },
  ],
  relations: [
    {
      from: "tasks",
      to: "tags",
      type: "many-many",
      relation: "tags",
      capabilities: ["timestamps", "audit"],
    },
  ],
};

const SCHEMA_TIMESTAMPS_ONLY: DatafnSchema = {
  resources: SCHEMA_TIMESTAMPS_AUDIT.resources,
  relations: [
    {
      from: "tasks",
      to: "tags",
      type: "many-many",
      relation: "tags",
      capabilities: ["timestamps"],
    },
  ],
};

const SCHEMA_AUDIT_ONLY: DatafnSchema = {
  resources: SCHEMA_TIMESTAMPS_AUDIT.resources,
  relations: [
    {
      from: "tasks",
      to: "tags",
      type: "many-many",
      relation: "tags",
      capabilities: ["audit"],
    },
  ],
};

const SCHEMA_NO_CAPABILITIES: DatafnSchema = {
  resources: SCHEMA_TIMESTAMPS_AUDIT.resources,
  relations: [
    {
      from: "tasks",
      to: "tags",
      type: "many-many",
      relation: "tags",
      // No capabilities
    },
  ],
};

const SCHEMA_WITH_METADATA: DatafnSchema = {
  resources: SCHEMA_TIMESTAMPS_AUDIT.resources,
  relations: [
    {
      from: "tasks",
      to: "tags",
      type: "many-many",
      relation: "tags",
      capabilities: ["timestamps", "audit"],
      metadata: [{ name: "addedOrder", type: "number" }],
    },
  ],
};

const NS = "datafn";

function makeRelate(override?: Record<string, unknown>) {
  return {
    resource: "tasks",
    version: 1,
    operation: "relate" as const,
    clientId: "c-1",
    mutationId: `m-${Math.random()}`,
    id: "task-1",
    ...override,
  };
}

function makeModify(override?: Record<string, unknown>) {
  return {
    resource: "tasks",
    version: 1,
    operation: "modifyRelation" as const,
    clientId: "c-1",
    mutationId: `m-${Math.random()}`,
    id: "task-1",
    ...override,
  };
}

async function getJoinRow(db: Adapter, from: string, to: string) {
  return db.findOne({
    model: "__datafn_join_tasks_tags",
    where: [
      { field: "from", operator: "eq", value: from },
      { field: "to", operator: "eq", value: to },
    ],
    namespace: NS,
  }) as Promise<Record<string, unknown> | null>;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: Adapter;

beforeEach(async () => {
  db = memoryAdapter();
  await db.initialize();
  await db.create({ model: "tasks", data: { id: "task-1", title: "Task 1" }, namespace: NS });
  await db.create({ model: "tags", data: { id: "tag-1", name: "Tag 1" }, namespace: NS });
  await db.create({ model: "tags", data: { id: "tag-2", name: "Tag 2" }, namespace: NS });
});

// ─── JRT-002: Create-path injection ──────────────────────────────────────────

describe("JRT-002: Relate create-path relation capability injection", () => {
  it("TV-JRT-002: first relate with timestamps+audit injects all four capability fields", async () => {
    const mutation = makeRelate({ relations: { tags: ["tag-1"] } });
    const result = await executeRelate(db, SCHEMA_TIMESTAMPS_AUDIT, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row).toBeDefined();
    expect(typeof row!.createdAt).toBe("number");
    expect(typeof row!.updatedAt).toBe("number");
    expect(row!.createdBy).toBe("user:alice");
    expect(row!.updatedBy).toBe("user:alice");
  });

  it("timestamps-only: injects createdAt and updatedAt, no audit fields", async () => {
    const mutation = makeRelate({ relations: { tags: ["tag-1"] } });
    const result = await executeRelate(db, SCHEMA_TIMESTAMPS_ONLY, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(typeof row!.createdAt).toBe("number");
    expect(typeof row!.updatedAt).toBe("number");
    expect(row!.createdBy).toBeUndefined();
    expect(row!.updatedBy).toBeUndefined();
  });

  it("audit-only: injects createdBy and updatedBy, no timestamp fields", async () => {
    const mutation = makeRelate({ relations: { tags: ["tag-1"] } });
    const result = await executeRelate(db, SCHEMA_AUDIT_ONLY, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.createdBy).toBe("user:alice");
    expect(row!.updatedBy).toBe("user:alice");
    expect(row!.createdAt).toBeUndefined();
    expect(row!.updatedAt).toBeUndefined();
  });

  it("TV-SEC-001: null actorId yields null createdBy/updatedBy (not client value)", async () => {
    const mutation = makeRelate({ relations: { tags: ["tag-1"] } });
    const result = await executeRelate(db, SCHEMA_AUDIT_ONLY, mutation, NS, undefined);

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.createdBy).toBeNull();
    expect(row!.updatedBy).toBeNull();
  });

  it("TV-JRT-002 negative: no capabilities → no capability fields injected", async () => {
    const mutation = makeRelate({ relations: { tags: ["tag-1"] } });
    const result = await executeRelate(db, SCHEMA_NO_CAPABILITIES, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.createdAt).toBeUndefined();
    expect(row!.updatedAt).toBeUndefined();
    expect(row!.createdBy).toBeUndefined();
    expect(row!.updatedBy).toBeUndefined();
  });

  it("user-defined metadata fields coexist with injected capability fields", async () => {
    const mutation = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", addedOrder: 5 }] },
    });
    const result = await executeRelate(db, SCHEMA_WITH_METADATA, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.addedOrder).toBe(5);
    expect(typeof row!.createdAt).toBe("number");
    expect(row!.createdBy).toBe("user:alice");
  });
});

// ─── JRT-001: Stripping ───────────────────────────────────────────────────────

describe("JRT-001 / SEC-001: Readonly relation capability field stripping", () => {
  it("TV-JRT-001: client-sent createdAt is stripped, server value used", async () => {
    const mutation = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", createdAt: 999 }] },
    });
    const result = await executeRelate(db, SCHEMA_TIMESTAMPS_ONLY, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    // Server-set value must not equal the spoofed client value
    expect(row!.createdAt).not.toBe(999);
    expect(typeof row!.createdAt).toBe("number");
  });

  it("TV-SEC-001: client-sent createdBy is stripped, actor-derived value used", async () => {
    const mutation = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", createdBy: "attacker" }] },
    });
    const result = await executeRelate(db, SCHEMA_AUDIT_ONLY, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.createdBy).toBe("user:alice"); // actor, not "attacker"
  });

  it("non-capability metadata is preserved through stripping", async () => {
    const mutation = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", addedOrder: 42, createdAt: 999, updatedBy: "evil" }] },
    });
    const result = await executeRelate(db, SCHEMA_WITH_METADATA, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    // User metadata preserved
    expect(row!.addedOrder).toBe(42);
    // Capability fields server-controlled, not client values
    expect(row!.createdAt).not.toBe(999);
    expect(row!.updatedBy).toBe("user:alice");
  });

  it("TV-JRT-001 negative: no capabilities → metadata createdAt treated as ordinary field", async () => {
    const mutation = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", createdAt: 12345 }] },
    });
    const result = await executeRelate(db, SCHEMA_NO_CAPABILITIES, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    // Without capabilities, createdAt is treated as ordinary metadata — not stripped
    expect(row!.createdAt).toBe(12345);
  });
});

// ─── JRT-003: Update-path (re-relate) ────────────────────────────────────────

describe("JRT-003: Relate update-path preserves immutable create fields", () => {
  it("TV-JRT-003: re-relate updates updatedAt and updatedBy but preserves createdAt and createdBy", async () => {
    // First relate — alice creates the join row
    const m1 = makeRelate({ relations: { tags: ["tag-1"] } });
    await executeRelate(db, SCHEMA_TIMESTAMPS_AUDIT, m1, NS, "user:alice");

    const firstRow = await getJoinRow(db, "task-1", "tag-1");
    const originalCreatedAt = firstRow!.createdAt as number;
    const originalCreatedBy = firstRow!.createdBy;

    // Small delay to ensure updatedAt increases
    await new Promise((r) => setTimeout(r, 5));

    // Re-relate — bob re-relates (upsert update path)
    const m2 = makeRelate({ relations: { tags: ["tag-1"] } });
    await executeRelate(db, SCHEMA_TIMESTAMPS_AUDIT, m2, NS, "user:bob");

    const updatedRow = await getJoinRow(db, "task-1", "tag-1");
    // Immutable fields preserved
    expect(updatedRow!.createdAt).toBe(originalCreatedAt);
    expect(updatedRow!.createdBy).toBe(originalCreatedBy); // still "user:alice"
    // Mutable fields updated
    expect(updatedRow!.updatedBy).toBe("user:bob");
    expect(updatedRow!.updatedAt as number).toBeGreaterThanOrEqual(originalCreatedAt);
  });

  it("TV-JRT-003: client sends createdBy in re-relate payload — persisted value stays original", async () => {
    // First relate
    const m1 = makeRelate({ relations: { tags: ["tag-1"] } });
    await executeRelate(db, SCHEMA_TIMESTAMPS_AUDIT, m1, NS, "user:alice");

    // Re-relate with spoofed createdBy
    const m2 = makeRelate({
      relations: { tags: [{ "$ref": "tag-1", createdBy: "user:mallory" }] },
    });
    await executeRelate(db, SCHEMA_TIMESTAMPS_AUDIT, m2, NS, "user:bob");

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.createdBy).toBe("user:alice"); // mallory's attempt stripped
    expect(row!.updatedBy).toBe("user:bob");
  });
});

// ─── JRT-004: modifyRelation ──────────────────────────────────────────────────

describe("JRT-004: modifyRelation relation capability behavior", () => {
  it("TV-JRT-004: modifyRelation on existing row injects updatedAt and updatedBy", async () => {
    // Seed join row directly
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { id: "task-1:tag-1", from: "task-1", to: "tag-1", addedOrder: 1 },
      namespace: NS,
    });

    const mutation = makeModify({
      relations: { tags: [{ "$ref": "tag-1", addedOrder: 10 }] },
    });
    const result = await executeModifyRelation(db, SCHEMA_WITH_METADATA, mutation, NS, "user:bob");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.addedOrder).toBe(10);
    expect(typeof row!.updatedAt).toBe("number");
    expect(row!.updatedBy).toBe("user:bob");
  });

  it("TV-JRT-004 negative: modifyRelation on missing row returns NOT_FOUND, no write", async () => {
    const mutation = makeModify({
      relations: { tags: [{ "$ref": "tag-1", addedOrder: 10 }] },
    });
    const result = await executeModifyRelation(db, SCHEMA_TIMESTAMPS_AUDIT, mutation, NS, "user:bob");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
    }

    // Row must not exist (no create fallback)
    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row).toBeNull();
  });

  it("modifyRelation strips client-sent capability fields before update", async () => {
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { id: "task-1:tag-1", from: "task-1", to: "tag-1" },
      namespace: NS,
    });

    const mutation = makeModify({
      relations: { tags: [{ "$ref": "tag-1", updatedAt: 1, updatedBy: "evil" }] },
    });
    const result = await executeModifyRelation(db, SCHEMA_TIMESTAMPS_AUDIT, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.updatedBy).toBe("user:alice"); // not "evil"
    expect(row!.updatedAt).not.toBe(1); // not client value
  });

  it("TV-COMP-001: modifyRelation without capabilities preserves existing behavior", async () => {
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { id: "task-1:tag-1", from: "task-1", to: "tag-1", order: 1 },
      namespace: NS,
    });

    const noCapSchema: DatafnSchema = {
      resources: SCHEMA_TIMESTAMPS_AUDIT.resources,
      relations: [
        {
          from: "tasks",
          to: "tags",
          type: "many-many",
          relation: "tags",
          metadata: [{ name: "order", type: "number" }],
        },
      ],
    };

    const mutation = makeModify({
      relations: { tags: [{ "$ref": "tag-1", order: 7 }] },
    });
    const result = await executeModifyRelation(db, noCapSchema, mutation, NS, "user:alice");

    expect(result.ok).toBe(true);

    const row = await getJoinRow(db, "task-1", "tag-1");
    expect(row!.order).toBe(7);
    // No capability fields injected
    expect(row!.updatedAt).toBeUndefined();
    expect(row!.updatedBy).toBeUndefined();
  });
});
