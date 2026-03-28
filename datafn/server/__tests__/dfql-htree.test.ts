import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../src/server";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";
import { seedFixture } from "./helpers/seed-fixture";

describe("DFQL Htree (Phase 13)", () => {
  let server: any;
  let router: any;
  let adapter: any;

  // Schema with parentPath field
  const schema: DatafnSchema = {
    resources: [
      {
        name: "goal",
        version: 1,
        fields: [
          { name: "label", type: "string", required: true },
          { name: "parentPath", type: "string", required: false },
        ],
      },
      {
        name: "task",
        version: 1,
        fields: [{ name: "title", type: "string", required: true }],
      },
    ],
    relations: [],
  };

  beforeEach(async () => {
    adapter = memoryAdapter();
    // Seed tree data
    // g1: Root (path "")
    // g2: Child of g1 (path "goal:g1")
    // g3: Child of g2 (path "goal:g1-goal:g2")
    await seedFixture(adapter, {
      records: {
        goal: [
          { id: "goal:g1", label: "Root", parentPath: "" },
          { id: "goal:g2", label: "Child", parentPath: "goal:g1" },
          { id: "goal:g3", label: "Grand", parentPath: "goal:g1-goal:g2" },
        ],
        task: [
          { id: "task:t1", title: "Standalone task" }, // No parentPath
        ],
      },
      joins: {},
    });

    server = await createDatafnServer({ allowUnknownResources: true,
      db: adapter,
      schema,
    });
    router = server.router;
  });

  // TV-HTREE-001
  it("TV-HTREE-001: Correctly expands parent.* and children.**", async () => {
    // Request 1: Get g3 and its ancestors (parent.*)

    // Request 1: Get g3 and its ancestors (parent.*)
    const req1 = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "goal",
        version: 1,
        select: ["id", "parent.*"],
        filters: { id: "goal:g3" },
      }),
    });
    const res1 = await router.handle(req1, {});
    const body1 = await res1.json();
    expect(body1.ok).toBe(true);
    expect(body1.result.data).toHaveLength(1);
    const g3 = body1.result.data[0];
    expect(g3.id).toBe("goal:g3");
    expect(g3.parent).toBeDefined();
    expect(g3.parent).toHaveLength(2);
    // Order: Root -> Parent
    expect(g3.parent[0].id).toBe("goal:g1");
    expect(g3.parent[1].id).toBe("goal:g2");

    // Request 2: Get g1 and its descendants (children.**)
    const req2 = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "goal",
        version: 1,
        select: ["id", "children.**"],
        filters: { id: "goal:g1" },
      }),
    });
    const res2 = await router.handle(req2, {});
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.result.data).toHaveLength(1);
    const g1 = body2.result.data[0];
    expect(g1.id).toBe("goal:g1");
    expect(g1.children).toBeDefined();
    expect(g1.children).toHaveLength(2);
    // Sorted by path len, id
    // g2 path len 1 (goal:g1). g3 path len 2 (goal:g1-goal:g2).
    expect(g1.children[0].id).toBe("goal:g2");
    expect(g1.children[1].id).toBe("goal:g3");
  });

  // TV-HTREE-002: Unsupported htree token forms are rejected
  it("TV-HTREE-002: Rejects parent.**", async () => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "goal",
        version: 1,
        select: ["parent.**"],
      }),
    });
    const res = await router.handle(req, {});
    // Expect 400 Bad Request if validation fails?
    // My validateQuery returns { ok: false, code: ... } which usually results in 400.
    expect(res.status).toBe(400); // Verify API returns 400 for validation error
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNSUPPORTED");
  });

  // Extra: Rejects htree on resource without parentPath
  it("Rejects htree on resource without parentPath", async () => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task", // task has no parentPath
        version: 1,
        select: ["children.*"],
      }),
    });
    const res = await router.handle(req, {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // Expect specific error about missing parentPath support
    expect(body.error.code).toBe("DFQL_UNSUPPORTED");
  });
});
