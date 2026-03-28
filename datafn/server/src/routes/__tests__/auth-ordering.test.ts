/**
 * AUTH-001: Invalid JSON Ordering Tests
 *
 * Verifies that:
 * 1. Invalid JSON returns DFQL_INVALID (not FORBIDDEN)
 * 2. Valid JSON denied by auth returns FORBIDDEN
 * 3. Valid JSON authorized executes normally
 * 4. GET /datafn/status calls authorize with null payload
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnServer } from "../../server.js";
import type { DatafnSchema } from "../../core-types.js";

async function readJson(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

// Simple test schema
const testSchema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: false },
      ],
    },
  ],
  relations: [],
};

describe("AUTH-001: Invalid JSON Ordering", () => {
  describe("TV-AUTH-INV-JSON-002: Invalid JSON returns DFQL_INVALID, not FORBIDDEN", () => {
    it("should return DFQL_INVALID for invalid JSON on POST /datafn/query", async () => {
      // Create server with auth that always denies
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      // Send request with invalid JSON
      const request = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json}",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      // MUST return DFQL_INVALID, NOT FORBIDDEN
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toBe("Invalid JSON");
      expect(body.error.details.path).toBe("$");

      // CRITICAL: authorize() must NOT have been called
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for invalid JSON on POST /datafn/mutation", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json at all",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toBe("Invalid JSON");
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for invalid JSON on POST /datafn/transact", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/transact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{\"steps\": [",  // incomplete JSON
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for empty body on POST endpoints", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });
  });

  describe("TV-AUTH-INV-JSON-003: Valid JSON denied by auth returns FORBIDDEN", () => {
    it("should return FORBIDDEN when auth denies valid JSON", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const validBody = JSON.stringify({
        resource: "tasks",
        version: "1",
        filters: {},
      });

      const request = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: validBody,
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Authorization denied");
      expect(body.error.details.path).toBe("$");

      // authorize() MUST have been called with parsed payload
      expect(authorizeFn).toHaveBeenCalledTimes(1);
      expect(authorizeFn).toHaveBeenCalledWith(
        expect.anything(),
        "query",
        expect.objectContaining({ resource: "tasks" })
      );
    });

    it("should call authorize with parsed payload, not null", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const validBody = JSON.stringify({
        resource: "tasks",
        version: "1",
        filters: { status: "active" },
      });

      const request = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: validBody,
      });

      await server.router.handle(request);

      // Verify authorize was called with the parsed body (not null)
      expect(authorizeFn).toHaveBeenCalledWith(
        expect.anything(),
        "mutation",
        expect.objectContaining({
          resource: "tasks",
          filters: { status: "active" },
        })
      );

      // Verify it was NOT called with null
      const [, , payload] = authorizeFn.mock.calls[0];
      expect(payload).not.toBeNull();
    });
  });

  describe("TV-AUTH-INV-JSON-001: Valid JSON with auth executes normally", () => {
    it("should execute handler when auth allows valid JSON", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(true);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const validBody = JSON.stringify({
        resource: "tasks",
        version: "1",
        filters: {},
      });

      const request = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: validBody,
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      // Should reach handler (may fail for other reasons like no DB, but not FORBIDDEN)
      // The important thing is authorize was called and didn't block
      expect(authorizeFn).toHaveBeenCalledTimes(1);
      expect(body.error?.code).not.toBe("FORBIDDEN");
    });
  });

  describe("GET /datafn/status calls authorize with null payload", () => {
    it("should call authorize with null payload for GET /datafn/status", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(true);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/status", {
        method: "GET",
      });

      await server.router.handle(request);

      // Verify authorize was called with null payload (no body for GET)
      expect(authorizeFn).toHaveBeenCalledTimes(1);
      expect(authorizeFn).toHaveBeenCalledWith(
        expect.anything(),
        "status",
        null
      );
    });

    it("should return FORBIDDEN for GET /datafn/status when auth denies", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/status", {
        method: "GET",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(authorizeFn).toHaveBeenCalledWith(
        expect.anything(),
        "status",
        null
      );
    });
  });

  describe("All sync endpoints handle invalid JSON correctly", () => {
    it("should return DFQL_INVALID for invalid JSON on POST /datafn/clone", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for invalid JSON on POST /datafn/pull", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "[invalid",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for invalid JSON on POST /datafn/push", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"clientId": }',
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });

    it("should return DFQL_INVALID for invalid JSON on POST /datafn/seed", async () => {
      const authorizeFn = vi.fn().mockResolvedValue(false);
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: authorizeFn,
      });

      const request = new Request("http://localhost/datafn/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null null",
      });

      const response = await server.router.handle(request);
      const body = await readJson(response);

      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(authorizeFn).not.toHaveBeenCalled();
    });
  });
});
