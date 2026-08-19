import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { DatafnSchema } from "@datafn/core";
import { seedFixture } from "./helpers/seed-fixture.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "goalId", type: "string", required: false },
      ],
    },
    {
      name: "goal",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "parentPath", type: "string", required: false }, // For HTREE test
      ],
    },
    {
      name: "tag",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "task",
      relation: "goal",
      to: "goal",
      type: "many-one",
      inverse: "tasks",
      fkField: "goalId",
    },
    {
      from: "goal",
      relation: "tasks",
      to: "task",
      type: "one-many",
      inverse: "goal",
      fkField: "goalId",
    },
    {
      from: "task",
      relation: "tags",
      to: "tag",
      type: "many-many",
      inverse: "tasks",
    },
    {
      from: "tag",
      relation: "tasks",
      to: "task", // Corrected
      type: "many-many",
      inverse: "tags",
    },
  ],
};

describe("DFQL Filters (Phase 12)", () => {
  let adapter: any;
  let server: any; // Return type of createDatafnServer
  let router: any;

  beforeEach(async () => {
    adapter = memoryAdapter();
    // memoryAdapter returns adapter that usually doesn't need explicit init calls for tests,
    // or seedFixture handles it.
    // However, existing usage in check showed `new MemoryAdapter`.
    // If memoryAdapter() is a factory returning an object, let's use it.

    // In query-execution.test.ts, it imports memoryAdapter.
    // It calls `adapter = memoryAdapter()`.

    server = await createDatafnServer({ allowUnknownResources: true,
      database: adapter,
      schema,
    });
    router = server.router;
  });

  // TV-DFQL-FILTERPATH-001
  it("TV-DFQL-FILTERPATH-001: Dot-path filters work with default ANY semantics", async () => {
    // Seed data
    await seedFixture(adapter, {
      records: {
        goal: [
          { id: "goal:g1", label: "G1", parentPath: "" },
          { id: "goal:g2", label: "G2", parentPath: "" },
        ],
        task: [
          { id: "task:t1", title: "A", goalId: "goal:g1" },
          { id: "task:t2", title: "B", goalId: "goal:g2" },
        ],
      },
    });

    const req = {
      method: "POST",
      path: "/datafn/query",
      body: {
        resource: "task",
        version: 1,
        select: ["id", "title"],
        filters: { "goal.label": "G1" },
        sort: ["id:asc"],
      },
    };

    const res = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify(req.body),
      }),
    );
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toBeDefined();
    expect(body.result.data).toHaveLength(1);
    expect(body.result.data[0]).toEqual({ id: "task:t1", title: "A" });
  });

  // TV-DFQL-FILTERPATH-002
  it("TV-DFQL-FILTERPATH-002: Unknown dot-path filters rejected", async () => {
    const req = {
      method: "POST",
      path: "/datafn/query",
      body: {
        resource: "task",
        version: 1,
        select: ["id"],
        filters: { "goal.nope": "x" },
      },
    };

    const res = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify(req.body),
      }),
    );
    const body = await res.json();

    // Note: We deliberately allow dot-paths in validation for now (Phase 12 MVP)
    // UNLESS we implemented strict validation.
    // In Step 352, I commented that I allowed dot-paths without strict validation.
    // So this test MIGHT FAIL if I expect rejection but code allows it.
    // If code allows it, `evaluateFilter` will likely fail to find relation or field and return false (empty result).
    // The requirement is REJECTION.
    // So I MUST implement strict validation if I want to pass this test.
    // However, I'll update expectation to verify behavior:
    // Code in `filters.ts`: "If not a relation... treat as field".
    // Code in `db-store.ts`: "Handle dot-path... traverse". If relation not found, it stops traversing.
    // So execution will proceed with "goal.nope" as a field name?
    // `evaluateFilter` falls back to `record["goal.nope"]`.

    // If validation passes, execution happens.
    // Since I bypassed strict validation in `query.ts`, this test checks for 400 ERROR.
    // It will likely get 200 OK with empty data.
    // I should probably skip or update this test expectation, OR implement strict validation.
    // Strict validation is better.
    // But for now, let's execute and see. I won't change expectation yet, I want to fail if it's not rejected.

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
    expect(body.error.details.path).toBe("filters.goal.nope");
  });

  // TV-DFQL-RELQ-001
  it("TV-DFQL-RELQ-001: Relation quantifiers $all/$any/$none", async () => {
    await seedFixture(adapter, {
      records: {
        tag: [
          { id: "tag:urgent", label: "urgent" },
          { id: "tag:home", label: "home" },
          { id: "tag:bug", label: "bug" },
        ],
        task: [
          { id: "task:t1", title: "T1" },
          { id: "task:t2", title: "T2" },
        ],
      },
      joins: {
        "task.tags": [
          // t1 has urgent, home
          { from: "task:t1", to: "tag:urgent", order: 0 },
          { from: "task:t1", to: "tag:home", order: 1 },
          // t2 has urgent, bug
          { from: "task:t2", to: "tag:urgent", order: 0 },
          { from: "task:t2", to: "tag:bug", order: 1 },
        ],
      },
    });

    const req = {
      method: "POST",
      path: "/datafn/query",
      body: {
        resource: "task",
        version: 1,
        select: ["id"],
        filters: {
          tags: {
            $all: { label: ["urgent", "home"] },
          },
        },
        sort: ["id:asc"],
      },
    };

    const res = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify(req.body),
      }),
    );
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([{ id: "task:t1" }]);
  });

  // TV-DFQL-RELQ-002
  it("TV-DFQL-RELQ-002: Unknown relation quantifier keys rejected", async () => {
    const req = {
      method: "POST",
      path: "/datafn/query",
      body: {
        resource: "task",
        version: 1,
        select: ["id"],
        filters: { tags: { $wat: { label: "x" } } },
      },
    };

    const res = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify(req.body),
      }),
    );
    const body = await res.json();

    // Similarly, validation for quantifiers was weak (allowed "tags" because it was Relation?).
    // No, `query.ts`: "if (!fieldNames.has(key)) ... return error".
    // I added "if (key.includes('.')) continue" -> validation skipped for dot paths.
    // But "tags" does not include dot.
    // So "tags" must be in fieldNames? No, "tags" is a relation.
    // `fieldNames` only has fields.
    // In `validateQuery`, `relationNames` are collected but NOT passed to `validateFilters`.
    // And `validateFilters` uses `fieldNames`.
    // So "tags" will be flagged as UNKNOWN FIELD in `query.ts` unless I fixed it.
    // I did NOT fix it fully in `query.ts` step 352. I returned `DFQL_UNKNOWN_FIELD`.
    // So this test expects rejection, which matches my current (incomplete) validation?
    // Wait, if "tags" is rejected, then valid queries will also fail!

    // I MUST fix `query.ts` validation to allow relations.
    // Otherwise `TV-DFQL-RELQ-001` will fail.

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
  });
});
