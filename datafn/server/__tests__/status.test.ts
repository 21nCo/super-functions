/**
 * /datafn/status endpoint tests
 * Tests TV-COMP-001 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";

describe("/datafn/status", () => {
  it("TV-COMP-001: returns correct metadata with schema hash, capabilities, limits, and server time", async () => {
    // Use a fake time for deterministic testing
    const fakeTime = 1737148800000;

    const server = await createDatafnServer({
      schema: {
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "label", type: "string", required: true }],
          },
        ],
      },
      limits: {
        maxLimit: 2, // Match TEST_VECTORS.md default
        maxTransactSteps: 2,
        maxPayloadBytes: 1048576,
      },
      getServerTime: () => fakeTime,
    });

    const req = new Request("http://localhost/datafn/status", {
      method: "GET",
    });
    const res = await server.router.handle(req, {});

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.schemaHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.result.capabilities).toContain("dfql.query");
    expect(body.result.limits).toEqual({
      maxLimit: 2,
      maxTransactSteps: 2,
      maxPayloadBytes: 1048576,
    });
    expect(body.result.serverTimeMs).toBe(fakeTime);
  });

  it("uses default limits when not configured", async () => {
    const server = await createDatafnServer({
      schema: {
        resources: [{ name: "task", version: 1, fields: [] }],
      },
    });

    const req = new Request("http://localhost/datafn/status", {
      method: "GET",
    });
    const res = await server.router.handle(req, {});

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.limits.maxLimit).toBe(100); // default
  });

  it("returns consistent schema hash for the same schema", async () => {
    const schema = {
      resources: [
        {
          name: "goal",
          version: 1,
          fields: [{ name: "label", type: "string", required: true }],
        },
      ],
    };

    const server1 = await createDatafnServer({ schema });
    const server2 = await createDatafnServer({ schema });

    const req = new Request("http://localhost/datafn/status", {
      method: "GET",
    });
    const res1 = await server1.router.handle(req);
    const res2 = await server2.router.handle(req);

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.result.schemaHash).toBe(body2.result.schemaHash);
  });
});
