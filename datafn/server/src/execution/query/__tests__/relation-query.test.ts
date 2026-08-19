import { describe, it, expect, vi, afterEach } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "node",
      version: 1,
      fields: [{ name: "title", type: "string", required: false }],
    },
  ],
  relations: [
    {
      from: "node",
      to: "node",
      type: "many-many",
      relation: "links",
      inverse: "backlinks",
      joinTable: "record_links",
      joinColumns: { from: "in", to: "out" },
      metadata: [{ name: "linkType", type: "string" }],
    },
  ],
};

async function query(server: any, body: Record<string, unknown>) {
  const req = new Request("http://localhost/datafn/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await server.router.handle(req);
  return { status: res.status, body: await res.json() };
}

describe("relation query execution", () => {
  let server: any;

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close?.();
    server = undefined;
  });

  it("queries inverse many-many rows without scanning the whole resource table", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({
      model: "node",
      namespace: "datafn",
      data: { id: "node:target", title: "Target" },
    });
    await db.create({
      model: "node",
      namespace: "datafn",
      data: { id: "node:source-a", title: "Source A" },
    });
    await db.create({
      model: "node",
      namespace: "datafn",
      data: { id: "node:source-b", title: "Source B" },
    });
    await db.create({
      model: "record_links",
      namespace: "datafn",
      data: {
        id: "link:1",
        in: "node:source-a",
        out: "node:target",
        linkType: "direct",
      },
    });
    await db.create({
      model: "record_links",
      namespace: "datafn",
      data: {
        id: "link:2",
        in: "node:source-b",
        out: "node:target",
        linkType: "reference",
      },
    });
    const originalFindMany = db.findMany.bind(db);
    const findManySpy = vi
      .spyOn(db, "findMany")
      .mockImplementation(async (params: any) => {
        if (params.model === "node" && (!Array.isArray(params.where) || params.where.length === 0)) {
          throw new Error("node table scan should not happen");
        }
        return originalFindMany(params);
      });
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
    });

    const result = await query(server, {
      resource: "node",
      version: 1,
      relation: "backlinks",
      id: "node:target",
      select: ["#"],
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.result.data).toEqual([
      { from: "node:source-a", to: "node:target", linkType: "direct" },
      { from: "node:source-b", to: "node:target", linkType: "reference" },
    ]);
    expect(findManySpy.mock.calls.some(([params]) =>
      params.model === "record_links" &&
      params.where?.some((clause: any) =>
        clause.field === "out" &&
        clause.operator === "in" &&
        clause.value.includes("node:target"),
      ),
    )).toBe(true);
    expect(findManySpy.mock.calls.filter(([params]) => params.model === "node")).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            model: "node",
            where: expect.arrayContaining([
              expect.objectContaining({ field: "id" }),
            ]),
          }),
        ],
      ]),
    );
  });
});
