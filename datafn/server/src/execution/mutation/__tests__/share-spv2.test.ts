import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryIndexedDirectoryStore,
  memoryAdapter,
} from "@superfunctions/db/adapters";
import type { TransactionAdapter, UpdateManyParams } from "@superfunctions/db";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";
import { datafnMultiRegionPlugin } from "../../../plugins/multi-region.js";
import {
  rollbackDatafnPermissionGrantAfterFailedShare,
  snapshotDatafnPermissionGrantBeforeShare,
} from "../share.js";
import {
  getLegacyPermissionsTable,
  setSpv2MigrationRuntimeConfig,
} from "../../migration/spv2.js";
import {
  deferFailedShareCompensation,
  drainPermissionDirectoryOutbox,
  drainPermissionDirectorySync,
  enqueuePermissionDirectorySync,
  ensurePermissionDirectoryOutbox,
  markPermissionDirectorySyncReady,
} from "../permission-directory-outbox.js";

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
    setSpv2MigrationRuntimeConfig({
      readMode: "v2",
      writeMode: "v2",
      warnOnLegacyApi: true,
    });
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

  it("does not let delayed compensation overwrite a newer canonical or legacy grant", async () => {
    setSpv2MigrationRuntimeConfig({
      readMode: "dual",
      writeMode: "dual",
      warnOnLegacyApi: true,
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "share-restore",
      mutationId: "share-restore-insert",
      id: "note:share-restore",
      record: { title: "Restore prior grant" },
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "share-restore",
      mutationId: "share-restore-viewer",
      id: "note:share-restore",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });
    const failedMutation = {
      resource: "notes",
      id: "note:share-restore",
      shareWith: { principalId: "user:partner" },
    };
    const snapshot = await snapshotDatafnPermissionGrantBeforeShare(
      db,
      failedMutation,
      namespace,
    );
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "share-restore",
      mutationId: "share-restore-editor",
      id: "note:share-restore",
      shareWith: { principalId: "user:partner", level: "editor" },
    });
    const expectedFailedCanonical = (await listGlobalGrants())[0];
    const originalTransaction = db.transaction.bind(db);
    const originalUpdateMany = db.updateMany.bind(db);
    let interleaved = false;
    db.transaction = async <R>(
      callback: (trx: TransactionAdapter) => Promise<R>,
    ) => callback(db as unknown as TransactionAdapter);
    db.updateMany = async (
      input: UpdateManyParams,
    ) => {
      if (
        !interleaved &&
        input.model === getLegacyPermissionsTable("notes")
      ) {
        interleaved = true;
        await mutation({
          resource: "notes",
          version: 1,
          operation: "share",
          clientId: "share-restore",
          mutationId: "share-restore-owner",
          id: "note:share-restore",
          shareWith: { principalId: "user:partner", level: "owner" },
        });
      }
      return originalUpdateMany(input);
    };
    try {
      await rollbackDatafnPermissionGrantAfterFailedShare(
        db,
        failedMutation,
        namespace,
        null,
        {
          ...snapshot,
          compensationExpectedCanonical: expectedFailedCanonical,
        },
      );
    } finally {
      db.transaction = originalTransaction;
      db.updateMany = originalUpdateMany;
    }

    expect(interleaved).toBe(true);
    await expect(listGlobalGrants()).resolves.toEqual([
      expect.objectContaining({ level: "owner", principalId: "user:partner" }),
    ]);
    await expect(db.findMany({
      model: getLegacyPermissionsTable("notes"),
      where: [],
      namespace,
    })).resolves.toEqual([
      expect.objectContaining({ level: "owner", userId: "user:partner" }),
    ]);
  });

  it("compensates exact failed grant state without transactions", async () => {
    setSpv2MigrationRuntimeConfig({
      readMode: "dual",
      writeMode: "dual",
      warnOnLegacyApi: true,
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "share-no-transaction",
      mutationId: "share-no-transaction-insert",
      id: "note:share-no-transaction",
      record: { title: "No transaction compensation" },
    });
    const failedMutation = {
      resource: "notes",
      id: "note:share-no-transaction",
      shareWith: { principalId: "user:partner" },
    };
    const snapshot = await snapshotDatafnPermissionGrantBeforeShare(
      db,
      failedMutation,
      namespace,
    );
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "share-no-transaction",
      mutationId: "share-no-transaction-editor",
      id: "note:share-no-transaction",
      shareWith: { principalId: "user:partner", level: "editor" },
    });
    const expectedFailedCanonical = (await listGlobalGrants())[0];
    (db.capabilities.transactions as { supported: boolean }).supported = false;
    const transactionSpy = vi.spyOn(db, "transaction");

    await rollbackDatafnPermissionGrantAfterFailedShare(
      db,
      failedMutation,
      namespace,
      null,
      {
        ...snapshot,
        compensationExpectedCanonical: expectedFailedCanonical,
      },
    );

    expect(transactionSpy).not.toHaveBeenCalled();
    await expect(listGlobalGrants()).resolves.toEqual([]);
    await expect(db.findMany({
      model: getLegacyPermissionsTable("notes"),
      where: [],
      namespace,
    })).resolves.toEqual([]);
  });

  it("retries compensation directory reconciliation after a concurrent share", async () => {
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "compensation-directory-race",
      mutationId: "compensation-directory-race-insert",
      id: "note:compensation-directory-race",
      record: { title: "Compensation directory race" },
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "compensation-directory-race",
      mutationId: "compensation-directory-race-viewer",
      id: "note:compensation-directory-race",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });
    const failedMutation = {
      resource: "notes",
      id: "note:compensation-directory-race",
      shareWith: { principalId: "user:partner" },
    };
    const snapshot = await snapshotDatafnPermissionGrantBeforeShare(
      db,
      failedMutation,
      namespace,
    );
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "compensation-directory-race",
      mutationId: "compensation-directory-race-editor",
      id: "note:compensation-directory-race",
      shareWith: { principalId: "user:partner", level: "editor" },
    });
    const expectedFailedCanonical = (await listGlobalGrants())[0];
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let interleaved = false;
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        await backingDirectory.put(record);
        if (!interleaved) {
          interleaved = true;
          await mutation({
            resource: "notes",
            version: 1,
            operation: "share",
            clientId: "compensation-directory-race",
            mutationId: "compensation-directory-race-owner",
            id: "note:compensation-directory-race",
            shareWith: { principalId: "user:partner", level: "owner" },
          });
        }
      },
    };

    await rollbackDatafnPermissionGrantAfterFailedShare(
      db,
      failedMutation,
      namespace,
      { regionId: "region:test", directory },
      {
        ...snapshot,
        compensationExpectedCanonical: expectedFailedCanonical,
      },
    );

    expect(interleaved).toBe(true);
    await expect(listGlobalGrants()).resolves.toEqual([
      expect.objectContaining({ level: "owner" }),
    ]);
    const indexed = await backingDirectory.query({
      index: "datafn.permission.principalResource",
      value: "user:partner#notes",
    });
    expect(indexed.records).toHaveLength(1);
    expect(JSON.parse(String(indexed.records[0].value))).toMatchObject({
      level: "owner",
    });
  });

  it("waits for an in-flight lease renewal before replacing a failed share task", async () => {
    vi.useFakeTimers();
    const taskDb = memoryAdapter();
    await taskDb.initialize();
    await ensurePermissionDirectoryOutbox(taskDb);
    const originalUpdate = taskDb.internal.update.bind(taskDb.internal);
    let releaseRenewal!: () => void;
    const renewalGate = new Promise<void>((resolve) => {
      releaseRenewal = resolve;
    });
    let renewalStarted!: () => void;
    const renewalStart = new Promise<void>((resolve) => {
      renewalStarted = resolve;
    });
    const heartbeatDb = Object.create(taskDb);
    heartbeatDb.internal = {
      ...taskDb.internal,
      update: async (...args: Parameters<typeof originalUpdate>) => {
        const [table, where, data] = args;
        if (
          table === "__datafn_permission_directory_outbox" &&
          where.length === 2 &&
          !("mutation" in data)
        ) {
          renewalStarted();
          await renewalGate;
        }
        return originalUpdate(...args);
      },
    };
    const taskId = await enqueuePermissionDirectorySync(
      heartbeatDb,
      {
        operation: "share",
        resource: "notes",
        id: "note:lease-race",
        shareWith: { principalId: "user:partner" },
      },
      namespace,
      "region:test",
      { pending: true },
    );

    try {
      vi.advanceTimersByTime(100_000);
      await renewalStart;
      let deferred = false;
      const deferPromise = deferFailedShareCompensation(
        heartbeatDb,
        taskId,
        {
          operation: "share",
          resource: "notes",
          id: "note:lease-race",
          shareWith: { principalId: "user:partner" },
        },
        {
          permissionId: "notes:user:owner:note:lease-race:user:partner",
          resource: "notes",
          resourceId: "note:lease-race",
          principalId: "user:partner",
          canonical: null,
          legacyManaged: false,
          legacy: null,
        },
        new Error("failed share"),
        namespace,
        "region:test",
      ).then(() => {
        deferred = true;
      });
      await Promise.resolve();
      expect(deferred).toBe(false);
      releaseRenewal();
      await deferPromise;

      const tasks = await taskDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(tasks).toHaveLength(1);
      expect(JSON.parse(String(tasks[0].mutation))).toMatchObject({
        operation: "compensate-failed-share",
      });
    } finally {
      vi.useRealTimers();
      await taskDb.close();
    }
  });

  it("keeps failed-share compensation fail-closed when task persistence is temporarily unavailable", async () => {
    vi.useFakeTimers();
    const taskDb = memoryAdapter();
    await taskDb.initialize();
    await ensurePermissionDirectoryOutbox(taskDb);
    const originalCreate = taskDb.internal.create.bind(taskDb.internal);
    const originalUpdate = taskDb.internal.update.bind(taskDb.internal);
    let rejectCompensationPersistence = true;
    const heartbeatDb = Object.create(taskDb);
    heartbeatDb.internal = {
      ...taskDb.internal,
      create: async (...args: Parameters<typeof originalCreate>) => {
        const [, data] = args;
        if (
          rejectCompensationPersistence &&
          String(data.mutation ?? "").includes("compensate-failed-share")
        ) {
          throw new Error("replacement task unavailable");
        }
        return originalCreate(...args);
      },
      update: async (...args: Parameters<typeof originalUpdate>) => {
        const [, , data] = args;
        if (
          rejectCompensationPersistence &&
          String(data.mutation ?? "").includes("compensate-failed-share")
        ) {
          throw new Error("task rewrite unavailable");
        }
        return originalUpdate(...args);
      },
    };
    const mutation = {
      operation: "share",
      resource: "notes",
      id: "note:persistence-retry",
      shareWith: { principalId: "user:partner" },
    };
    const taskId = await enqueuePermissionDirectorySync(
      heartbeatDb,
      mutation,
      namespace,
      "region:test",
      { pending: true },
    );

    try {
      await expect(deferFailedShareCompensation(
        heartbeatDb,
        taskId,
        mutation,
        {
          permissionId: "notes:user:owner:note:persistence-retry:user:partner",
          resource: "notes",
          resourceId: "note:persistence-retry",
          principalId: "user:partner",
          canonical: null,
          legacyManaged: false,
          legacy: null,
        },
        new Error("failed share"),
        namespace,
        "region:test",
      )).resolves.toBeNull();

      const leased = await taskDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(leased).toHaveLength(1);
      expect(JSON.parse(String(leased[0].mutation))).toMatchObject({
        operation: "share",
      });

      rejectCompensationPersistence = false;
      await vi.advanceTimersByTimeAsync(1_000);

      const converted = await taskDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(converted).toHaveLength(1);
      expect(JSON.parse(String(converted[0].mutation))).toMatchObject({
        operation: "compensate-failed-share",
      });
    } finally {
      vi.useRealTimers();
      await taskDb.close();
    }
  });

  it("retries transient legacy cleanup before completing failed-share compensation", async () => {
    setSpv2MigrationRuntimeConfig({
      readMode: "dual",
      writeMode: "dual",
      warnOnLegacyApi: true,
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "share-cleanup-retry",
      mutationId: "share-cleanup-retry-insert",
      id: "note:share-cleanup-retry",
      record: { title: "Retry legacy cleanup" },
    });
    const failedMutation = {
      resource: "notes",
      id: "note:share-cleanup-retry",
      shareWith: { principalId: "user:partner" },
    };
    const snapshot = await snapshotDatafnPermissionGrantBeforeShare(
      db,
      failedMutation,
      namespace,
    );
    await mutation({
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "share-cleanup-retry",
      mutationId: "share-cleanup-retry-share",
      id: "note:share-cleanup-retry",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });
    const originalDelete = db.delete.bind(db);
    let legacyDeleteAttempts = 0;
    db.delete = async (
      input: Parameters<ReturnType<typeof memoryAdapter>["delete"]>[0],
    ) => {
      if (input.model === getLegacyPermissionsTable("notes")) {
        legacyDeleteAttempts += 1;
        if (legacyDeleteAttempts < 3) {
          throw new Error("transient legacy cleanup failure");
        }
      }
      return originalDelete(input);
    };

    try {
      await rollbackDatafnPermissionGrantAfterFailedShare(
        db,
        failedMutation,
        namespace,
        null,
        snapshot,
      );
    } finally {
      db.delete = originalDelete;
    }

    expect(legacyDeleteAttempts).toBe(3);
    await expect(listGlobalGrants()).resolves.toEqual([]);
    await expect(db.findMany({
      model: getLegacyPermissionsTable("notes"),
      where: [],
      namespace,
    })).resolves.toEqual([]);
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

  it("keeps the database grant active when directory invalidation fails", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let rejectDelete = false;
    const directory = {
      ...backingDirectory,
      async delete(key: string) {
        if (rejectDelete) throw new Error("directory unavailable");
        await backingDirectory.delete(key);
      },
    };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return { response, body: await response.json() as any };
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "directory-order",
        mutationId: "directory-order-insert",
        id: "note:directory-order",
        record: { title: "Directory ordering" },
      });
      const shared = await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "directory-order",
        mutationId: "directory-order-share",
        id: "note:directory-order",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      expect(shared.body.result.ok).toBe(true);

      rejectDelete = true;
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "unshare",
        clientId: "directory-order",
        mutationId: "directory-order-unshare-failed",
        id: "note:directory-order",
        shareWith: { principalId: "user:partner" },
      });

      const grantsAfterFailure = await localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      });
      expect(grantsAfterFailure).toHaveLength(1);
      const directoryAfterFailure = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(directoryAfterFailure.records).toHaveLength(1);

      rejectDelete = false;
      const retried = await localMutation({
        resource: "notes",
        version: 1,
        operation: "unshare",
        clientId: "directory-order",
        mutationId: "directory-order-unshare-retry",
        id: "note:directory-order",
        shareWith: { principalId: "user:partner" },
      });
      expect(retried.body.result.ok).toBe(true);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close();
    }
  });

  it("does not publish a permission-directory grant when the database transaction rolls back", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "rollback",
        mutationId: "rollback-insert",
        id: "note:rollback",
        record: { title: "Rollback" },
      });
      const originalTransaction = localDb.transaction.bind(localDb);
      localDb.transaction = async (callback: (tx: any) => Promise<unknown>) =>
        originalTransaction(async (tx: any) => {
          await callback(tx);
          throw new Error("commit failed");
        });

      const result = await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "rollback",
        mutationId: "rollback-share",
        id: "note:rollback",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });

      expect(result.result.ok).toBe(false);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close?.();
    }
  });

  it("does not publish a failed nontransactional dual-write share", async () => {
    setSpv2MigrationRuntimeConfig({
      readMode: "dual",
      writeMode: "dual",
      warnOnLegacyApi: true,
    });
    const localDb = memoryAdapter();
    await localDb.initialize();
    (localDb.capabilities.transactions as { supported: boolean }).supported = false;
    const originalUpsert = localDb.upsert.bind(localDb);
    let rejectLegacyMirror = false;
    localDb.upsert = async (input: any) => {
      if (
        rejectLegacyMirror &&
        input.model === getLegacyPermissionsTable("notes")
      ) {
        throw new Error("legacy mirror unavailable");
      }
      return originalUpsert(input);
    };
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      spv2Migration: {
        readMode: "dual",
        writeMode: "dual",
        warnOnLegacyApi: true,
      },
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "direct-failed-share",
        mutationId: "direct-failed-share-insert",
        id: "note:direct-failed-share",
        record: { title: "Failed share" },
      });
      rejectLegacyMirror = true;

      const result = await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "direct-failed-share",
        mutationId: "direct-failed-share-share",
        id: "note:direct-failed-share",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });

      expect(result.result.ok).toBe(false);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
      await expect(localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      )).resolves.toHaveLength(0);
    } finally {
      await localServer.close();
    }
  });

  it("restores a directory grant when a direct unshare transaction rolls back", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "direct-unshare-rollback",
        mutationId: "direct-unshare-rollback-insert",
        id: "note:direct-unshare-rollback",
        record: { title: "Direct unshare rollback" },
      });
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "direct-unshare-rollback",
        mutationId: "direct-unshare-rollback-share",
        id: "note:direct-unshare-rollback",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      const originalTransaction = localDb.transaction.bind(localDb);
      localDb.transaction = async (callback: (tx: any) => Promise<unknown>) =>
        originalTransaction(async (tx: any) => {
          await callback(tx);
          throw new Error("commit failed");
        });

      const result = await localMutation({
        resource: "notes",
        version: 1,
        operation: "unshare",
        clientId: "direct-unshare-rollback",
        mutationId: "direct-unshare-rollback-unshare",
        id: "note:direct-unshare-rollback",
        shareWith: { principalId: "user:partner" },
      });

      expect(result.result.ok).toBe(false);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const indexed = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("does not invalidate a direct unshare when repair persistence is unavailable", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response;
    };

    try {
      await request({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "direct-unshare-prequeue",
        mutationId: "direct-unshare-prequeue-insert",
        id: "note:direct-unshare-prequeue",
        record: { title: "Direct unshare prequeue" },
      });
      await request({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "direct-unshare-prequeue",
        mutationId: "direct-unshare-prequeue-share",
        id: "note:direct-unshare-prequeue",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });

      const originalInternalCreate = localDb.internal.create.bind(localDb.internal);
      localDb.internal.create = async (table: string, record: Record<string, unknown>) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        return originalInternalCreate(table, record);
      };

      const response = await request({
        resource: "notes",
        version: 1,
        operation: "unshare",
        clientId: "direct-unshare-prequeue",
        mutationId: "direct-unshare-prequeue-unshare",
        id: "note:direct-unshare-prequeue",
        shareWith: { principalId: "user:partner" },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const indexed = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("durably retries a committed share when directory indexing fails", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let rejectPut = true;
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        if (rejectPut) throw new Error("directory unavailable");
        return backingDirectory.put(record);
      },
    };
    const runtime = { regionId: "region:test", directory };
    let currentActor = "user:owner";
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin(runtime)],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => currentActor,
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "directory-retry",
        mutationId: "directory-retry-insert",
        id: "note:directory-retry",
        record: { title: "Directory retry" },
      });
      const shared = await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "directory-retry",
        mutationId: "directory-retry-share",
        id: "note:directory-retry",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      expect(shared.result.ok).toBe(true);
      const [grant] = await localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      });
      await localDb.update({
        model: globalPermissionsTable,
        where: [{ field: "id", operator: "eq", value: grant.id }],
        data: { resourceRegion: undefined },
        namespace,
      });
      currentActor = "user:partner";
      const sharedWithMeResponse = await localServer.router.handle(new Request(
        "http://localhost/datafn/query",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resource: "notes",
            version: 1,
            metadata: { accessMode: "sharedWithMe" },
          }),
        },
      ));
      const sharedWithMe = await sharedWithMeResponse.json() as any;
      expect(sharedWithMe.result.data.map((row: any) => row.id)).toContain(
        "note:directory-retry",
      );
      await expect(localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      )).resolves.toHaveLength(1);

      rejectPut = false;
      const [retryTask] = await localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      await expect(drainPermissionDirectorySync(
        localDb,
        String(retryTask.id),
        runtime,
      )).resolves.toBe(true);
      await expect(localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      )).resolves.toHaveLength(0);
      const indexed = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("does not let a delayed share retry recreate a concurrently revoked grant", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let blockPut = false;
    let signalPutStarted!: () => void;
    let releasePut!: () => void;
    const putStarted = new Promise<void>((resolve) => { signalPutStarted = resolve; });
    const putReleased = new Promise<void>((resolve) => { releasePut = resolve; });
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        if (blockPut) {
          signalPutStarted();
          await putReleased;
        }
        return backingDirectory.put(record);
      },
    };
    const runtime = { regionId: "region:test", directory };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin(runtime)],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "retry-race",
        mutationId: "retry-race-insert",
        id: "note:retry-race",
        record: { title: "Retry race" },
      });
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "retry-race",
        mutationId: "retry-race-share",
        id: "note:retry-race",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "share",
        resource: "notes",
        id: "note:retry-race",
        scope: "record",
        shareWith: { principalId: "user:partner" },
      }, namespace, runtime.regionId);

      blockPut = true;
      const retry = drainPermissionDirectorySync(localDb, taskId, runtime);
      await putStarted;
      const unshared = await localMutation({
        resource: "notes",
        version: 1,
        operation: "unshare",
        clientId: "retry-race",
        mutationId: "retry-race-unshare",
        id: "note:retry-race",
        shareWith: { principalId: "user:partner" },
      });
      expect(unshared.result.ok).toBe(true);
      blockPut = false;
      releasePut();
      await expect(retry).resolves.toBe(true);

      await expect(backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
      await expect(localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      )).resolves.toHaveLength(0);
    } finally {
      releasePut?.();
      await localServer.close();
    }
  });

  it("does not let an older retry overwrite a newer grant level", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let blockNextPut = false;
    let signalPutStarted!: () => void;
    let releasePut!: () => void;
    const putStarted = new Promise<void>((resolve) => { signalPutStarted = resolve; });
    const putReleased = new Promise<void>((resolve) => { releasePut = resolve; });
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        if (blockNextPut) {
          blockNextPut = false;
          signalPutStarted();
          await putReleased;
        }
        return backingDirectory.put(record);
      },
    };
    const runtime = { regionId: "region:test", directory };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin(runtime)],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const localMutation = async (payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        "http://localhost/datafn/mutation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "retry-level",
        mutationId: "retry-level-insert",
        id: "note:retry-level",
        record: { title: "Retry level" },
      });
      await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "retry-level",
        mutationId: "retry-level-viewer",
        id: "note:retry-level",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "share",
        resource: "notes",
        id: "note:retry-level",
        scope: "record",
        shareWith: { principalId: "user:partner" },
      }, namespace, runtime.regionId);

      blockNextPut = true;
      const retry = drainPermissionDirectorySync(localDb, taskId, runtime);
      await putStarted;
      const updated = await localMutation({
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "retry-level",
        mutationId: "retry-level-editor",
        id: "note:retry-level",
        shareWith: { principalId: "user:partner", level: "editor" },
      });
      expect(updated.result.ok).toBe(true);
      releasePut();
      await expect(retry).resolves.toBe(true);

      const indexed = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
      expect(JSON.parse(indexed.records[0].value).level).toBe("editor");
    } finally {
      releasePut?.();
      await localServer.close();
    }
  });

  it("backs off failed outbox tasks so newer grants are not starved", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    await ensurePermissionDirectoryOutbox(localDb);
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let deleteCalls = 0;
    const runtime = {
      regionId: "region:test",
      directory: {
        ...backingDirectory,
        delete: async (key: string) => {
          deleteCalls += 1;
          if (deleteCalls <= 100) throw new Error("poison task");
          return backingDirectory.delete(key);
        },
      },
    };
    for (let index = 0; index < 101; index += 1) {
      await enqueuePermissionDirectorySync(localDb, {
        operation: "unshare",
        resource: "notes",
        id: `note:poison-${index}`,
        scope: "record",
        shareWith: { principalId: `user:poison-${index}` },
      }, namespace, runtime.regionId);
    }

    await expect(drainPermissionDirectoryOutbox(localDb, runtime, undefined, 100))
      .resolves.toEqual({ processed: 0, pending: 100 });
    await expect(drainPermissionDirectoryOutbox(localDb, runtime, undefined, 100))
      .resolves.toEqual({ processed: 1, pending: 0 });
    expect(deleteCalls).toBe(101);
    await expect(localDb.internal.findMany(
      "__datafn_permission_directory_outbox",
      [],
    )).resolves.toHaveLength(100);
  });

  it("does not let the interval drain consume a pre-commit directory task", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const runtime = { regionId: "region:test", directory };
    const taskId = await enqueuePermissionDirectorySync(localDb, {
      operation: "share",
      resource: "notes",
      id: "note:precommit",
      shareWith: { principalId: "user:partner" },
    }, namespace, runtime.regionId, { pending: true });

    await expect(drainPermissionDirectoryOutbox(localDb, runtime))
      .resolves.toEqual({ processed: 0, pending: 0 });
    await expect(localDb.internal.findMany(
      "__datafn_permission_directory_outbox",
      [],
    )).resolves.toHaveLength(1);

    await markPermissionDirectorySyncReady(localDb, taskId);
    await expect(drainPermissionDirectoryOutbox(localDb, runtime))
      .resolves.toEqual({ processed: 1, pending: 0 });
    await expect(localDb.internal.findMany(
      "__datafn_permission_directory_outbox",
      [],
    )).resolves.toHaveLength(0);
  });

  it("renews a pre-commit lease for operations longer than the recovery window", async () => {
    vi.useFakeTimers();
    try {
      const localDb = memoryAdapter();
      await localDb.initialize();
      const directory = createMemoryIndexedDirectoryStore();
      const runtime = { regionId: "region:test", directory };
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "unshare",
        resource: "notes",
        id: "note:long-running",
        shareWith: { principalId: "user:partner" },
      }, namespace, runtime.regionId, { pending: true });
      const initial = await localDb.internal.findOne(
        "__datafn_permission_directory_outbox",
        [{ field: "id", op: "eq", value: taskId }],
      );

      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

      const renewed = await localDb.internal.findOne(
        "__datafn_permission_directory_outbox",
        [{ field: "id", op: "eq", value: taskId }],
      );
      expect(Date.parse(String(renewed?.next_attempt_at)))
        .toBeGreaterThan(Date.parse(String(initial?.next_attempt_at)));
      await expect(drainPermissionDirectoryOutbox(localDb, runtime))
        .resolves.toEqual({ processed: 0, pending: 0 });

      await markPermissionDirectorySyncReady(localDb, taskId);
      await expect(drainPermissionDirectoryOutbox(localDb, runtime))
        .resolves.toEqual({ processed: 1, pending: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fences an in-flight lease renewal when publishing readiness", async () => {
    vi.useFakeTimers();
    try {
      const localDb = memoryAdapter();
      await localDb.initialize();
      const originalUpdate = localDb.internal.update.bind(localDb.internal);
      let interceptRenewal = false;
      let renewalWhere: Array<{ field: string; op: string; value: unknown }> = [];
      localDb.internal.update = async (table, where, data) => {
        if (
          interceptRenewal &&
          table === "__datafn_permission_directory_outbox"
        ) {
          interceptRenewal = false;
          renewalWhere = where;
          return 0;
        }
        if (table === "__datafn_permission_directory_outbox") return 1;
        return originalUpdate(table, where, data);
      };
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "share",
        resource: "notes",
        id: "note:renewal-race",
        shareWith: { principalId: "user:partner" },
      }, namespace, "region:test", { pending: true });
      interceptRenewal = true;

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(renewalWhere.some((clause) => clause.field === "next_attempt_at"))
        .toBe(true);
      await markPermissionDirectorySyncReady(localDb, taskId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports ownership loss without writing through the caller adapter", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const permissionMutation = {
      operation: "share",
      resource: "notes",
      id: "note:lost-release-lease",
      shareWith: { principalId: "user:partner" },
    } as const;
    const taskId = await enqueuePermissionDirectorySync(
      localDb,
      permissionMutation,
      namespace,
      "region:test",
      { pending: true },
    );
    const claimedLease = new Date(Date.now() + 60 * 1000).toISOString();
    await localDb.internal.update(
      "__datafn_permission_directory_outbox",
      [{ field: "id", op: "eq", value: taskId }],
      { next_attempt_at: claimedLease },
    );

    await expect(markPermissionDirectorySyncReady(localDb, taskId))
      .resolves.toBe("ownership-lost");

    const tasks = await localDb.internal.findMany(
      "__datafn_permission_directory_outbox",
      [],
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: taskId,
      next_attempt_at: claimedLease,
    });
  });

  it("stops a pending lease before a failing explicit drain lookup", async () => {
    vi.useFakeTimers();
    try {
      const localDb = memoryAdapter();
      await localDb.initialize();
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "share",
        resource: "notes",
        id: "note:lookup-failure",
        shareWith: { principalId: "user:partner" },
      }, namespace, "region:test", { pending: true });
      const originalFindOne = localDb.internal.findOne.bind(localDb.internal);
      const originalUpdate = localDb.internal.update.bind(localDb.internal);
      let renewalCalls = 0;
      localDb.internal.findOne = async () => {
        throw new Error("lookup unavailable");
      };
      localDb.internal.update = async (table, where, data) => {
        if (table === "__datafn_permission_directory_outbox") renewalCalls += 1;
        return originalUpdate(table, where, data);
      };

      await expect(drainPermissionDirectorySync(localDb, taskId, {
        regionId: "region:test",
        directory: createMemoryIndexedDirectoryStore(),
      })).rejects.toThrow("lookup unavailable");
      localDb.internal.findOne = originalFindOne;
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
      expect(renewalCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops a local pending heartbeat after background recovery deletes its task", async () => {
    vi.useFakeTimers();
    try {
      const localDb = memoryAdapter();
      await localDb.initialize();
      const directory = createMemoryIndexedDirectoryStore();
      const runtime = { regionId: "region:test", directory };
      const taskId = await enqueuePermissionDirectorySync(localDb, {
        operation: "share",
        resource: "notes",
        id: "note:background-recovery",
        shareWith: { principalId: "user:partner" },
      }, namespace, runtime.regionId, { pending: true });
      await localDb.internal.update(
        "__datafn_permission_directory_outbox",
        [{ field: "id", op: "eq", value: taskId }],
        { next_attempt_at: new Date(Date.now() - 1).toISOString() },
      );
      let updatesAfterDelete = 0;
      const originalUpdate = localDb.internal.update.bind(localDb.internal);
      await expect(drainPermissionDirectoryOutbox(localDb, runtime))
        .resolves.toEqual({ processed: 1, pending: 0 });
      localDb.internal.update = async (table, where, data) => {
        if (table === "__datafn_permission_directory_outbox") {
          updatesAfterDelete += 1;
        }
        return originalUpdate(table, where, data);
      };

      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
      expect(updatesAfterDelete).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fences a stale due-task selection when its owner renews before claim", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const runtime = { regionId: "region:test", directory };
    const taskId = await enqueuePermissionDirectorySync(localDb, {
      operation: "share",
      resource: "notes",
      id: "note:stale-selection",
      shareWith: { principalId: "user:partner" },
    }, namespace, runtime.regionId, { pending: true });
    await localDb.internal.update(
      "__datafn_permission_directory_outbox",
      [{ field: "id", op: "eq", value: taskId }],
      { next_attempt_at: new Date(Date.now() - 1_000).toISOString() },
    );
    let ownerRenewed = false;
    const renewedLease = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const drainInternal = new Proxy(localDb.internal, {
      get(target, property, receiver) {
        if (property === "findMany") {
          return async (table: string, where: any[], options: any) => {
            const selected = await localDb.internal.findMany(table, where, options);
            if (
              table === "__datafn_permission_directory_outbox" &&
              selected.some((task) => task.id === taskId)
            ) {
              ownerRenewed = true;
              await localDb.internal.update(
                "__datafn_permission_directory_outbox",
                [{ field: "id", op: "eq", value: taskId }],
                { next_attempt_at: renewedLease },
              );
            }
            return selected;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const staleSelectingDb = new Proxy(localDb, {
      get(target, property, receiver) {
        return property === "internal"
          ? drainInternal
          : Reflect.get(target, property, receiver);
      },
    });

    await expect(drainPermissionDirectoryOutbox(staleSelectingDb, runtime))
      .resolves.toEqual({ processed: 0, pending: 1 });
    expect(ownerRenewed).toBe(true);
    await expect(localDb.internal.findMany(
      "__datafn_permission_directory_outbox",
      [],
    )).resolves.toHaveLength(1);
    await expect(directory.query({
      index: "datafn.permission.principalResource",
      value: "user:partner#notes",
    })).resolves.toEqual({ records: [] });

    await expect(localDb.internal.update(
      "__datafn_permission_directory_outbox",
      [
        { field: "id", op: "eq", value: taskId },
        { field: "next_attempt_at", op: "eq", value: renewedLease },
      ],
      { next_attempt_at: new Date().toISOString() },
    )).resolves.toBe(1);
    await expect(drainPermissionDirectoryOutbox(localDb, runtime))
      .resolves.toEqual({ processed: 1, pending: 0 });
  });

  it("prequeues sequential transact shares before committing their grants", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    (localDb.capabilities.transactions as { supported: boolean }).supported = false;
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return { response, body: await response.json() as any };
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "transact-share-outbox",
        mutationId: "transact-share-outbox-insert",
        id: "note:transact-share-outbox",
        record: { title: "Transact share outbox" },
      });
      const originalInternalCreate = localDb.internal.create.bind(localDb.internal);
      localDb.internal.create = async (table, record) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        return originalInternalCreate(table, record);
      };

      const transacted = await request("transact", {
        atomic: false,
        steps: [{
          mutation: {
            resource: "notes",
            version: 1,
            operation: "share",
            clientId: "transact-share-outbox",
            mutationId: "transact-share-outbox-share",
            id: "note:transact-share-outbox",
            shareWith: { principalId: "user:partner", level: "viewer" },
          },
        }],
      });

      expect(transacted.body.result.ok).toBe(false);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close();
    }
  });

  it("does not commit a non-transactional push share when its retry cannot be persisted", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    (localDb.capabilities.transactions as { supported: boolean }).supported = false;
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return { response, body: await response.json() as any };
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "push-outbox",
        mutationId: "push-outbox-insert",
        id: "note:push-outbox",
        record: { title: "Push outbox" },
      });
      await localDb.internal.create("__datafn_idempotency", {
        id: "datafn:push-outbox:push-outbox-share",
        namespace: "datafn",
        client_id: "push-outbox",
        mutation_id: "push-outbox-share",
        result: JSON.stringify({
          ok: false,
          mutationId: "push-outbox-share",
          affectedIds: [],
          errors: [{ code: "INTERNAL", message: "retry", path: "$", retryable: true }],
          deduped: false,
        }),
        created_at: new Date().toISOString(),
      });
      localDb.internal.create = async (table: string) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        throw new Error(`unexpected internal create: ${table}`);
      };

      const pushed = await request("push", {
        clientId: "push-outbox",
        mutations: [{
          resource: "notes",
          version: 1,
          operation: "share",
          clientId: "push-outbox",
          mutationId: "push-outbox-share",
          id: "note:push-outbox",
          shareWith: { principalId: "user:partner", level: "viewer" },
        }],
      });

      expect(pushed.response.status).toBe(400);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close();
    }
  });

  it("rolls back a transactional push share when its outbox write fails", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return { response, body: await response.json() as any };
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "push-atomic-outbox",
        mutationId: "push-atomic-outbox-insert",
        id: "note:push-atomic-outbox",
        record: { title: "Atomic push outbox" },
      });
      await localDb.internal.create("__datafn_idempotency", {
        id: "datafn:push-atomic-outbox:push-atomic-outbox-share",
        namespace: "datafn",
        client_id: "push-atomic-outbox",
        mutation_id: "push-atomic-outbox-share",
        result: JSON.stringify({
          ok: false,
          mutationId: "push-atomic-outbox-share",
          affectedIds: [],
          errors: [{ code: "INTERNAL", message: "retry", path: "$", retryable: true }],
          deduped: false,
        }),
        created_at: new Date().toISOString(),
      });
      const originalInternalCreate = localDb.internal.create.bind(localDb.internal);
      localDb.internal.create = async (table, record) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        return originalInternalCreate(table, record);
      };

      const pushed = await request("push", {
        clientId: "push-atomic-outbox",
        mutations: [{
          resource: "notes",
          version: 1,
          operation: "share",
          clientId: "push-atomic-outbox",
          mutationId: "push-atomic-outbox-share",
          id: "note:push-atomic-outbox",
          shareWith: { principalId: "user:partner", level: "viewer" },
        }],
      });

      expect(pushed.response.status).toBe(400);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close();
    }
  });

  it("does not invalidate a push unshare when repair persistence is unavailable", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "push-unshare-prequeue",
        mutationId: "push-unshare-prequeue-insert",
        id: "note:push-unshare-prequeue",
        record: { title: "Push unshare prequeue" },
      });
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "push-unshare-prequeue",
        mutationId: "push-unshare-prequeue-share",
        id: "note:push-unshare-prequeue",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });

      await localDb.internal.create("__datafn_idempotency", {
        id: "datafn:push-unshare-prequeue:push-unshare-prequeue-unshare",
        namespace: "datafn",
        client_id: "push-unshare-prequeue",
        mutation_id: "push-unshare-prequeue-unshare",
        result: JSON.stringify({
          ok: false,
          mutationId: "push-unshare-prequeue-unshare",
          affectedIds: [],
          errors: [{ code: "INTERNAL", message: "retry", path: "$", retryable: true }],
          deduped: false,
        }),
        created_at: new Date().toISOString(),
      });

      const originalInternalCreate = localDb.internal.create.bind(localDb.internal);
      localDb.internal.create = async (table: string, record: Record<string, unknown>) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        return originalInternalCreate(table, record);
      };

      const response = await request("push", {
        clientId: "push-unshare-prequeue",
        mutations: [{
          resource: "notes",
          version: 1,
          operation: "unshare",
          clientId: "push-unshare-prequeue",
          mutationId: "push-unshare-prequeue-unshare",
          id: "note:push-unshare-prequeue",
          shareWith: { principalId: "user:partner" },
        }],
      });

      expect(response.status).toBe(400);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const indexed = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("durably restores a push unshare when its transaction rolls back", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let rejectPut = false;
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        if (rejectPut) throw new Error("directory unavailable");
        return backingDirectory.put(record);
      },
    };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "push-unshare-rollback",
        mutationId: "push-unshare-rollback-insert",
        id: "note:push-unshare-rollback",
        record: { title: "Push unshare rollback" },
      });
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "push-unshare-rollback",
        mutationId: "push-unshare-rollback-share",
        id: "note:push-unshare-rollback",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });

      const originalTransaction = localDb.transaction.bind(localDb);
      let transactionCalls = 0;
      localDb.transaction = (async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        return originalTransaction(async (tx: any) => {
          const result = await callback(tx);
          if (transactionCalls === 2) throw new Error("commit failed");
          return result;
        });
      }) as typeof localDb.transaction;
      rejectPut = true;

      const result = await request("push", {
        clientId: "push-unshare-rollback",
        mutations: [{
          resource: "notes",
          version: 1,
          operation: "unshare",
          clientId: "push-unshare-rollback",
          mutationId: "push-unshare-rollback-unshare",
          id: "note:push-unshare-rollback",
          shareWith: { principalId: "user:partner" },
        }],
      });

      expect(result.result.errors).toHaveLength(1);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      await expect(backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
      const [repairTask] = await localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(repairTask).toBeDefined();

      rejectPut = false;
      await expect(drainPermissionDirectorySync(
        localDb,
        String(repairTask.id),
        { regionId: "region:test", directory },
      )).resolves.toBe(true);
      const repairedRows = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(repairedRows.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("keeps a committed push share successful when immediate outbox draining throws", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const originalFindOne = localDb.internal.findOne.bind(localDb.internal);
    let rejectOutboxRead = false;
    const exposedDb = Object.create(localDb);
    exposedDb.internal = {
      ...localDb.internal,
      findOne: async (...args: Parameters<typeof originalFindOne>) => {
        if (args[0] === "__datafn_permission_directory_outbox" && rejectOutboxRead) {
          rejectOutboxRead = false;
          throw new Error("outbox read unavailable");
        }
        return originalFindOne(...args);
      },
    };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: exposedDb,
      plugins: [datafnMultiRegionPlugin({ regionId: "region:test", directory })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "push-drain",
        mutationId: "push-drain-insert",
        id: "note:push-drain",
        record: { title: "Push drain" },
      });
      rejectOutboxRead = true;

      const result = await request("push", {
        clientId: "push-drain",
        mutations: [{
          resource: "notes",
          version: 1,
          operation: "share",
          clientId: "push-drain",
          mutationId: "push-drain-share",
          id: "note:push-drain",
          shareWith: { principalId: "user:partner", level: "viewer" },
        }],
      });

      expect(result.result.ok).toBe(true);
      expect(result.result.applied).toEqual(["push-drain-share"]);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const [retryTask] = await localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(retryTask).toBeDefined();

      await expect(drainPermissionDirectorySync(
        localDb,
        String(retryTask.id),
        { regionId: "region:test", directory },
      )).resolves.toBe(true);
      const indexed = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("does not publish a permission-directory grant before an outer transaction commits", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "outer-rollback",
        mutationId: "outer-rollback-insert",
        id: "note:outer-rollback",
        record: { title: "Outer rollback" },
      });
      const result = await request("transact", {
        atomic: true,
        steps: [
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "share",
              clientId: "outer-rollback",
              mutationId: "outer-rollback-share",
              id: "note:outer-rollback",
              shareWith: { principalId: "user:partner", level: "viewer" },
            },
          },
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "insert",
              clientId: "outer-rollback",
              mutationId: "outer-rollback-conflict",
              id: "note:outer-rollback",
              record: { title: "Conflict" },
            },
          },
        ],
      });

      expect(result.result.ok).toBe(false);
      await expect(directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close?.();
    }
  });

  it("does not enter an outer unshare transaction when repair persistence is unavailable", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const directory = createMemoryIndexedDirectoryStore();
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "transact-unshare-prequeue",
        mutationId: "transact-unshare-prequeue-insert",
        id: "note:transact-unshare-prequeue",
        record: { title: "Transact unshare prequeue" },
      });
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "transact-unshare-prequeue",
        mutationId: "transact-unshare-prequeue-share",
        id: "note:transact-unshare-prequeue",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      const originalInternalCreate = localDb.internal.create.bind(localDb.internal);
      localDb.internal.create = async (table: string, record: Record<string, unknown>) => {
        if (table === "__datafn_permission_directory_outbox") {
          throw new Error("outbox unavailable");
        }
        return originalInternalCreate(table, record);
      };

      const response = await request("transact", {
        atomic: true,
        steps: [{
          mutation: {
            resource: "notes",
            version: 1,
            operation: "unshare",
            clientId: "transact-unshare-prequeue",
            mutationId: "transact-unshare-prequeue-unshare",
            id: "note:transact-unshare-prequeue",
            shareWith: { principalId: "user:partner" },
          },
        }],
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json() as any;
      expect(body.error).toMatchObject({
        code: "INTERNAL",
        message: "Transaction setup failed: outbox unavailable",
      });
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const indexed = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(indexed.records).toHaveLength(1);
    } finally {
      await localServer.close();
    }
  });

  it("does not publish a share from an outer transaction that rolls back", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let directoryPutCalls = 0;
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        directoryPutCalls += 1;
        return backingDirectory.put(record);
      },
    };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "share-outer-rollback",
        mutationId: "share-outer-rollback-insert",
        id: "note:share-outer-rollback",
        record: { title: "Share outer rollback" },
      });

      const result = await request("transact", {
        atomic: true,
        steps: [
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "share",
              clientId: "share-outer-rollback",
              mutationId: "share-outer-rollback-share",
              id: "note:share-outer-rollback",
              shareWith: { principalId: "user:partner", level: "viewer" },
            },
          },
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "insert",
              clientId: "share-outer-rollback",
              mutationId: "share-outer-rollback-conflict",
              id: "note:share-outer-rollback",
              record: { title: "Conflict" },
            },
          },
        ],
      });

      expect(result.result.ok).toBe(false);
      expect(directoryPutCalls).toBe(0);
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(0);
      await expect(backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      })).resolves.toEqual({ records: [] });
    } finally {
      await localServer.close();
    }
  });

  it("restores a permission-directory grant when an outer unshare transaction rolls back", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const backingDirectory = createMemoryIndexedDirectoryStore();
    let rejectPut = false;
    const directory = {
      ...backingDirectory,
      put: async (record: Parameters<typeof backingDirectory.put>[0]) => {
        if (rejectPut) throw new Error("directory unavailable");
        return backingDirectory.put(record);
      },
    };
    const localServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: localDb,
      plugins: [datafnMultiRegionPlugin({
        regionId: "region:test",
        directory,
      })],
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "user:owner",
      },
    });
    const request = async (path: string, payload: Record<string, unknown>) => {
      const response = await localServer.router.handle(new Request(
        `http://localhost/datafn/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ));
      return response.json() as Promise<any>;
    };

    try {
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "insert",
        clientId: "unshare-rollback",
        mutationId: "unshare-rollback-insert",
        id: "note:unshare-rollback",
        record: { title: "Unshare rollback" },
      });
      await request("mutation", {
        resource: "notes",
        version: 1,
        operation: "share",
        clientId: "unshare-rollback",
        mutationId: "unshare-rollback-share",
        id: "note:unshare-rollback",
        shareWith: { principalId: "user:partner", level: "viewer" },
      });
      const originalTransaction = (localDb as any).transaction.bind(localDb);
      let lostTaskId: string | undefined;
      (localDb as any).transaction = async (
        callback: (tx: TransactionAdapter) => Promise<unknown>,
      ) => {
        try {
          return await originalTransaction(async (tx: TransactionAdapter) => {
            const interceptedInternal = new Proxy(tx.internal, {
              get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver);
                if (property !== "update") {
                  return typeof value === "function" ? value.bind(target) : value;
                }
                return async (
                  table: string,
                  where: Array<{ field: string; op: string; value: unknown }>,
                  data: Record<string, unknown>,
                ) => {
                  if (
                    table === "__datafn_permission_directory_outbox" &&
                    where.length === 2 &&
                    Object.keys(data).length === 1 &&
                    "next_attempt_at" in data
                  ) {
                    lostTaskId = String(
                      where.find((clause) => clause.field === "id")?.value,
                    );
                    return 0;
                  }
                  return Reflect.apply(value, target, [table, where, data]);
                };
              },
            });
            const interceptedTx = new Proxy(tx, {
              get(target, property, receiver) {
                if (property === "internal") return interceptedInternal;
                return Reflect.get(target, property, receiver);
              },
            });
            return callback(interceptedTx);
          });
        } catch (error) {
          if (lostTaskId) {
            await localDb.internal.delete(
              "__datafn_permission_directory_outbox",
              [{ field: "id", op: "eq", value: lostTaskId }],
            );
          }
          throw error;
        }
      };
      rejectPut = true;

      const result = await request("transact", {
        atomic: true,
        steps: [
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "unshare",
              clientId: "unshare-rollback",
              mutationId: "unshare-rollback-unshare",
              id: "note:unshare-rollback",
              shareWith: { principalId: "user:partner" },
            },
          },
          {
            mutation: {
              resource: "notes",
              version: 1,
              operation: "insert",
              clientId: "unshare-rollback",
              mutationId: "unshare-rollback-conflict",
              id: "note:unshare-rollback",
              record: { title: "Conflict" },
            },
          },
        ],
      });

      expect(result.result.ok).toBe(false);
      expect(lostTaskId).toBeDefined();
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const directoryRows = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(directoryRows.records).toHaveLength(0);
      const [repairTask] = await localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      );
      expect(repairTask).toBeDefined();

      rejectPut = false;
      await expect(drainPermissionDirectorySync(
        localDb,
        String(repairTask.id),
        { regionId: "region:test", directory },
      )).resolves.toBe(true);
      const repairedRows = await backingDirectory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(repairedRows.records).toHaveLength(1);
      await expect(localDb.internal.findMany(
        "__datafn_permission_directory_outbox",
        [],
      )).resolves.toHaveLength(0);
    } finally {
      await localServer.close();
    }
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
