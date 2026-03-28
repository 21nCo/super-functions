import { describe, test, expectTypeOf } from "vitest";
import { createDatafnClient, type DatafnClient } from "../src/client.js";
import type { DatafnSchema, DfqlQueryFragment } from "@datafn/core";

// Dummy schema for testing
const schema = {
  resources: [
    { name: "tasks", version: 1, fields: [] },
    { name: "users", version: 1, fields: [] },
  ],
} as const satisfies DatafnSchema;

type MySchema = typeof schema;

describe("DatafnClient Types", () => {
  test("client.<tableName> is typed", () => {
    const client = createDatafnClient({
      schema,
      sync: {
        remote: "http://example.com/api",
      },
      clientId: "test-client",
    });

    // Positive cases
    expectTypeOf(client.tasks).not.toBeAny();
    expectTypeOf(client.tasks.query).toBeFunction();
    expectTypeOf(client.users).not.toBeAny();

    // Negative cases (commented out as they are compile-time checks,
    // but expectation is that these would fail compilation if uncommented)
    // @ts-expect-error - unknown table
    expect(() => client.unknownTable).toThrow();
  });

  test("client.table(name) is typed", () => {
    const client = createDatafnClient({
      schema,
      sync: {
        remote: "http://example.com/api",
      },
      clientId: "test-client",
    });

    // Positive
    client.table("tasks");

    // Negative
    // @ts-expect-error - unknown table string
    expect(() => client.table("unknown")).toThrow();
  });

  test("DatafnTable accepts DfqlQueryFragment", () => {
    const client = createDatafnClient({
      schema,
      sync: {
        remote: "http://example.com/api",
      },
      clientId: "test-client",
    });

    const q: DfqlQueryFragment = { select: ["id"] };
    client.tasks.query(q);

    // @ts-expect-error - invalid fragment key
    client.tasks.query({ unknownKey: 123 });
  });
});
