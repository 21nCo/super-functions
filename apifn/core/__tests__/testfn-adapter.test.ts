import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestCase } from "@testfn/core";
import { ApifnTestAdapter } from "../src/integrations/testfn.js";

const mocks = vi.hoisted(() => {
  return {
    fastGlob: vi.fn(),
    readCollection: vi.fn(),
    runCollection: vi.fn(),
  };
});

vi.mock("fast-glob", () => ({
  default: mocks.fastGlob,
}));

vi.mock("@apifn/collections", () => ({
  readCollection: mocks.readCollection,
  runCollection: mocks.runCollection,
}));

describe("ApifnTestAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TV-TESTFN-001: exposes apifn adapter identity", () => {
    const adapter = new ApifnTestAdapter();

    expect(adapter.name).toBe("apifn");
    expect(adapter.supports("apifn")).toBe(true);
    expect(adapter.supports("APIFN")).toBe(true);
    expect(adapter.supports("vitest")).toBe(false);
  });

  it("TV-TESTFN-002: discovers request-level test cases from opencollection directories", async () => {
    const adapter = new ApifnTestAdapter();
    mocks.fastGlob.mockResolvedValue(["/tmp/work/orders/opencollection.yml"]);
    mocks.readCollection.mockResolvedValue({
      info: { name: "Orders API" },
      environments: {},
      items: [
        { kind: "request", name: "List Orders" },
        {
          kind: "folder",
          name: "Auth",
          children: [{ kind: "request", name: "Login" }],
        },
      ],
    });

    const tests = await adapter.discover(["/tmp/work/orders"]);

    expect(mocks.fastGlob).toHaveBeenCalledWith(
      "/tmp/work/orders/**/opencollection.yml",
      { absolute: true },
    );
    expect(mocks.readCollection).toHaveBeenCalledWith("/tmp/work/orders");
    expect(tests).toHaveLength(2);
    expect(tests.map((t: TestCase) => t.name)).toEqual(["List Orders", "Login"]);
    expect(tests[0]?.suite).toBe("Orders API");
    expect(tests[1]?.suite).toBe("Auth");
  });

  it("TV-TESTFN-003: maps collection request results to testfn result format", async () => {
    const adapter = new ApifnTestAdapter();
    mocks.readCollection.mockResolvedValue({
      info: { name: "Orders API" },
      environments: { default: {} },
      items: [],
    });
    mocks.runCollection.mockResolvedValue({
      results: [
        { name: "List Orders", status: "passed", duration: 11, assertions: [] },
        {
          name: "Create Order",
          status: "failed",
          duration: 22,
          assertions: [{ name: "status is 201", passed: false }],
        },
        { name: "Sync Orders", status: "error", duration: 33, assertions: [], error: "socket hang up", statusCode: 500 },
        { name: "Archive Order", status: "skipped", duration: 0, assertions: [] },
      ],
    });

    const tests: TestCase[] = [
      { id: "t1", file: "/tmp/work/orders", name: "List Orders", suite: "Orders API" },
      { id: "t2", file: "/tmp/work/orders", name: "Create Order", suite: "Orders API" },
      { id: "t3", file: "/tmp/work/orders", name: "Sync Orders", suite: "Orders API" },
      { id: "t4", file: "/tmp/work/orders", name: "Archive Order", suite: "Orders API" },
    ];

    const results = await adapter.run(tests, {});

    expect(results).toHaveLength(4);
    expect(results[0]).toMatchObject({ id: "t1", status: "passed", duration: 11 });
    expect(results[1]).toMatchObject({ id: "t2", status: "failed", duration: 22 });
    expect(results[1]?.error?.message).toContain("status is 201");
    expect(results[2]).toMatchObject({ id: "t3", status: "failed", duration: 33 });
    expect(results[2]?.error?.message).toContain("socket hang up");
    expect(results[3]).toMatchObject({ id: "t4", status: "skipped", duration: 0 });
  });
});
