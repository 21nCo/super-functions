import { describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../src/server.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
      ],
    },
  ],
};

describe("DataFn route hooks", () => {
  it("applies response hooks and headers with parsed payload and context", async () => {
    const database = memoryAdapter({ namespace: "datafn" });
    const context = vi.fn(() => ({ actorId: "user:1" }));
    const seen = {
      action: "",
      actorId: "",
      resource: "",
    };
    const server = await createDatafnServer({
      schema,
      database,
      allowUnknownResources: true,
      context,
      routeHooks: {
        afterResponse: async ({ action, context, payload, response }) => {
          const body = await response.json();
          seen.action = action;
          seen.actorId = (context as { actorId?: string }).actorId ?? "";
          seen.resource = (payload as { resource?: string }).resource ?? "";
          return Response.json({
            ...body,
            hooked: true,
          }, {
            status: response.status,
            headers: response.headers,
          });
        },
        headers: {
          "x-datafn-region": "test-region",
        },
      },
    });

    const response = await server.router.handle(new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "title"],
      }),
    }));
    const body = await response.json();

    expect(response.headers.get("x-datafn-region")).toBe("test-region");
    expect(body.hooked).toBe(true);
    expect(seen).toEqual({
      action: "query",
      actorId: "user:1",
      resource: "task",
    });
    expect(context).toHaveBeenCalledTimes(1);
    await server.close();
  });
});
