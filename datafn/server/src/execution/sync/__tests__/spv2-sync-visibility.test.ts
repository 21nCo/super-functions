import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import { ChangeTrackingService } from "../change-tracking.js";
import type { DatafnSchema } from "../../../core-types.js";

const NAMESPACE = "org:acme";
const ACTOR_FEED_CURSOR_KEY = "__datafn_actor_feed__";
const MEMBERSHIPS_TABLE = "__datafn_principal_memberships";

const schema: DatafnSchema = {
  resources: [
    {
      name: "notes",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ] as any,
      fields: [{ name: "title", type: "string", required: true }],
    },
    {
      name: "accounts",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ] as any,
      fields: [{ name: "name", type: "string", required: true }],
    },
  ],
  relations: [],
};

type Harness = {
  db: any;
  server: any;
  actor: { current: string | undefined };
};

async function createHarness(): Promise<Harness> {
  const actor = { current: "alice" as string | undefined };
  const db = memoryAdapter();
  await db.initialize();

  const server = await createDatafnServer({
    allowUnknownResources: true,
    schema,
    db,
    namespaceProvider: {
      getNamespace: () => NAMESPACE,
      getActorId: () => actor.current as any,
    },
  });

  return { db, server, actor };
}

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

describe("SPV2 sync visibility (PHASE_07)", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness?.server?.close?.();
  });

  it("TV-AUTH-004-P/N: clone/pull/reconcile are actor-visible filtered for private shareable records", async () => {
    harness.actor.current = "alice";

    const seedVisible = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth4",
      mutationId: "m-auth4-seed-visible",
      id: "note_bob_visible",
      record: { title: "Visible to Bob" },
    });
    expect(seedVisible.status).toBe(200);
    expect(seedVisible.body.result.ok).toBe(true);

    const seedPrivate = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth4",
      mutationId: "m-auth4-seed-private",
      id: "note_alice_private",
      record: { title: "Alice private" },
    });
    expect(seedPrivate.status).toBe(200);
    expect(seedPrivate.body.result.ok).toBe(true);

    const shareVisible = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-auth4",
      mutationId: "m-auth4-share-visible",
      id: "note_bob_visible",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });
    expect(shareVisible.status).toBe(200);
    expect(shareVisible.body.result.ok).toBe(true);

    harness.actor.current = "bob";

    const cloneRes = await callEndpoint(harness.server, "clone", {
      clientId: "c-auth4",
      tables: ["notes"],
    });
    expect(cloneRes.status).toBe(200);
    expect(cloneRes.body.result.ok).toBe(true);
    expect(cloneRes.body.result.data.notes.map((row: any) => row.id)).toEqual([
      "note_bob_visible",
    ]);
    expect(cloneRes.body.result.data.notes.map((row: any) => row.id)).not.toContain(
      "note_alice_private",
    );

    const pullRes = await callEndpoint(harness.server, "pull", {
      clientId: "c-auth4",
      cursors: {
        notes: "0",
        [ACTOR_FEED_CURSOR_KEY]: "0",
      },
    });
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.result.ok).toBe(true);
    expect(pullRes.body.result.records.notes.map((row: any) => row.id)).toEqual([
      "note_bob_visible",
    ]);
    expect(pullRes.body.result.records.notes.map((row: any) => row.id)).not.toContain(
      "note_alice_private",
    );

    const reconcileRes = await callEndpoint(harness.server, "reconcile", {
      clientId: "c-auth4",
      resources: ["notes"],
    });
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.result.ok).toBe(true);
    expect(reconcileRes.body.result.counts.notes).toBe(1);
  });

  it("TV-SYNC-001-P/N: unshare emits revoke tombstone with monotonic cursor progression", async () => {
    harness.actor.current = "alice";

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-sync1",
      mutationId: "m-sync1-seed",
      id: "note_1",
      record: { title: "Shared note" },
    });

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-sync1",
      mutationId: "m-sync1-share",
      id: "note_1",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    harness.actor.current = "bob";

    const baselinePull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync1",
      cursor: "0",
    });
    expect(baselinePull.status).toBe(200);
    expect(baselinePull.body.result.ok).toBe(true);
    expect(typeof baselinePull.body.result.nextCursor).toBe("string");
    const beforeUnshareCursor = baselinePull.body.result.nextCursor as string;

    harness.actor.current = "alice";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "unshare",
      clientId: "c-sync1",
      mutationId: "m-sync1-unshare",
      id: "note_1",
      shareWith: { principalId: "user:bob" },
    });

    harness.actor.current = "bob";
    const revokePull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync1",
      cursor: beforeUnshareCursor,
    });
    expect(revokePull.status).toBe(200);
    expect(revokePull.body.result.ok).toBe(true);

    const tombstone = (revokePull.body.result.changes as Array<any>).find(
      (change) =>
        change.resource === "notes" &&
        change.id === "note_1" &&
        change.op === "delete",
    );
    expect(tombstone).toBeDefined();
    expect(tombstone.reason).toBe("revoked");
    expect(Number(revokePull.body.result.nextCursor)).toBeGreaterThan(
      Number(beforeUnshareCursor),
    );
  });

  it("TV-SYNC-002-P: new grant emits deterministic grant_backfill for historical row", async () => {
    harness.actor.current = "alice";

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-sync2",
      mutationId: "m-sync2-seed",
      id: "old_1",
      record: { title: "Historical note" },
    });

    harness.actor.current = "bob";
    const preGrantPull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync2",
      cursor: "0",
    });
    expect(preGrantPull.status).toBe(200);
    expect(preGrantPull.body.result.ok).toBe(true);
    expect(preGrantPull.body.result.changes).toEqual([]);
    expect(typeof preGrantPull.body.result.nextCursor).toBe("string");
    const beforeGrantCursor = preGrantPull.body.result.nextCursor as string;

    harness.actor.current = "alice";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-sync2",
      mutationId: "m-sync2-share",
      id: "old_1",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    harness.actor.current = "bob";
    const backfillPull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync2",
      cursor: beforeGrantCursor,
    });
    expect(backfillPull.status).toBe(200);
    expect(backfillPull.body.result.ok).toBe(true);

    const backfill = (backfillPull.body.result.changes as Array<any>).find(
      (change) =>
        change.resource === "notes" &&
        change.id === "old_1" &&
        change.op === "upsert" &&
        change.reason === "grant_backfill",
    );
    expect(backfill).toBeDefined();
  });

  it("TV-SYNC-004-P/N: actor feed includes relevant membership changes and excludes unrelated updates", async () => {
    harness.actor.current = "alice";

    await callEndpoint(harness.server, "mutation", {
      resource: "accounts",
      version: 1,
      operation: "insert",
      clientId: "c-sync4",
      mutationId: "m-sync4-seed-account",
      id: "acct_1",
      record: { name: "Ops" },
    });

    await callEndpoint(harness.server, "mutation", {
      resource: "accounts",
      version: 1,
      operation: "share",
      clientId: "c-sync4",
      mutationId: "m-sync4-scope-share",
      scope: "resource",
      shareWith: { principalId: "team:fin", level: "viewer" },
    });

    harness.actor.current = "bob";
    const baselinePull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync4",
      cursors: {
        accounts: "0",
        [ACTOR_FEED_CURSOR_KEY]: "0",
      },
    });
    expect(baselinePull.status).toBe(200);
    expect(baselinePull.body.result.ok).toBe(true);
    const baselineCursors = baselinePull.body.result.cursors as Record<string, string>;

    const changeTracking = new ChangeTrackingService(harness.db, NAMESPACE);
    const membershipAddedRecord = {
      id: "m-sync4-bob-team-fin",
      actorId: "bob",
      principalId: "team:fin",
      revokedAt: null,
      __ns: NAMESPACE,
    };
    await harness.db.create({
      model: MEMBERSHIPS_TABLE,
      data: membershipAddedRecord,
      namespace: NAMESPACE,
    });
    await changeTracking.recordChange({
      serverSeq: await changeTracking.getNextServerSeq(),
      resource: MEMBERSHIPS_TABLE,
      id: String(membershipAddedRecord.id),
      op: "upsert",
      record: membershipAddedRecord,
    });

    const membershipPull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync4",
      cursors: {
        accounts: baselineCursors.accounts ?? "0",
        [ACTOR_FEED_CURSOR_KEY]: baselineCursors[ACTOR_FEED_CURSOR_KEY] ?? "0",
      },
    });
    expect(membershipPull.status).toBe(200);
    expect(membershipPull.body.result.ok).toBe(true);
    expect(membershipPull.body.result.actorFeed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "membership_added",
          principalId: "team:fin",
        }),
      ]),
    );
    expect(membershipPull.body.result.records.accounts.map((row: any) => row.id)).toEqual([
      "acct_1",
    ]);

    const cursorsAfterMembership = membershipPull.body.result.cursors as Record<string, string>;
    const unrelatedRecord = {
      id: "m-sync4-mallory-team-secret",
      actorId: "mallory",
      principalId: "team:secret",
      revokedAt: null,
      __ns: NAMESPACE,
    };
    await harness.db.create({
      model: MEMBERSHIPS_TABLE,
      data: unrelatedRecord,
      namespace: NAMESPACE,
    });
    await changeTracking.recordChange({
      serverSeq: await changeTracking.getNextServerSeq(),
      resource: MEMBERSHIPS_TABLE,
      id: String(unrelatedRecord.id),
      op: "upsert",
      record: unrelatedRecord,
    });

    const unrelatedPull = await callEndpoint(harness.server, "pull", {
      clientId: "c-sync4",
      cursors: {
        accounts: cursorsAfterMembership.accounts ?? "0",
        [ACTOR_FEED_CURSOR_KEY]:
          cursorsAfterMembership[ACTOR_FEED_CURSOR_KEY] ?? "0",
      },
    });
    expect(unrelatedPull.status).toBe(200);
    expect(unrelatedPull.body.result.ok).toBe(true);
    expect(unrelatedPull.body.result.actorFeed ?? []).toEqual([]);
    expect(unrelatedPull.body.result.records.accounts).toEqual([]);
  });
});
