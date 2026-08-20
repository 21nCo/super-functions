import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryIndexedDirectoryStore,
  memoryAdapter,
} from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";
import { datafnMultiRegionPlugin } from "../../../plugins/multi-region.js";
import {
  drainPermissionDirectoryOutbox,
  drainPermissionDirectorySync,
  enqueuePermissionDirectorySync,
  ensurePermissionDirectoryOutbox,
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

  it("restores a permission-directory grant when an outer unshare transaction rolls back", async () => {
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
      await expect(localDb.findMany({
        model: globalPermissionsTable,
        where: [],
        namespace,
      })).resolves.toHaveLength(1);
      const directoryRows = await directory.query({
        index: "datafn.permission.principalResource",
        value: "user:partner#notes",
      });
      expect(directoryRows.records).toHaveLength(1);
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
