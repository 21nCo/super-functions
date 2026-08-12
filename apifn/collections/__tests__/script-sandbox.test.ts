import {
  executePreRequestScript,
  executeTestScript,
} from "../src/runner/script-sandbox.js";
import type { AssertionResult } from "../src/types.js";

describe("script sandbox", () => {
  it("RUN-004: pre-request scripts can mutate req and env", async () => {
    const req = {
      method: "GET",
      url: "http://localhost:3000/users",
      headers: { "x-token": "old" },
      body: "{\"ok\":true}",
    };
    const env = {
      token: "abc123",
    };

    const result = await executePreRequestScript({
      code: `
        req.url = req.url + "?source=test";
        req.headers["authorization"] = "Bearer " + env.token;
        env.requestId = "req-1";
      `,
      req,
      env,
    });

    expect(result.error).toBeUndefined();
    expect(req.url).toContain("source=test");
    expect(req.headers.authorization).toBe("Bearer abc123");
    expect(env.requestId).toBe("req-1");
  });

  it("RUN-004: pre-request script error aborts with error result", async () => {
    const result = await executePreRequestScript({
      code: "throw new Error('bad script');",
      req: {
        method: "GET",
        url: "http://localhost:3000/users",
        headers: {},
      },
      env: {},
    });

    expect(result.error?.message).toContain("Pre-request script failed");
    expect(result.error?.message).toContain("bad script");
  });

  it("enforces timeouts for awaited async scripts", async () => {
    const result = await executePreRequestScript({
      code: "await new Promise(() => {});",
      req: {
        method: "GET",
        url: "http://localhost:3000/users",
        headers: {},
      },
      env: {},
      timeoutMs: 20,
    });

    expect(result.error?.message).toContain("Script execution timed out after 20ms");
  });

  it("TV-RUN-005: test script executes and records assertion results", async () => {
    const assertions: AssertionResult[] = [];
    const result = await executeTestScript({
      code: `
        test("should return 200", function() {
          expect(res.status).to.equal(200);
        });
        test("should have items", function() {
          expect(res.body.items).to.have.length.above(0);
        });
      `,
      req: {
        method: "GET",
        url: "http://localhost:3000/items",
        headers: {},
      },
      res: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { items: [{ id: "1" }] },
        responseTime: 40,
      },
      env: {},
      assertionResults: assertions,
    });

    expect(result.error).toBeUndefined();
    expect(assertions).toHaveLength(2);
    expect(assertions[0]).toEqual({ name: "should return 200", passed: true });
    expect(assertions[1]).toEqual({ name: "should have items", passed: true });
  });

  it("TV-RUN-005 negative: failed assertion is recorded", async () => {
    const assertions: AssertionResult[] = [];
    await executeTestScript({
      code: `
        test("should return 200", function() {
          expect(res.status).to.equal(200);
        });
      `,
      req: {
        method: "GET",
        url: "http://localhost:3000/items",
        headers: {},
      },
      res: {
        status: 404,
        headers: { "content-type": "application/json" },
        body: {},
        responseTime: 50,
      },
      env: {},
      assertionResults: assertions,
    });

    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      name: "should return 200",
      passed: false,
      expected: 200,
      actual: 404,
      error: expect.stringContaining("to equal 200"),
    });
  });

  it("sandbox blocks require('fs')", async () => {
    const assertions: AssertionResult[] = [];
    const result = await executeTestScript({
      code: "require('fs').readFileSync('/etc/passwd')",
      req: {
        method: "GET",
        url: "http://localhost:3000/items",
        headers: {},
      },
      res: {
        status: 200,
        headers: {},
        body: {},
        responseTime: 10,
      },
      env: {},
      assertionResults: assertions,
    });

    expect(result.error?.message).toContain("Test script failed");
    expect(assertions[0]?.passed).toBe(false);
  });

  it("exposes safe utility globals and response.json helper", async () => {
    const assertions: AssertionResult[] = [];
    await executeTestScript({
      code: `
        const url = new URL("http://localhost/items?mode=test");
        const id = crypto.randomUUID();
        test("safe globals work", function() {
          expect(url.searchParams.get("mode")).to.equal("test");
          expect(Boolean(id)).to.equal(true);
          expect(atob(btoa("hello"))).to.equal("hello");
          expect(res.json().ok).to.equal(true);
        });
      `,
      req: {
        method: "GET",
        url: "http://localhost:3000/items",
        headers: {},
      },
      res: {
        status: 200,
        headers: {},
        body: { ok: true },
        responseTime: 10,
      },
      env: {},
      assertionResults: assertions,
    });

    expect(assertions[0]?.passed).toBe(true);
  });
});
