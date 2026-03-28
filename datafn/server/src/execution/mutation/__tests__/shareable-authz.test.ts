import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";

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
        "archivable",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

describe("shareable query gating and mutation authz", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

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

  const query = async (payload: Record<string, unknown>) => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    return { res, body };
  };

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

    await mutation({
      resource: "docs",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "doc:1",
      record: { title: "Doc 1" },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("private resource: creator sees own records, non-shared user sees none, shared user sees shared record", async () => {
    const creatorQuery = await query({
      resource: "docs",
      version: 1,
      sort: ["id:asc"],
    });
    expect(creatorQuery.res.status).toBe(200);
    expect(creatorQuery.body.result.data.map((r: any) => r.id)).toEqual(["doc:1"]);

    actorId = "user:alice";
    const beforeShare = await query({
      resource: "docs",
      version: 1,
      sort: ["id:asc"],
    });
    expect(beforeShare.res.status).toBe(200);
    expect(beforeShare.body.result.data).toHaveLength(0);

    actorId = "user:bob";
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c1",
      mutationId: "m2",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "viewer" },
    });

    actorId = "user:alice";
    const afterShare = await query({
      resource: "docs",
      version: 1,
      sort: ["id:asc"],
    });
    expect(afterShare.res.status).toBe(200);
    expect(afterShare.body.result.data.map((r: any) => r.id)).toEqual(["doc:1"]);
  });

  it("viewer cannot mutate", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c2",
      mutationId: "m10",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "viewer" },
    });

    actorId = "user:alice";
    const res = await mutation({
      resource: "docs",
      version: 1,
      operation: "merge",
      clientId: "c2",
      mutationId: "m11",
      id: "doc:1",
      record: { title: "edited" },
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.ok).toBe(false);
    expect(res.body.result.errors[0].code).toBe("FORBIDDEN");
  });

  it("editor can merge but not delete/share", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c3",
      mutationId: "m20",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "editor" },
    });

    actorId = "user:alice";
    const mergeRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "merge",
      clientId: "c3",
      mutationId: "m21",
      id: "doc:1",
      record: { title: "editor update" },
    });
    expect(mergeRes.body.result.ok).toBe(true);

    const deleteRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "delete",
      clientId: "c3",
      mutationId: "m22",
      id: "doc:1",
    });
    expect(deleteRes.body.result.ok).toBe(false);
    expect(deleteRes.body.result.errors[0].code).toBe("FORBIDDEN");

    const shareRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c3",
      mutationId: "m23",
      id: "doc:1",
      shareWith: { userId: "user:charlie", level: "viewer" },
    });
    expect(shareRes.body.result.ok).toBe(false);
    expect(shareRes.body.result.errors[0].code).toBe("FORBIDDEN");
  });

  it("owner can share/unshare/delete", async () => {
    const shareRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m30",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "viewer" },
    });
    expect(shareRes.body.result.ok).toBe(true);

    const unshareRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "unshare",
      clientId: "c4",
      mutationId: "m31",
      id: "doc:1",
      shareWith: { userId: "user:alice" },
    });
    expect(unshareRes.body.result.ok).toBe(true);

    const deleteRes = await mutation({
      resource: "docs",
      version: 1,
      operation: "delete",
      clientId: "c4",
      mutationId: "m32",
      id: "doc:1",
    });
    expect(deleteRes.body.result.ok).toBe(true);
  });

  it("getPermissions returns entries for owner only", async () => {
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c5",
      mutationId: "m40",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "editor" },
    });
    await mutation({
      resource: "docs",
      version: 1,
      operation: "share",
      clientId: "c5",
      mutationId: "m41",
      id: "doc:1",
      shareWith: { userId: "user:charlie", level: "viewer" },
    });

    const ownerView = await query({
      resource: "docs",
      version: 1,
      operation: "getPermissions",
      id: "doc:1",
    });

    expect(ownerView.res.status).toBe(200);
    expect(ownerView.body.ok).toBe(true);
    expect(ownerView.body.result).toHaveLength(2);
    expect(ownerView.body.result.map((e: any) => e.userId).sort()).toEqual([
      "user:alice",
      "user:charlie",
    ]);

    actorId = "user:alice";
    const nonOwner = await query({
      resource: "docs",
      version: 1,
      operation: "getPermissions",
      id: "doc:1",
    });

    expect(nonOwner.res.status).toBe(403);
    expect(nonOwner.body.ok).toBe(false);
    expect(nonOwner.body.error.code).toBe("FORBIDDEN");
  });
});
