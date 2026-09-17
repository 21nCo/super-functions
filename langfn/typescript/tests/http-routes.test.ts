import { describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import { MockChatModel } from "../src/models/mock.js";
import { createLangFnRouter } from "../src/http/routes.js";

describe("langfn http routes", () => {
  it("serves anonymous health with the canonical success envelope", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel() }));
    const response = await router.handle(new Request("http://localhost/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      traceId: null,
      data: { status: "ok", name: "langfn", version: "0.1.0" },
      error: null
    });
  });

  it("rejects unauthenticated non-health routes with AUTH_REQUIRED", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["hello"] }) }), {
      auth: {
        validateBearerToken: async () => null
      }
    });

    const response = await router.handle(
      new Request("http://localhost/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "hi" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("AUTH_REQUIRED");
    expect(body.ok).toBe(false);
  });

  it("returns VALIDATION_ERROR for invalid request bodies", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["hello"] }) }), {
      auth: {
        validateBearerToken: async () => ({
          id: "sess_1",
          type: "bearer",
          subject: { actorId: "user_1", actorType: "user", tenantId: "tenant_1" }
        })
      }
    });

    const response = await router.handle(
      new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json"
        },
        body: JSON.stringify({ prompt: "" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues[0].message).toContain("prompt");
  });

  it("rejects oversized JSON bodies before parsing with a canonical 413 response", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["hello"] }) }), {
      maxBodyBytes: 16
    });

    const response = await router.handle(
      new Request("http://localhost/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "this body is too large" })
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE" }
    });
  });

  it("applies a safe request-body limit by default", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["hello"] }) }));
    const response = await router.handle(
      new Request("http://localhost/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "x".repeat(1024 * 1024) })
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE" }
    });
  });

  it("uses authenticated identity despite spoofed tenant headers into metadata and rate limit keys", async () => {
    const observed: Record<string, unknown> = {};
    const router = createLangFnRouter(
      new LangFn({
        model: new MockChatModel({
          complete: async (request) => {
            observed.metadata = request.metadata;
            return {
              content: "done",
              traceId: "trace_http_1",
              trace_id: "trace_http_1"
            };
          }
        })
      }),
      {
        auth: {
          validateBearerToken: async () => ({
            id: "sess_1",
            type: "bearer",
            subject: { actorId: "user_from_session", actorType: "user", tenantId: "tenant_from_session" }
          })
        },
        rateLimit: {
          provider: {
            consume(input) {
              observed.rateLimitKey = input.key;
              observed.rateLimitTenantContext = input.tenantContext;
              return { allowed: true, key: input.key, remaining: 4 };
            }
          }
        }
      }
    );

    const response = await router.handle(
      new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
          "x-tenant-id": "tenant_header",
          "x-user-id": "user_header",
          "x-run-id": "run_123",
          "x-conversation-id": "conv_456"
        },
        body: JSON.stringify({
          prompt: "hello",
          metadata: { source: "test" }
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(observed.rateLimitKey).toBe("tenant_from_session:user_from_session:/complete");
    expect(observed.rateLimitTenantContext).toEqual({
      tenantId: "tenant_from_session",
      userId: "user_from_session",
      runId: "run_123",
      conversationId: "conv_456"
    });
    expect(observed.metadata).toEqual({
      source: "test",
      tenantId: "tenant_from_session",
      userId: "user_from_session",
      runId: "run_123",
      conversationId: "conv_456"
    });
    expect(body).toMatchObject({
      ok: true,
      data: {
        content: "done"
      },
      error: null
    });
    expect(body.traceId).toBeTruthy();
  });

  it("returns RATE_LIMITED when the configured provider blocks the request", async () => {
    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["ignored"] }) }), {
      auth: {
        validateBearerToken: async () => ({
          id: "sess_1",
          type: "bearer",
          subject: { actorId: "user_1", actorType: "user", tenantId: "tenant_1" }
        })
      },
      rateLimit: {
        provider: {
          consume(input) {
            return {
              allowed: false,
              key: input.key,
              remaining: 0,
              retryAfterMs: 3_000
            };
          }
        }
      }
    });

    const response = await router.handle(
      new Request("http://localhost/chat", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }]
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("emits canonical SSE frames for the stream route", async () => {
    const router = createLangFnRouter(
      new LangFn({
        model: new MockChatModel({
          streams: [[
            { type: "content", content: "hello", delta: "hello" },
            { type: "token_usage", prompt_tokens: 1, completion_tokens: 1 },
            { type: "end", finish_reason: "stop" }
          ]]
        })
      }),
      {
        auth: {
          validateBearerToken: async () => ({
            id: "sess_1",
            type: "bearer",
            subject: { actorId: "user_1", actorType: "user", tenantId: "tenant_1" }
          })
        }
      }
    );

    const response = await router.handle(
      new Request("http://localhost/stream", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json"
        },
        body: JSON.stringify({ prompt: "stream please" })
      })
    );
    const text = await response.text();
    const frames = text
      .trim()
      .split("\n\n")
      .map((chunk) => chunk.replace(/^data:\s*/, ""))
      .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(frames[0]).toMatchObject({
      type: "content",
      content: "hello",
      delta: "hello"
    });
    expect(frames[0].traceId ?? frames[0].trace_id).toBeTruthy();
    expect(frames.at(-1)).toMatchObject({ type: "end", finish_reason: "stop" });
  });
});
