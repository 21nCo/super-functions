import { describe, test, expectTypeOf } from "vitest";
import type { DfqlQuery, DfqlMutation, DfqlTransact } from "../src";

describe("DFQL Types", () => {
  test("DfqlQuery structure", () => {
    const q: DfqlQuery = {
      resource: "tasks",
      version: 1,
      select: ["id", "title"],
      filters: { status: "pending" },
      limit: 10,
    };
    expectTypeOf(q).toMatchTypeOf<DfqlQuery>();
  });

  test("DfqlMutation structure", () => {
    const m: DfqlMutation = {
      resource: "tasks",
      version: 1,
      operation: "create",
      record: { title: "New Task" },
      clientId: "client-1",
    };
    expectTypeOf(m).toMatchTypeOf<DfqlMutation>();
  });

  test("DfqlTransact structure", () => {
    const t: DfqlTransact = {
      atomic: true,
      steps: [
        {
          mutation: {
            resource: "tasks",
            version: 1,
            operation: "create",
          },
        },
      ],
    };
    expectTypeOf(t).toMatchTypeOf<DfqlTransact>();
  });
});
