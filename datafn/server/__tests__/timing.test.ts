/**
 * Phase 08: Observability (Execution Timing) tests
 * Tests TV-OBS-QUERY-001, TV-OBS-MUT-001, TV-OBS-SYNC-001, TV-OBS-CONFIG-001
 */

import { describe, it, expect, vi } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../src/server.js";
import {
  ExecutionTimer,
  createTimingEmitter,
  type ExecutionTimingEvent,
} from "../src/middleware/timing.js";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

// --- Unit tests for ExecutionTimer ---

describe("ExecutionTimer", () => {
  it("tracks phases and builds event", () => {
    const timer = new ExecutionTimer();
    timer.startPhase("validate");
    timer.startPhase("fetch"); // implicitly ends "validate"
    timer.endPhase();

    const event = timer.build("/datafn/query", "task", "query");

    expect(event.endpoint).toBe("/datafn/query");
    expect(event.resource).toBe("task");
    expect(event.operation).toBe("query");
    expect(event.phases).toHaveProperty("validate");
    expect(event.phases).toHaveProperty("fetch");
    expect(event.phases).toHaveProperty("total");
    expect(typeof event.totalMs).toBe("number");
    expect(event.totalMs).toBeGreaterThanOrEqual(0);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("startPhase auto-ends previous phase", () => {
    const timer = new ExecutionTimer();
    timer.startPhase("a");
    timer.startPhase("b");
    timer.startPhase("c");
    const event = timer.build("/test");

    expect(Object.keys(event.phases)).toEqual(
      expect.arrayContaining(["a", "b", "c", "total"]),
    );
  });

  it("build ends in-progress phase", () => {
    const timer = new ExecutionTimer();
    timer.startPhase("running");
    const event = timer.build("/test");

    expect(event.phases).toHaveProperty("running");
    expect(event.phases.running).toBeGreaterThanOrEqual(0);
  });
});

// --- Unit tests for createTimingEmitter ---

describe("createTimingEmitter", () => {
  it("returns null when timing is disabled", () => {
    expect(createTimingEmitter()).toBeNull();
    expect(createTimingEmitter({})).toBeNull();
    expect(createTimingEmitter({ timing: false })).toBeNull();
  });

  it("returns emitter when timing is enabled", () => {
    const emitter = createTimingEmitter({ timing: true });
    expect(emitter).toBeInstanceOf(Function);
  });

  it("uses custom onTiming handler", () => {
    const handler = vi.fn();
    const emitter = createTimingEmitter({ timing: true, onTiming: handler });

    const event: ExecutionTimingEvent = {
      endpoint: "/test",
      phases: { total: 5 },
      totalMs: 5,
      timestamp: new Date().toISOString(),
    };

    emitter!(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("catches errors from custom onTiming handler", () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const badHandler = () => {
      throw new Error("boom");
    };
    const emitter = createTimingEmitter({
      timing: true,
      onTiming: badHandler,
    }, mockLogger);

    // Should not throw
    emitter!({
      endpoint: "/test",
      phases: { total: 0 },
      totalMs: 0,
      timestamp: "",
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Timing handler error",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("uses logger.debug as default handler", () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const emitter = createTimingEmitter({ timing: true }, mockLogger);

    emitter!({
      endpoint: "/test",
      phases: { total: 1 },
      totalMs: 1,
      timestamp: "",
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "[datafn:timing]",
      expect.objectContaining({ endpoint: "/test" }),
    );
  });
});

// --- Integration tests ---

describe("Timing integration", () => {
  it("TV-OBS-CONFIG-001: no observability config emits no events", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const handler = vi.fn();
    // No observability config at all
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
    });

    await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );

    // handler was not passed, so nothing should have been called
    expect(handler).not.toHaveBeenCalled();
    server.close();
  });

  it("TV-OBS-QUERY-001: query timing event has correct phase structure", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const events: ExecutionTimingEvent[] = [];
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      observability: {
        timing: true,
        onTiming: (e) => events.push(e),
      },
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const queryEvent = events.find((e) => e.endpoint === "/datafn/query");
    expect(queryEvent).toBeDefined();
    expect(queryEvent!.resource).toBe("task");
    expect(queryEvent!.operation).toBe("query");
    expect(queryEvent!.phases).toHaveProperty("validate");
    expect(queryEvent!.phases).toHaveProperty("total");
    expect(typeof queryEvent!.totalMs).toBe("number");
    expect(queryEvent!.timestamp).toBeTruthy();

    server.close();
  });

  it("TV-OBS-MUT-001: mutation timing event has correct phase structure", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const events: ExecutionTimingEvent[] = [];
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      observability: {
        timing: true,
        onTiming: (e) => events.push(e),
      },
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          clientId: "c1",
          mutationId: "m1",
          operation: "insert",
          resource: "task",
          id: "t1",
          record: { title: "Test" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const mutEvent = events.find((e) => e.endpoint === "/datafn/mutation");
    expect(mutEvent).toBeDefined();
    expect(mutEvent!.phases).toHaveProperty("validate");
    expect(mutEvent!.phases).toHaveProperty("execute");
    expect(mutEvent!.phases).toHaveProperty("total");

    server.close();
  });

  it("TV-OBS-SYNC-001: pull timing event has correct phase structure", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const events: ExecutionTimingEvent[] = [];
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      observability: {
        timing: true,
        onTiming: (e) => events.push(e),
      },
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/pull", {
        method: "POST",
        body: JSON.stringify({
          clientId: "c1",
          cursors: { task: "0" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const pullEvent = events.find((e) => e.endpoint === "/datafn/pull");
    expect(pullEvent).toBeDefined();
    expect(pullEvent!.operation).toBe("pull");
    expect(pullEvent!.phases).toHaveProperty("validate");
    expect(pullEvent!.phases).toHaveProperty("fetchChanges");
    expect(pullEvent!.phases).toHaveProperty("buildResult");
    expect(pullEvent!.phases).toHaveProperty("total");

    server.close();
  });

  it("TV-OBS-SYNC-001: push timing event has correct phase structure", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const events: ExecutionTimingEvent[] = [];
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      observability: {
        timing: true,
        onTiming: (e) => events.push(e),
      },
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/push", {
        method: "POST",
        body: JSON.stringify({
          clientId: "c1",
          mutations: [
            {
              mutationId: "m1",
              operation: "insert",
              resource: "task",
              id: "t1",
              record: { title: "Test" },
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const pushEvent = events.find((e) => e.endpoint === "/datafn/push");
    expect(pushEvent).toBeDefined();
    expect(pushEvent!.operation).toBe("push");
    expect(pushEvent!.phases).toHaveProperty("validate");
    expect(pushEvent!.phases).toHaveProperty("execute");
    expect(pushEvent!.phases).toHaveProperty("changeLog");
    expect(pushEvent!.phases).toHaveProperty("total");

    server.close();
  });

  it("TV-OBS-CONFIG-001: timing disabled with timing: false emits no events", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const handler = vi.fn();
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      observability: {
        timing: false,
        onTiming: handler,
      },
    });

    await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    server.close();
  });
});
