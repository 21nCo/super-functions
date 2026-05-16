import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRouter } from "@superfunctions/http";
import { fromRouter } from "@apifn/core";
import { openAPIToCollection, readCollection, routerToCollection, validateCollection, writeCollection } from "../src/index.js";

function flattenRequests(items: Array<{ kind: string; children?: unknown[]; path: string }>): string[] {
  const result: string[] = [];

  function walk(nodes: Array<{ kind: string; children?: unknown[]; path: string }>): void {
    for (const node of nodes) {
      if (node.kind === "request") {
        result.push(node.path);
      }
      if (node.kind === "folder" && Array.isArray(node.children)) {
        walk(node.children as Array<{ kind: string; children?: unknown[]; path: string }>);
      }
    }
  }

  walk(items);
  return result.sort((a, b) => a.localeCompare(b));
}

describe("collection generator", () => {
  it("TV-COLL-004: generates collection from OpenAPI with grouping, baseUrl, templated params, and request body", async () => {
    const doc = {
      openapi: "3.1.0" as const,
      info: { title: "Generated API", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/users": {
          get: {
            tags: ["users"],
            summary: "List users",
            responses: {
              "200": { description: "OK" },
            },
          },
          post: {
            tags: ["users"],
            summary: "Create user",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      age: { type: "number" },
                    },
                    required: ["name", "age"],
                  },
                },
              },
            },
            responses: {
              "201": { description: "Created" },
            },
          },
        },
        "/users/{id}": {
          get: {
            tags: ["users"],
            summary: "Get user",
            responses: {
              "200": { description: "OK" },
            },
          },
        },
      },
    };

    const collection = openAPIToCollection(doc, { groupBy: "tag" });

    expect(collection.info.name).toBe("Generated API");
    expect(collection.environments.development.variables.baseUrl).toBe(
      "https://api.example.com"
    );

    const usersFolder = collection.items.find((item) => item.kind === "folder" && item.path === "users");
    expect(usersFolder).toBeDefined();
    expect(usersFolder?.children).toHaveLength(3);

    const requests = usersFolder?.children ?? [];
    const getUserById = requests.find((item) => item.path.includes("get-user.yml"));
    expect(getUserById?.request?.http.url).toBe("{{baseUrl}}/users/{{id}}");

    const createUser = requests.find((item) => item.name === "Create user");
    expect(createUser?.request?.http.body?.type).toBe("json");
    expect(createUser?.request?.http.body?.data).toContain("name");
    expect(flattenRequests(collection.items)).toEqual([
      "users/create-user.yml",
      "users/get-user.yml",
      "users/list-users.yml",
    ]);

    expect(validateCollection(collection)).toEqual([]);

    const outDir = await mkdtemp(path.join(tmpdir(), "apifn-gen-"));
    await writeCollection({ ...collection, rootDir: outDir });
    const reRead = await readCollection(outDir);
    expect(flattenRequests(reRead.items)).toHaveLength(3);
  });

  it("supports path-prefix grouping", () => {
    const doc = {
      openapi: "3.1.0" as const,
      info: { title: "Path Group API", version: "1.0.0" },
      paths: {
        "/users": {
          get: { responses: { "200": { description: "OK" } } },
        },
        "/orders": {
          get: { responses: { "200": { description: "OK" } } },
        },
      },
    };

    const collection = openAPIToCollection(doc, { groupBy: "path" });
    const folders = collection.items.filter((item) => item.kind === "folder").map((item) => item.path);

    expect(folders).toEqual(["orders", "users"]);
  });

  it("unwraps named OpenAPI examples when generating request bodies", () => {
    const doc = {
      openapi: "3.1.0" as const,
      info: { title: "Example API", version: "1.0.0" },
      paths: {
        "/users": {
          post: {
            tags: ["users"],
            summary: "Create user",
            requestBody: {
              content: {
                "application/json": {
                  examples: {
                    named: {
                      summary: "Named example",
                      value: { name: "Alice" },
                    },
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
      },
    };

    const collection = openAPIToCollection(doc, { groupBy: "tag" });
    const folder = collection.items.find((item) => item.kind === "folder" && item.path === "users");
    const request = folder?.children?.find((item) => item.kind === "request");

    expect(request?.request?.http.body?.data).toBe(JSON.stringify({ name: "Alice" }, null, 2));
    expect(request?.request?.http.body?.data).not.toContain("\"value\"");
  });

  it("TV-COLL-005: routerToCollection matches fromRouter + openAPIToCollection", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/api/users/:id",
          handler: async () => Response.json({ id: "1" }),
          meta: {
            tags: ["users"],
            summary: "Get user",
            responses: {
              200: { description: "OK" },
            },
          },
        },
      ],
    });

    const opts = {
      info: { title: "Router API", version: "1.0.0" },
      include: ["/api"],
      groupBy: "tag" as const,
      baseUrl: "https://api.example.com",
    };

    const generated = routerToCollection(router, opts);
    const manual = openAPIToCollection(
      fromRouter(router, {
        info: opts.info,
        include: opts.include,
      }),
      {
        groupBy: opts.groupBy,
        baseUrl: opts.baseUrl,
      }
    );

    expect(generated).toEqual(manual);
    expect(validateCollection(generated)).toEqual([]);
  });
});
