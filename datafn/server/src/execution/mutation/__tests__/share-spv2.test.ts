import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const namespace = "user:owner";
const globalPermissionsTable = "__datafn_permissions_global";

const schema = {
  resources: [
    {
      name: "notes",
      version: 1,
      idPrefix: "note:",
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "restricted",
      version: 1,
      idPrefix: "res:",
      capabilities: [
        "timestamps",
        "audit",
        {
          shareable: {
            levels: ["viewer", "editor", "owner"],
            default: "private",
            crossNsShareable: false,
          },
        },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
} satisfies DatafnSchema;

describe("share SPV2 mutation semantics", () => {
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

  const listGlobalGrants = async () =>
    db.findMany({
      model: globalPermissionsTable,
      where: [],
      namespace,
    });

  beforeEach(async () => {
    actorId = "user:owner";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("canonicalizes legacy userId to principalId in global grants", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "note:1",
      record: { title: "Note 1" },
    });

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c1",
      mutationId: "m2",
      id: "note:1",
      shareWith: { userId: "bob", level: "editor" },
    });

    expect(share.res.status).toBe(200);
    expect(share.body.ok).toBe(true);
    expect(share.body.result.ok).toBe(true);

    const grants = await listGlobalGrants();
    expect(grants).toHaveLength(1);
    expect(grants[0].resourceType).toBe("notes");
    expect(grants[0].resourceNs).toBe(namespace);
    expect(grants[0].resourceId).toBe("note:1");
    expect(grants[0].principalId).toBe("user:bob");
    expect(grants[0].level).toBe("editor");
    expect(grants[0].grantKind).toBe("record");
  });

  it("rejects shareWith payloads missing userId and principalId", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m10",
      id: "note:2",
      record: { title: "Note 2" },
    });

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c2",
      mutationId: "m11",
      id: "note:2",
      shareWith: { level: "viewer" },
    });

    expect(share.res.status).toBe(400);
    expect(share.body.ok).toBe(false);
    expect(share.body.error.code).toBe("DFQL_PRINCIPAL_INVALID");
    expect(share.body.error.message).toBe(
      "Either shareWith.userId or shareWith.principalId is required",
    );
  });

  it("rejects mixed shareWith.userId and shareWith.principalId payloads", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c2m",
      mutationId: "m10m",
      id: "note:2m",
      record: { title: "Note 2m" },
    });

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c2m",
      mutationId: "m11m",
      id: "note:2m",
      shareWith: { userId: "bob", principalId: "user:bob", level: "viewer" },
    });

    expect(share.res.status).toBe(400);
    expect(share.body.ok).toBe(false);
    expect(share.body.error.code).toBe("DFQL_PRINCIPAL_INVALID");
    expect(share.body.error.message).toBe(
      "Provide only one of shareWith.userId or shareWith.principalId",
    );
  });

  it("rejects empty principalId with deterministic error", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c3",
      mutationId: "m20",
      id: "note:3",
      record: { title: "Note 3" },
    });

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c3",
      mutationId: "m21",
      id: "note:3",
      shareWith: { principalId: "", level: "viewer" },
    });

    expect(share.res.status).toBe(400);
    expect(share.body.ok).toBe(false);
    expect(share.body.error.code).toBe("DFQL_PRINCIPAL_INVALID");
    expect(share.body.error.message).toBe("principalId must be non-empty string");
  });

  it("rejects resource scope shares when id is present", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c4",
      mutationId: "m30",
      id: "note:4",
      record: { title: "Note 4" },
    });

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c4",
      mutationId: "m31",
      id: "note:4",
      scope: "resource",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });

    expect(share.res.status).toBe(400);
    expect(share.body.ok).toBe(false);
    expect(share.body.error.code).toBe("DFQL_SHARE_SCOPE_INVALID");
    expect(share.body.error.message).toBe("resource scope share must omit id");
  });

  it("creates and revokes resource scope grants with resourceId=null", async () => {
    const scopeShare = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c5",
      mutationId: "m40",
      scope: "resource",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });
    expect(scopeShare.res.status).toBe(200);
    expect(scopeShare.body.result.ok).toBe(true);

    const grantsAfterShare = await listGlobalGrants();
    expect(grantsAfterShare).toHaveLength(1);
    expect(grantsAfterShare[0].resourceType).toBe("notes");
    expect(grantsAfterShare[0].resourceNs).toBe(namespace);
    expect(grantsAfterShare[0].resourceId).toBeNull();
    expect(grantsAfterShare[0].grantKind).toBe("scope");
    expect(grantsAfterShare[0].principalId).toBe("user:partner");

    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c5",
      mutationId: "m41",
      id: "note:future",
      record: { title: "Future note" },
    });

    actorId = "partner";
    const sharedWithMe = await query({
      resource: "notes",
      version: 1,
      operation: "find",
      metadata: { accessMode: "sharedWithMe" },
      sort: ["id:asc"],
    });
    expect(sharedWithMe.res.status).toBe(200);
    expect(sharedWithMe.body.ok).toBe(true);
    expect(sharedWithMe.body.result.data.map((row: any) => row.id)).toEqual([
      "note:future",
    ]);

    actorId = "user:owner";
    const unshare = await mutation({
      resource: "notes",
      version: 1,
      operation: "unshare",
      clientId: "c5",
      mutationId: "m42",
      scope: "resource",
      shareWith: { principalId: "user:partner" },
    });
    expect(unshare.res.status).toBe(200);
    expect(unshare.body.result.ok).toBe(true);

    const grantsAfterUnshare = await listGlobalGrants();
    expect(grantsAfterUnshare).toHaveLength(0);
  });

  it("rejects resource scope share and unshare for non-owners", async () => {
    actorId = "user:partner";

    const share = await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c5b",
      mutationId: "m43",
      scope: "resource",
      shareWith: { principalId: "user:third-party", level: "viewer" },
    });
    expect(share.res.status).toBe(200);
    expect(share.body.ok).toBe(true);
    expect(share.body.result.ok).toBe(false);
    expect(share.body.result.errors[0].code).toBe("FORBIDDEN");
    expect(share.body.result.errors[0].message).toBe("Authorization denied");

    const unshare = await mutation({
      resource: "notes",
      version: 1,
      operation: "unshare",
      clientId: "c5b",
      mutationId: "m44",
      scope: "resource",
      shareWith: { principalId: "user:third-party" },
    });
    expect(unshare.res.status).toBe(200);
    expect(unshare.body.ok).toBe(true);
    expect(unshare.body.result.ok).toBe(false);
    expect(unshare.body.result.errors[0].code).toBe("FORBIDDEN");
    expect(unshare.body.result.errors[0].message).toBe("Authorization denied");
  });

  it("enforces crossNsShareable=false with deterministic error", async () => {
    await mutation({
      resource: "restricted",
      version: 1,
      operation: "insert",
      clientId: "c6",
      mutationId: "m50",
      id: "res:1",
      record: { title: "Restricted" },
    });

    const share = await mutation({
      resource: "restricted",
      version: 1,
      operation: "share",
      clientId: "c6",
      mutationId: "m51",
      id: "res:1",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });

    expect(share.res.status).toBe(200);
    expect(share.body.ok).toBe(true);
    expect(share.body.result.ok).toBe(false);
    expect(share.body.result.errors[0].code).toBe("DFQL_CROSS_NS_SHARE_FORBIDDEN");
    expect(share.body.result.errors[0].message).toBe(
      "Cross-namespace sharing is disabled for this resource",
    );
  });
});
