import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const schema = {
  resources: [
    {
      name: "docs",
      version: 1,
      idPrefix: "doc:",
      capabilities: [
        "timestamps",
        "audit",
        "trash",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "todos",
      version: 1,
      idPrefix: "todo:",
      fields: [{ name: "text", type: "string" as const, required: true }],
    },
  ],
  relations: [],
} satisfies DatafnSchema;

describe("share and unshare operations", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;
  const permissionsTable = "__datafn_permissions_global";

  const mutation = async (payload: Record<string, unknown>) => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    return { res, body };
  };

  const listPermissions = async (resourceId: string) =>
    db.findMany({
      model: permissionsTable,
      where: [{ field: "resourceId", operator: "eq", value: resourceId }],
      namespace: "ns:1",
    });

  beforeEach(async () => {
    actorId = "user:bob";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("share creates permission entry and re-share upserts level", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "doc:1",
      record: { title: "Doc 1" },
    });

    const share = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c1",
      mutationId: "m2",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "editor" },
    });

    expect(share.res.status).toBe(200);
    expect(share.body.ok).toBe(true);
    expect(share.body.result.ok).toBe(true);

    const rows = await listPermissions("doc:1");
    expect(rows).toHaveLength(1);
    expect(rows[0].principalId).toBe("user:alice");
    expect(rows[0].level).toBe("editor");
    expect(rows[0].grantedBy).toBe("user:bob");
    expect(typeof rows[0].grantedAt).toBe("number");

    const reshare = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c1",
      mutationId: "m3",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "viewer" },
    });

    expect(reshare.res.status).toBe(200);
    expect(reshare.body.result.ok).toBe(true);

    const rowsAfter = await listPermissions("doc:1");
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0].level).toBe("viewer");

    const changes = await db.internal.findMany(
      "__datafn_changes",
      [{ field: "resource", op: "eq", value: permissionsTable }],
      { orderBy: "server_seq" },
    );
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.at(-1).op).toBe("upsert");
  });

  it("unshare removes entry and is idempotent", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m10",
      id: "doc:2",
      record: { title: "Doc 2" },
    });
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c2",
      mutationId: "m11",
      id: "doc:2",
      shareWith: { userId: "user:alice", level: "editor" },
    });

    const unshare = await mutation({
      resource: "docs",
      version: 1,
      operation: "unshare",
      clientId: "c2",
      mutationId: "m12",
      id: "doc:2",
      shareWith: { userId: "user:alice" },
    });

    expect(unshare.res.status).toBe(200);
    expect(unshare.body.result.ok).toBe(true);
    expect(await listPermissions("doc:2")).toHaveLength(0);

    const unshareAgain = await mutation({
      resource: "docs",
      version: 1,
      operation: "unshare",
      clientId: "c2",
      mutationId: "m13",
      id: "doc:2",
      shareWith: { userId: "user:alice" },
    });

    expect(unshareAgain.res.status).toBe(200);
    expect(unshareAgain.body.result.ok).toBe(true);
  });

  it("cannot unshare the creator", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c3",
      mutationId: "m20",
      id: "doc:3",
      record: { title: "Doc 3" },
    });

    const unshareCreator = await mutation({
      resource: "docs",
      version: 1,
      operation: "unshare",
      clientId: "c3",
      mutationId: "m21",
      id: "doc:3",
      shareWith: { userId: "user:bob" },
    });

    expect(unshareCreator.res.status).toBe(200);
    expect(unshareCreator.body.ok).toBe(true);
    expect(unshareCreator.body.result.ok).toBe(false);
    expect(unshareCreator.body.result.errors[0].code).toBe("FORBIDDEN");
    expect(unshareCreator.body.result.errors[0].message).toBe("Cannot unshare the record creator");
  });

  it("owner-only sharing enforced; explicit owner can share", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c4",
      mutationId: "m30",
      id: "doc:4",
      record: { title: "Doc 4" },
    });

    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m31",
      id: "doc:4",
      shareWith: { userId: "user:alice", level: "owner" },
    });

    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m32",
      id: "doc:4",
      shareWith: { userId: "user:charlie", level: "editor" },
    });

    actorId = "user:charlie";
    const editorShare = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m33",
      id: "doc:4",
      shareWith: { userId: "user:dave", level: "viewer" },
    });
    expect(editorShare.res.status).toBe(200);
    expect(editorShare.body.ok).toBe(true);
    expect(editorShare.body.result.ok).toBe(false);
    expect(editorShare.body.result.errors[0].code).toBe("FORBIDDEN");

    actorId = "user:alice";
    const ownerShare = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m34",
      id: "doc:4",
      shareWith: { userId: "user:dave", level: "viewer" },
    });
    expect(ownerShare.res.status).toBe(200);
    expect(ownerShare.body.result.ok).toBe(true);
  });

  it("creator is implicit owner and has no explicit permission row", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c5",
      mutationId: "m40",
      id: "doc:5",
      record: { title: "Doc 5" },
    });

    const creatorRow = await db.findOne({
      model: permissionsTable,
      where: [
        { field: "resourceId", operator: "eq", value: "doc:5" },
        { field: "principalId", operator: "eq", value: "user:bob" },
      ],
      namespace: "ns:1",
    });
    expect(creatorRow).toBeNull();

    const shareByCreator = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c5",
      mutationId: "m41",
      id: "doc:5",
      shareWith: { userId: "user:alice", level: "viewer" },
    });
    expect(shareByCreator.res.status).toBe(200);
    expect(shareByCreator.body.result.ok).toBe(true);
  });

  it("delete cascades permissions but trash preserves them", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c6",
      mutationId: "m50",
      id: "doc:6",
      record: { title: "Doc 6" },
    });
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c6",
      mutationId: "m51",
      id: "doc:6",
      shareWith: { userId: "user:alice", level: "editor" },
    });
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c6",
      mutationId: "m52",
      id: "doc:6",
      shareWith: { userId: "user:charlie", level: "viewer" },
    });

    expect(await listPermissions("doc:6")).toHaveLength(2);

    const trash = await mutation({
      resource: "docs",
      version: 1,
      operation: "trash",
      clientId: "c6",
      mutationId: "m53",
      id: "doc:6",
    });
    expect(trash.res.status).toBe(200);
    expect(await listPermissions("doc:6")).toHaveLength(2);

    const del = await mutation({
      resource: "docs",
      version: 1,
      operation: "delete",
      clientId: "c6",
      mutationId: "m54",
      id: "doc:6",
    });
    expect(del.res.status).toBe(200);
    expect(await listPermissions("doc:6")).toHaveLength(0);
  });

  it("share on non-shareable resource returns DFQL_UNSUPPORTED", async () => {
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c7",
      mutationId: "m60",
      id: "todo:1",
      record: { text: "t" },
    });

    const share = await mutation({
      resource: "todos",
      version: 1,
      operation: "share",
      clientId: "c7",
      mutationId: "m61",
      id: "todo:1",
      shareWith: { userId: "user:alice", level: "viewer" },
    });

    expect(share.res.status).toBe(400);
    expect(share.body.ok).toBe(false);
    expect(share.body.error.code).toBe("DFQL_UNSUPPORTED");
  });
});
