import { createCookieJar, runCollection } from "../src/index.js";
import type { Collection, HttpClient, HttpClientRequest, HttpClientResponse, RunReporter } from "../src/types.js";

function makeCollection(): Collection {
  return {
    info: { name: "Runner Test", type: "collection" },
    rootDir: "/tmp",
    environments: {
      development: {
        name: "development",
        variables: {
          baseUrl: "http://localhost:3000",
          apiVersion: "v1",
          apiKey: "env-key",
        },
      },
    },
    items: [
      {
        kind: "folder",
        name: "Root",
        path: "root",
        children: [
          {
            kind: "request",
            name: "First",
            path: "root/first.yml",
            seq: 1,
            request: {
              info: { name: "First", type: "http", seq: 1 },
              http: { method: "GET", url: "{{baseUrl}}/{{apiVersion}}/first" },
            },
          },
          {
            kind: "request",
            name: "Second",
            path: "root/second.yml",
            seq: 2,
            request: {
              info: { name: "Second", type: "http", seq: 2 },
              http: {
                method: "GET",
                url: "{{baseUrl}}/second",
                headers: [{ name: "Authorization", value: "Bearer {{apiKey}}" }],
              },
            },
          },
          {
            kind: "request",
            name: "Third",
            path: "root/third.yml",
            seq: 3,
            request: {
              info: { name: "Third", type: "http", seq: 3 },
              http: { method: "GET", url: "{{baseUrl}}/third" },
            },
          },
        ],
      },
    ],
  };
}

function response(status = 200, body = "{}", duration = 1): HttpClientResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body,
    size: Buffer.byteLength(body, "utf8"),
    duration,
  };
}

describe("runCollection", () => {
  it("TV-RUN-001: executes sequentially in seq order", async () => {
    const collection = makeCollection();
    const calls: string[] = [];

    const httpClient: HttpClient = {
      async send(request) {
        calls.push(request.url);
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      httpClient,
    });

    expect(calls).toEqual([
      "http://localhost:3000/v1/first",
      "http://localhost:3000/second",
      "http://localhost:3000/third",
    ]);
    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(3);
  });

  it("RUN-002: executes in parallel with concurrency", async () => {
    const collection = makeCollection();
    let active = 0;
    let maxActive = 0;

    const httpClient: HttpClient = {
      async send() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      parallel: true,
      concurrency: 2,
      httpClient,
    });

    expect(report.summary.passed).toBe(3);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("parallel mode isolates script-mutated variables per request", async () => {
    const collection = makeCollection();
    collection.environments.development.variables.token = "env-token";
    const first = collection.items[0]!.children![0]!;
    const second = collection.items[0]!.children![1]!;
    first.request!.http.url = "{{baseUrl}}/first";
    second.request!.http.url = "{{baseUrl}}/{{token}}/second";
    first.request!.runtime = {
      scripts: [{ type: "pre-request", code: 'env.set("token", "first-token");' }],
    };
    second.request!.runtime = {
      scripts: [{ type: "pre-request", code: 'env.set("token", "second-token");' }],
    };
    collection.items[0]!.children = [first, second];

    const calls: string[] = [];
    const httpClient: HttpClient = {
      async send(request) {
        calls.push(request.url);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      parallel: true,
      concurrency: 1,
      httpClient,
    });

    expect(report.summary.passed).toBe(2);
    expect(calls).toEqual([
      "http://localhost:3000/first",
      "http://localhost:3000/env-token/second",
    ]);
  });

  it("RUN-003 + TV-RUN-003 + TV-RUN-004: resolves variables with precedence and warnings", async () => {
    const collection = makeCollection();
    collection.items[0]!.children![0]!.request!.http.url = "{{baseUrl}}/{{missing}}/first";

    const captured: HttpClientRequest[] = [];
    const httpClient: HttpClient = {
      async send(request) {
        captured.push(request);
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      overrides: { baseUrl: "http://override:3000", apiKey: "override-key" },
      httpClient,
    });

    expect(captured[0]?.url).toBe("http://override:3000/{{missing}}/first");
    expect(captured[1]?.headers.Authorization).toBe("Bearer override-key");
    expect(report.results[0]?.warnings).toContain("Unresolved variable: missing");
  });

  it("RUN-004 + RUN-005 + TV-RUN-005: runs pre-request and test scripts", async () => {
    const collection = makeCollection();
    const first = collection.items[0]!.children![0]!;
    first.request!.http.url = "{{baseUrl}}/dynamic";
    first.request!.runtime = {
      scripts: [
        {
          type: "pre-request",
          code: `
            req.url = req.url + "?mode=scripted";
            req.headers["x-runtime"] = "yes";
            env.token = "runtime-token";
          `,
        },
        {
          type: "tests",
          code: `
            test("should return 200", function() {
              expect(res.status).to.equal(200);
            });
            test("should have items", function() {
              expect(res.body.items).to.have.length.above(0);
            });
          `,
        },
      ],
    };
    collection.items[0]!.children = [first];

    const calls: HttpClientRequest[] = [];
    const httpClient: HttpClient = {
      async send(request) {
        calls.push(request);
        return response(200, JSON.stringify({ items: [{ id: "1" }] }), 20);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      httpClient,
      bail: true,
    });

    expect(calls[0]?.url).toContain("mode=scripted");
    expect(calls[0]?.headers["x-runtime"]).toBe("yes");
    expect(report.results[0]?.assertions).toEqual([
      { name: "should return 200", passed: true },
      { name: "should have items", passed: true },
    ]);
  });

  it("caps captured response bodies by UTF-8 byte length", async () => {
    const collection = makeCollection();
    collection.items[0]!.children = [collection.items[0]!.children![0]!];
    const maxCapturedBodyBytes = 10 * 1024 * 1024;
    const body = "界".repeat(Math.ceil(maxCapturedBodyBytes / 3) + 10);

    const httpClient: HttpClient = {
      async send() {
        return response(200, body);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      httpClient,
    });

    const capturedBody = report.results[0]?.response?.body ?? "";
    expect(Buffer.byteLength(capturedBody, "utf8")).toBeLessThanOrEqual(maxCapturedBodyBytes);
    expect(capturedBody).not.toContain("\uFFFD");
  });

  it("RUN-006: bail stops after first failed request and skips remaining", async () => {
    const collection = makeCollection();

    const httpClient: HttpClient = {
      async send(request) {
        if (request.url.includes("first")) {
          return response(500, "boom");
        }
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      bail: true,
      httpClient,
    });

    expect(report.results[0]?.status).toBe("failed");
    expect(report.results[1]?.status).toBe("skipped");
    expect(report.results[2]?.status).toBe("skipped");
    expect(report.summary.skipped).toBe(2);
  });

  it("TV-RUN-007: enforces timeout", async () => {
    const collection = makeCollection();

    const httpClient: HttpClient = {
      async send() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      timeout: 50,
      httpClient,
      bail: true,
    });

    expect(report.results[0]?.status).toBe("error");
    expect(report.results[0]?.error).toContain("Request timed out after 50ms");
  });

  it("RUN-008: retries failed requests and records attempts", async () => {
    const collection = makeCollection();
    let attemptCount = 0;

    const httpClient: HttpClient = {
      async send() {
        attemptCount += 1;
        if (attemptCount < 3) {
          throw new Error("Transient error");
        }
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      retries: 2,
      httpClient,
      bail: true,
    });

    expect(report.results[0]?.status).toBe("passed");
    expect(report.results[0]?.attempts).toHaveLength(3);
  });

  it("RUN-010 + RUN-011: report shape and request/response capture with redaction/truncation", async () => {
    const collection = makeCollection();
    const largeBody = "x".repeat(11 * 1024 * 1024);

    const httpClient: HttpClient = {
      async send() {
        return response(200, largeBody);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      httpClient,
      bail: true,
      redactHeaders: ["authorization"],
    });

    const first = report.results[0]!;
    expect(report.id).toBeTruthy();
    expect(report.collectionName).toBe("Runner Test");
    expect(report.summary.total).toBe(3);
    expect(first.request.method).toBe("GET");
    expect(first.response?.status).toBe(200);

    const second = report.results[1]!;
    expect(second.request.headers.Authorization).toBe("[REDACTED]");
    expect(first.response?.body.length).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it("RUN-009: reporter callbacks are emitted", async () => {
    const collection = makeCollection();
    const events: string[] = [];

    const reporter: RunReporter = {
      onStart() {
        events.push("start");
      },
      onRequestStart(item) {
        events.push(`request-start:${item.name}`);
      },
      onRequestComplete(result) {
        events.push(`request-complete:${result.name}`);
      },
      onComplete() {
        events.push("complete");
      },
    };

    const httpClient: HttpClient = {
      async send() {
        return response(200);
      },
    };

    await runCollection(collection, {
      environment: "development",
      reporter,
      httpClient,
    });

    expect(events[0]).toBe("start");
    expect(events).toContain("request-start:First");
    expect(events).toContain("request-complete:Third");
    expect(events[events.length - 1]).toBe("complete");
  });

  it("supports include/exclude filters and marks non-matching requests skipped", async () => {
    const collection = makeCollection();
    const calls: string[] = [];
    const httpClient: HttpClient = {
      async send(request) {
        calls.push(request.url);
        return response(200);
      },
    };

    const report = await runCollection(collection, {
      environment: "development",
      include: ["*second*"],
      exclude: ["*third*"],
      httpClient,
    });

    expect(calls).toEqual(["http://localhost:3000/second"]);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.skipped).toBe(2);
  });

  it("applies sequential delay between requests", async () => {
    const collection = makeCollection();
    const started = Date.now();

    await runCollection(collection, {
      environment: "development",
      delay: 20,
      httpClient: {
        async send() {
          return response(200);
        },
      },
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("redacts sensitive request and response bodies", async () => {
    const collection = makeCollection();
    const first = collection.items[0]!.children![0]!;
    first.request!.http.method = "POST";
    first.request!.http.body = {
      type: "json",
      data: JSON.stringify({ email: "person@example.com", password: "secret", token: "tok" }),
    };
    collection.items[0]!.children = [first];

    const report = await runCollection(collection, {
      environment: "development",
      httpClient: {
        async send() {
          return response(200, JSON.stringify({ token: "secret-token", ok: true }));
        },
      },
    });

    expect(report.results[0]?.request.body).toContain("[REDACTED]");
    expect(report.results[0]?.request.body).not.toContain("secret");
    expect(report.results[0]?.response?.body).not.toContain("secret-token");
  });

  it("passes cookie jar helpers into scripts", async () => {
    const collection = makeCollection();
    const first = collection.items[0]!.children![0]!;
    first.request!.runtime = {
      scripts: [
        {
          type: "pre-request",
          code: `
            cookies.set("session", "abc", req.url);
            req.headers.cookie = "session=" + cookies.get("session", req.url);
          `,
        },
        {
          type: "tests",
          code: `
            test("cookie helper is available", function() {
              expect(cookies.get("session", req.url)).to.equal("abc");
            });
          `,
        },
      ],
    };
    collection.items[0]!.children = [first];

    const report = await runCollection(collection, {
      environment: "development",
      cookieJar: createCookieJar(),
      httpClient: {
        async send(request) {
          expect(request.headers.cookie).toBe("session=abc");
          return response(200);
        },
      },
    });

    expect(report.summary.passed).toBe(1);
  });
});
