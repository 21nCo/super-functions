import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const NAMESPACE = "org:acme";

const schema = {
  resources: [
    {
      name: "collections",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        {
          shareable: {
            levels: ["viewer", "editor", "owner"],
            default: "private",
            relationInheritance: {
              enabled: true,
              relations: ["items"],
              requireRelateConsent: true,
            },
          },
        },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "notes",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "collectionId", type: "string" as const, required: false, nullable: true },
      ],
    },
  ],
  relations: [
    {
      from: "collections",
      to: "notes",
      type: "one-many",
      relation: "items",
      inverse: "collection",
      fkField: "collectionId",
      metadata: [{ name: "consent", type: "boolean" }],
    },
  ],
} satisfies DatafnSchema;

async function callEndpoint(
  server: any,
  path: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost/datafn/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await server.router.handle(req, {});
  const body = await res.json();
  return { status: res.status, body };
}

describe("relation inheritance SPV2", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  beforeEach(async () => {
    actorId = "alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => NAMESPACE,
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("TV-REL-001-P/N: parent share/unshare propagates inherited child visibility", async () => {
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "insert",
      clientId: "c-rel1",
      mutationId: "m-rel1-col",
      id: "col_1",
      record: { title: "Work" },
    });
    await callEndpoint(server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-rel1",
      mutationId: "m-rel1-note",
      id: "note_1",
      record: { title: "Task", collectionId: "col_1" },
    });

    const share = await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "share",
      clientId: "c-rel1",
      mutationId: "m-rel1-share",
      id: "col_1",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });
    expect(share.status).toBe(200);
    expect(share.body.result.ok).toBe(true);

    actorId = "bob";
    const visibleAfterShare = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      filters: { id: "note_1" },
      metadata: { accessMode: "sharedWithMe" },
    });
    expect(visibleAfterShare.status).toBe(200);
    expect(visibleAfterShare.body.ok).toBe(true);
    expect(visibleAfterShare.body.result.data.map((row: any) => row.id)).toEqual([
      "note_1",
    ]);

    actorId = "alice";
    const unshare = await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "unshare",
      clientId: "c-rel1",
      mutationId: "m-rel1-unshare",
      id: "col_1",
      shareWith: { principalId: "user:bob" },
    });
    expect(unshare.status).toBe(200);
    expect(unshare.body.result.ok).toBe(true);

    actorId = "bob";
    const visibleAfterUnshare = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      filters: { id: "note_1" },
      metadata: { accessMode: "sharedWithMe" },
    });
    expect(visibleAfterUnshare.status).toBe(200);
    expect(visibleAfterUnshare.body.ok).toBe(true);
    expect(visibleAfterUnshare.body.result.data).toEqual([]);
  });

  it("TV-REL-002-P/N: relate enforces permission+consent and updates inheritance grants", async () => {
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "insert",
      clientId: "c-rel2",
      mutationId: "m-rel2-col",
      id: "col_2",
      record: { title: "Shared parent" },
    });
    await callEndpoint(server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-rel2",
      mutationId: "m-rel2-note",
      id: "note_2",
      record: { title: "Detached note", collectionId: null },
    });

    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "share",
      clientId: "c-rel2",
      mutationId: "m-rel2-share-editor",
      id: "col_2",
      shareWith: { principalId: "user:bob", level: "editor" },
    });

    actorId = "charlie";
    const unauthorized = await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "relate",
      clientId: "c-rel2",
      mutationId: "m-rel2-relate-unauthorized",
      id: "col_2",
      relations: { items: [{ $ref: "note_2", consent: true }] },
    });
    expect(unauthorized.status).toBe(200);
    expect(unauthorized.body.result.ok).toBe(false);
    expect(unauthorized.body.result.errors[0].code).toBe("FORBIDDEN");

    actorId = "bob";
    const missingConsent = await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "relate",
      clientId: "c-rel2",
      mutationId: "m-rel2-relate-missing-consent",
      id: "col_2",
      relations: { items: [{ $ref: "note_2" }] },
    });
    expect(missingConsent.status).toBe(200);
    expect(missingConsent.body.result.ok).toBe(false);
    expect(missingConsent.body.result.errors[0]).toMatchObject({
      code: "DFQL_RELATION_INHERITANCE_FORBIDDEN",
      message: "Relate consent required",
      path: "relations.items[0].consent",
    });

    const consented = await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "relate",
      clientId: "c-rel2",
      mutationId: "m-rel2-relate-consented",
      id: "col_2",
      relations: { items: [{ $ref: "note_2", consent: true }] },
    });
    expect(consented.status).toBe(200);
    expect(consented.body.result.ok).toBe(true);

    const visibleAfterRelate = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      filters: { id: "note_2" },
      metadata: { accessMode: "sharedWithMe" },
    });
    expect(visibleAfterRelate.status).toBe(200);
    expect(visibleAfterRelate.body.result.data.map((row: any) => row.id)).toEqual([
      "note_2",
    ]);
  });

  it("manual scenario replay: share parent -> add child -> revoke parent", async () => {
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "insert",
      clientId: "c-rel3",
      mutationId: "m-rel3-col",
      id: "col_3",
      record: { title: "Scenario parent" },
    });
    await callEndpoint(server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-rel3",
      mutationId: "m-rel3-note",
      id: "note_3",
      record: { title: "Scenario child", collectionId: null },
    });
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "share",
      clientId: "c-rel3",
      mutationId: "m-rel3-share",
      id: "col_3",
      shareWith: { principalId: "user:bob", level: "editor" },
    });

    actorId = "bob";
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "relate",
      clientId: "c-rel3",
      mutationId: "m-rel3-relate",
      id: "col_3",
      relations: { items: [{ $ref: "note_3", consent: true }] },
    });

    const visibleAfterRelate = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      filters: { id: "note_3" },
      metadata: { accessMode: "sharedWithMe" },
    });
    expect(visibleAfterRelate.body.result.data.map((row: any) => row.id)).toEqual([
      "note_3",
    ]);

    actorId = "alice";
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "unshare",
      clientId: "c-rel3",
      mutationId: "m-rel3-unshare",
      id: "col_3",
      shareWith: { principalId: "user:bob" },
    });

    actorId = "bob";
    const visibleAfterRevoke = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      filters: { id: "note_3" },
      metadata: { accessMode: "sharedWithMe" },
    });
    expect(visibleAfterRevoke.body.result.data).toEqual([]);
  });
});
