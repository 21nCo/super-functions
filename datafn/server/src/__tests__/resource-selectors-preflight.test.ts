import { afterEach, describe, expect, it } from "vitest";
import {
  DATAFN_REQUEST_ACTIONS,
  extractStructuralResourceSelectors,
} from "@datafn/core";
import { createDatafnServer } from "../server.js";
import type { DataFnAction } from "../events.js";

describe("structural resource-selector preflight", () => {
  const servers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0, servers.length).map((server) => server.close()));
  });

  it("keeps DataFnAction aligned with the core protocol inventory", () => {
    const actions: readonly DataFnAction[] = DATAFN_REQUEST_ACTIONS;
    expect(actions).toEqual([
      "status",
      "query",
      "mutation",
      "transact",
      "search",
      "seed",
      "clone",
      "pull",
      "push",
      "reconcile",
    ]);
  });

  it("lets authorize plugins preflight selectors without payload traversal", async () => {
    const seen: string[][] = [];
    const server = await createDatafnServer({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [{ name: "title", type: "string", required: true }],
            permissions: {
              read: { fields: ["title"] },
              write: { fields: [] },
            },
          },
        ],
      },
      authorize: (_context, action, payload) => {
        const extracted = extractStructuralResourceSelectors(action, payload);
        if (!extracted.ok) return false;
        seen.push([...extracted.result.selectors]);
        return extracted.result.selectors.every((resource) => resource === "tasks");
      },
    });
    servers.push(server);

    const allowed = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          filters: { metadata: { resource: "secrets" } },
          record: { resources: ["billing"] },
        }),
      }),
    );
    expect(allowed.status).not.toBe(403);
    expect(seen).toEqual([["tasks"]]);

    const denied = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "billing",
          filters: { metadata: { resource: "tasks" } },
        }),
      }),
    );
    const deniedBody = (await denied.json()) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(deniedBody.ok).toBe(false);
    expect(deniedBody.error?.code).toBe("FORBIDDEN");
    expect(seen).toEqual([["tasks"], ["billing"]]);
  });
});
