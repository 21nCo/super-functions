import { describe, expect, it, vi } from "vitest";
import type { DatafnSchema } from "../src/core-types.js";
import type { DataFnEvent } from "../src/events.js";
import { createDatafnServer } from "../src/server.js";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
      ],
    },
  ],
  relations: [],
};

describe("@datafn/server observability events", () => {
  it("emits a typed authorization denial event", async () => {
    const events: DataFnEvent[] = [];
    const authorize = vi.fn().mockResolvedValue(false);
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      authorize,
      observability: {
        events: (event) => events.push(event),
      },
    });

    const response = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": "req_denied" },
        body: JSON.stringify({ resource: "tasks", version: 1 }),
      }),
    );

    expect(response.status).toBe(403);
    const event = events.find((candidate) => candidate.type === "datafn.authorization.denied");
    expect(event).toBeDefined();
    expect(event?.domain).toBe("datafn");
    expect(event?.requestId).toBe("req_denied");
    expect(event?.outcome).toBe("denied");
    if (event?.type === "datafn.authorization.denied") {
      expect(event.metadata?.reason).toBe("authorize-callback");
      expect(event.metadata?.action).toBe("query");
      expect(event.metadata?.path).toBe("/datafn/query");
      expect(event.metadata?.method).toBe("POST");
    }

    server.close();
  });

  it("emits a typed payload rejection event", async () => {
    const events: DataFnEvent[] = [];
    const authorize = vi.fn().mockResolvedValue(false);
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      authorize,
      observability: {
        events: (event) => events.push(event),
      },
    });

    const response = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": "req_bad_json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
    const event = events.find((candidate) => candidate.type === "datafn.payload.rejected");
    expect(event).toBeDefined();
    expect(event?.domain).toBe("datafn");
    expect(event?.requestId).toBe("req_bad_json");
    expect(event?.outcome).toBe("rejected");
    if (event?.type === "datafn.payload.rejected") {
      expect(event.metadata?.reason).toBe("invalid-json");
      expect(event.metadata?.code).toBe("DFQL_INVALID");
      expect(event.metadata?.action).toBe("query");
    }

    server.close();
  });
});
