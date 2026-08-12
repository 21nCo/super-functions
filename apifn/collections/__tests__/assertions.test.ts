import { createAssertionRuntime } from "../src/runner/assertions.js";

describe("assertion runtime", () => {
  it("TV-ASSERT-001: status code assertions pass and fail", async () => {
    const runtime = createAssertionRuntime();

    await runtime.test("status is 200", () => {
      runtime.expect(200).to.equal(200);
    });
    await runtime.test("status is 200 (neg)", () => {
      runtime.expect(404).to.equal(200);
    });

    expect(runtime.getResults()).toEqual([
      { name: "status is 200", passed: true },
      {
        name: "status is 200 (neg)",
        passed: false,
        expected: 200,
        actual: 404,
        error: expect.stringContaining("to equal 200"),
      },
    ]);
  });

  it("TV-ASSERT-002: body property and length assertions", async () => {
    const runtime = createAssertionRuntime();
    const body = { id: "1", name: "John", items: [1, 2, 3, 4, 5] };

    await runtime.test("json field equality", () => {
      runtime.expect(body.name).to.equal("John");
    });
    await runtime.test("has id property", () => {
      runtime.expect(body).to.have.property("id");
    });
    await runtime.test("items length", () => {
      runtime.expect(body.items).to.have.length(5);
    });

    expect(runtime.getResults().every((result) => result.passed)).toBe(true);
  });

  it("TV-ASSERT-003: header include assertion", async () => {
    const runtime = createAssertionRuntime();

    await runtime.test("content-type is json", () => {
      runtime.expect("application/json; charset=utf-8").to.include("application/json");
    });

    expect(runtime.getResults()).toEqual([{ name: "content-type is json", passed: true }]);
  });

  it("TV-ASSERT-004: response time below assertion", async () => {
    const runtime = createAssertionRuntime();

    await runtime.test("response is fast", () => {
      runtime.expect(120).to.be.below(500);
    });

    expect(runtime.getResults()).toEqual([{ name: "response is fast", passed: true }]);
  });

  it("TV-ASSERT-005: JSON path assertions", async () => {
    const runtime = createAssertionRuntime();
    const body = { users: [{ name: "Alice" }] };

    await runtime.test("first user is Alice", () => {
      runtime.expect(body).to.have.jsonPath("$.users[0].name", "Alice");
    });

    expect(runtime.getResults()).toEqual([{ name: "first user is Alice", passed: true }]);
  });

  it("TV-ASSERT-006: schema validation assertions include errors", async () => {
    const runtime = createAssertionRuntime();

    await runtime.test("schema match", () => {
      runtime.expect({ id: "1", active: true }).to.matchSchema({
        type: "object",
        required: ["id", "active"],
        properties: {
          id: { type: "string" },
          active: { type: "boolean" },
        },
      });
    });
    await runtime.test("schema mismatch", () => {
      runtime.expect({ id: 1 }).to.matchSchema({
        type: "object",
        required: ["id", "active"],
        properties: {
          id: { type: "string" },
          active: { type: "boolean" },
        },
      });
    });

    const results = runtime.getResults();
    expect(results[0]).toEqual({ name: "schema match", passed: true });
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.error).toContain("Schema validation failed");
    expect(results[1]?.error).toContain("$.id should be string");
  });

  it("TV-ASSERT-007: custom assertion function failures are captured", async () => {
    const runtime = createAssertionRuntime();

    await runtime.test("custom check", () => {
      const response = { status: 500 };
      if (response.status >= 400) {
        throw new Error("status must be < 400");
      }
    });

    expect(runtime.getResults()).toEqual([
      {
        name: "custom check",
        passed: false,
        error: "status must be < 400",
      },
    ]);
  });
});
