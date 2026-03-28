import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";

const schema = {
  resources: [
    {
      name: "collections",
      version: 1,
      idPrefix: "col:",
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

describe("shared-with-me query mode and permission inspection", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;
  let namespace: string;

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
    actorId = "bob";
    namespace = "user:bob";
    db = memoryAdapter();
    await db.initialize();

    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => actorId as any,
      },
    });

    await db.create({
      model: "collections",
      data: { id: "col_trip", title: "Trip", createdBy: "alice", __ns: "user:alice" },
      namespace: "user:alice",
    });
    await db.create({
      model: "collections",
      data: { id: "col_plan", title: "Plan", createdBy: "sam", __ns: "org:acme" },
      namespace: "org:acme",
    });
    await db.create({
      model: "collections",
      data: { id: "col_secret", title: "Secret", createdBy: "eve", __ns: "user:eve" },
      namespace: "user:eve",
    });

    await db.create({
      model: "__datafn_principal_memberships",
      data: {
        id: "m1",
        namespace: "user:bob",
        actorId: "bob",
        principalId: "team:home",
        revokedAt: null,
        __ns: "user:bob",
      },
      namespace: "user:bob",
    });

    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "p1",
        resourceType: "collections",
        resourceNs: "user:alice",
        resourceId: "col_trip",
        principalId: "user:bob",
        level: "viewer",
        grantKind: "record",
        sourceRef: null,
        grantedBy: "user:alice",
        grantedAt: 1,
        revokedAt: null,
        __ns: "user:bob",
      },
      namespace: "user:bob",
    });
    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "p2",
        resourceType: "collections",
        resourceNs: "org:acme",
        resourceId: null,
        principalId: "team:home",
        level: "viewer",
        grantKind: "scope",
        sourceRef: null,
        grantedBy: "user:sam",
        grantedAt: 2,
        revokedAt: null,
        __ns: "user:bob",
      },
      namespace: "user:bob",
    });
    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "p3",
        resourceType: "collections",
        resourceNs: "user:eve",
        resourceId: "col_secret",
        principalId: "user:charlie",
        level: "viewer",
        grantKind: "record",
        sourceRef: null,
        grantedBy: "user:eve",
        grantedAt: 3,
        revokedAt: null,
        __ns: "user:bob",
      },
      namespace: "user:bob",
    });

    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "owner-p1",
        resourceType: "collections",
        resourceNs: "user:alice",
        resourceId: "col_trip",
        principalId: "user:bob",
        level: "editor",
        grantKind: "record",
        sourceRef: null,
        grantedBy: "user:alice",
        grantedAt: 10,
        revokedAt: null,
        __ns: "user:alice",
      },
      namespace: "user:alice",
    });
    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "owner-p2",
        resourceType: "collections",
        resourceNs: "user:alice",
        resourceId: null,
        principalId: "team:home",
        level: "viewer",
        grantKind: "scope",
        sourceRef: null,
        grantedBy: "user:alice",
        grantedAt: 11,
        revokedAt: null,
        __ns: "user:alice",
      },
      namespace: "user:alice",
    });
    await db.create({
      model: "__datafn_permissions_global",
      data: {
        id: "owner-p3",
        resourceType: "collections",
        resourceNs: "user:alice",
        resourceId: "col_trip",
        principalId: "user:charlie",
        level: "viewer",
        grantKind: "relation_inherited",
        sourceRef: "household:hh_1",
        grantedBy: "user:alice",
        grantedAt: 12,
        revokedAt: null,
        __ns: "user:alice",
      },
      namespace: "user:alice",
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("sharedWithMe returns authorized cross-namespace rows and namespace mode stays scoped", async () => {
    const sharedWithMe = await query({
      resource: "collections",
      version: 1,
      operation: "find",
      metadata: {
        accessMode: "sharedWithMe",
        namespaceFilter: ["user:alice", "org:acme"],
      },
    });

    expect(sharedWithMe.res.status).toBe(200);
    expect(sharedWithMe.body.ok).toBe(true);

    const rows = sharedWithMe.body.result.data as Array<Record<string, unknown>>;
    const ids = rows.map((row) => String(row.id)).sort();
    expect(ids).toEqual(["col_plan", "col_trip"]);
    expect(rows.map((row) => String(row.__ns)).sort()).toEqual([
      "org:acme",
      "user:alice",
    ]);
    expect(ids).not.toContain("col_secret");

    const namespaceOnly = await query({
      resource: "collections",
      version: 1,
      operation: "find",
      metadata: { accessMode: "namespace" },
    });
    expect(namespaceOnly.res.status).toBe(200);
    expect(namespaceOnly.body.result.data).toEqual([]);
  });

  it("rejects invalid accessMode values", async () => {
    const res = await query({
      resource: "collections",
      version: 1,
      operation: "find",
      metadata: { accessMode: "cross-shared" },
    });

    expect(res.res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("DFQL_INVALID");
    expect(res.body.error.details.path).toBe("metadata.accessMode");
  });

  it("getPermissions includes grantKind/sourceRef for owners and denies non-owners", async () => {
    namespace = "user:alice";
    actorId = "alice";

    const ownerView = await query({
      resource: "collections",
      version: 1,
      operation: "getPermissions",
      id: "col_trip",
    });

    expect(ownerView.res.status).toBe(200);
    expect(ownerView.body.ok).toBe(true);
    expect(ownerView.body.result).toEqual([
      expect.objectContaining({
        principalId: "user:bob",
        grantKind: "record",
      }),
      expect.objectContaining({
        principalId: "team:home",
        grantKind: "scope",
      }),
      expect.objectContaining({
        principalId: "user:charlie",
        grantKind: "relation_inherited",
        sourceRef: "household:hh_1",
      }),
    ]);

    actorId = "bob";
    const nonOwner = await query({
      resource: "collections",
      version: 1,
      operation: "getPermissions",
      id: "col_trip",
    });

    expect(nonOwner.res.status).toBe(403);
    expect(nonOwner.body.ok).toBe(false);
    expect(nonOwner.body.error.code).toBe("FORBIDDEN");
  });
});
