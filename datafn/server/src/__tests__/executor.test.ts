import { afterEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";

import { createDatafnServer } from "../server.js";

describe("DatafnExecutor", () => {
  const servers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("reuses authorization, namespace, policy, hooks, and route execution", async () => {
    const db = memoryAdapter();
    const authorizedActions: string[] = [];
    const hookCalls: string[] = [];
    const rateLimitBodies: unknown[] = [];
    let searchSignal: AbortSignal | undefined;
    const server = await createDatafnServer<{
      workspaceId: string;
      actorId: string;
      allowed: boolean;
    }>({
      schema: {
        resources: [{
          name: "tasks",
          version: 1,
          fields: [
            { name: "title", type: "string", required: true },
            { name: "secret", type: "string", required: false },
          ],
          permissions: {
            read: { fields: ["title"] },
            write: { fields: ["title"] },
          },
        }],
      },
      db,
      namespaceProvider: {
        getNamespace: (context) => context.workspaceId,
        getActorId: (context) => context.actorId,
      },
      authorize: (context, action) => {
        authorizedActions.push(action);
        return context.allowed;
      },
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        keyExtractor: async (rateLimitContext) => {
          rateLimitBodies.push(
            (rateLimitContext as typeof rateLimitContext & { parsedBody?: unknown }).parsedBody,
          );
          return rateLimitContext.workspaceId;
        },
      },
      searchProvider: {
        name: "executor-test",
        search: async () => [],
        searchAll: async ({ signal }) => {
          searchSignal = signal;
          return [];
        },
        updateIndices: async () => undefined,
      },
      plugins: [{
        name: "executor-test",
        runsOn: ["server"],
        beforeQuery: (_context, query) => {
          hookCalls.push("query");
          return query;
        },
        beforeMutation: (_context, mutation) => {
          hookCalls.push("mutation");
          return mutation;
        },
      }],
    });
    servers.push(server);
    const context = { workspaceId: "workspace-a", actorId: "actor-a", allowed: true };

    await server.executor.mutate({
      resource: "tasks",
      version: "1",
      operation: "insert",
      clientId: "mcp",
      mutationId: "create-1",
      id: "task-1",
      record: { title: "One" },
    }, context);
    const result = await server.executor.query<{ data: Array<Record<string, unknown>> }>({
      resource: "tasks",
      version: "1",
      select: ["id", "title"],
      filters: { id: "task-1" },
      limit: 1,
    }, context);
    const searchController = new AbortController();
    const search = await server.executor.search({
      query: "One",
      resources: ["tasks"],
      signal: searchController.signal,
    }, context);

    expect(result.data).toEqual([expect.objectContaining({ id: "task-1", title: "One" })]);
    expect(search).toEqual({ results: [] });
    searchController.abort();
    expect(searchSignal?.aborted).toBe(true);
    expect(rateLimitBodies).toEqual([undefined, undefined, undefined]);
    expect(authorizedActions).toEqual(["mutation", "query", "search"]);
    expect(hookCalls).toEqual(["mutation", "query"]);
    await expect(server.executor.query({ resource: "tasks", version: "1" }, {
      ...context,
      allowed: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("resolves configured context and normalizes executor-only failures", async () => {
    const schema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
        permissions: { read: { fields: ["title"] }, write: { fields: ["title"] } },
      }],
    };
    const contexts: string[] = [];
    const contextual = await createDatafnServer<{ actorId: string }>({
      schema,
      db: memoryAdapter(),
      context: (request) => {
        contexts.push(new URL(request.url).pathname);
        return { actorId: "configured" };
      },
      authorize: (context) => context.actorId === "configured",
    });
    servers.push(contextual);
    await expect(contextual.executor.query({
      resource: "tasks",
      version: "1",
      select: ["id", "title"],
    })).resolves.toMatchObject({ data: [] });
    expect(contexts).toEqual(["/datafn/query"]);

    const throwing = await createDatafnServer({
      schema,
      db: memoryAdapter(),
      authorize: () => { throw new Error("sensitive authorization detail"); },
    });
    servers.push(throwing);
    await expect(throwing.executor.query({
      resource: "tasks",
      version: "1",
    })).rejects.toMatchObject({
      code: "INTERNAL",
      message: "Internal Server Error",
      status: 500,
    });

    const invalidResponse = await createDatafnServer({
      schema,
      db: memoryAdapter(),
      routeHooks: {
        afterResponse: () => new Response("not-json", { status: 502 }),
      },
    });
    servers.push(invalidResponse);
    await expect(invalidResponse.executor.query({
      resource: "tasks",
      version: "1",
    })).rejects.toMatchObject({
      code: "INTERNAL",
      message: "DataFn execution returned an invalid response",
      status: 502,
    });
  });
});
