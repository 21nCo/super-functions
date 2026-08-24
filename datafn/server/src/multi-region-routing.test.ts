import { describe, expect, it, vi } from "vitest";
import {
  SuperfunctionsStoresDurableObject,
  cloudflareDurableObjectAtomicKVStore,
  redisAtomicKVStore,
  type CloudflareDurableObjectNamespace,
  type DurableObjectStateLike,
  type RedisCommandClient,
} from "@superfunctions/db/adapters";
import type { ConditionalKVStoreAdapter } from "@superfunctions/db";

import {
  DatafnRoutingError,
  claimDatafnNamespacePlacement,
  createConditionalKvDatafnPlacementDirectory,
  createDatafnGatewayRouter,
  createDatafnHmacRoutingAssertions,
  createMemoryDatafnPlacementDirectory,
  createMemoryDatafnRoutingReplayStore,
  migrateDatafnNamespace,
  validateDatafnPlacement,
  withDatafnRoutingAssertion,
  type DatafnNamespacePlacement,
} from "./multi-region-routing.js";

const fixedNow = Date.parse("2026-08-23T00:00:00.000Z");

describe("DataFn tenant placement", () => {
  it.each([
    ["Redis", createRedisTestStore],
    ["Cloudflare Durable Objects", createDurableObjectTestStore],
  ])("passes claim and fenced-move conformance with the %s provider adapter", async (_name, createStore) => {
    const directory = createConditionalKvDatafnPlacementDirectory(createStore(), {
      consistencyModel: "linearizable",
    });
    const first = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:provider",
      regionId: "eu",
    });
    expect(first.claimed).toBe(true);
    const moved = await directory.compareAndSet({
      namespace: first.placement.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: { ...first.placement, regionId: "us", epoch: 2 },
    });
    expect(moved).toMatchObject({ updated: true, placement: { regionId: "us", epoch: 2 } });
    await expect(directory.get("tenant:provider")).resolves.toMatchObject({
      regionId: "us",
      epoch: 2,
    });
  });

  it("claims initial ownership atomically and moves only through an epoch CAS", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const first = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "eu",
      now: () => fixedNow,
    });
    const concurrent = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "us",
      now: () => fixedNow,
    });

    expect(first).toMatchObject({ claimed: true, placement: { regionId: "eu", epoch: 1 } });
    expect(concurrent).toMatchObject({ claimed: false, placement: { regionId: "eu", epoch: 1 } });

    const stale = await directory.compareAndSet({
      namespace: "tenant:one",
      expectedEpoch: 0,
      expectedState: "active",
      next: { ...first.placement, epoch: 2, regionId: "us" },
    });
    expect(stale.updated).toBe(false);
    await expect(directory.get("tenant:one")).resolves.toMatchObject({ regionId: "eu", epoch: 1 });

    await expect(directory.compareAndSet({
      namespace: "tenant:one",
      expectedEpoch: 1,
      expectedState: "active",
      next: { ...first.placement, namespace: "tenant:other", epoch: 2 },
    })).rejects.toThrow("DATAFN_PLACEMENT_NAMESPACE_IMMUTABLE");
    await expect(directory.compareAndSet({
      namespace: "tenant:one",
      expectedEpoch: 1,
      expectedState: "active",
      next: { ...first.placement, epoch: 1, regionId: "us" },
    })).rejects.toThrow("DATAFN_PLACEMENT_EPOCH_NON_MONOTONIC");
  });

  it("runs the fenced migration protocol in order and preserves rollback evidence", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:move",
      regionId: "eu",
      now: () => fixedNow,
    });
    const order: string[] = [];
    const placement = await migrateDatafnNamespace({
      directory,
      namespace: "tenant:move",
      targetRegionId: "us",
      now: () => fixedNow + 1,
      hooks: {
        async quiesceSource() { order.push("quiesce"); },
        async drainPermissionDirectory() { order.push("drain-outbox"); },
        async copyTenantData() { order.push("copy"); },
        async validateTenantData() { order.push("validate"); },
        async rebuildPermissionDirectory() { order.push("reindex"); },
        async warmTarget() { order.push("warm"); },
        async resumeTarget() { order.push("resume"); },
      },
    });

    expect(order).toEqual([
      "quiesce",
      "drain-outbox",
      "copy",
      "validate",
      "reindex",
      "warm",
      "resume",
    ]);
    expect(placement).toMatchObject({
      regionId: "us",
      epoch: 4,
      state: "active",
      previousRegionId: "eu",
    });
  });

  it("does not resume the source when a rollback CAS loses a race", async () => {
    const base = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: base,
      namespace: "tenant:rollback-race",
      regionId: "eu",
      now: () => fixedNow,
    });
    const directory = {
      ...base,
      async compareAndSet(input: Parameters<typeof base.compareAndSet>[0]) {
        if (input.expectedState === "moving" && input.next.regionId === "eu") {
          return {
            updated: false,
            placement: { ...input.next, regionId: "ap", epoch: input.next.epoch + 1 },
          };
        }
        return base.compareAndSet(input);
      },
    };
    const original = new Error("copy failed");
    let rollbackSourceCalled = false;

    await expect(migrateDatafnNamespace({
      directory,
      namespace: "tenant:rollback-race",
      targetRegionId: "us",
      hooks: {
        async quiesceSource() {},
        async drainPermissionDirectory() {},
        async copyTenantData() { throw original; },
        async validateTenantData() {},
        async rebuildPermissionDirectory() {},
        async warmTarget() {},
        async resumeTarget() {},
        async rollbackSource() { rollbackSourceCalled = true; },
      },
    })).rejects.toMatchObject({
      message: "DATAFN_MIGRATION_ROLLBACK_EPOCH_CONFLICT",
      cause: original,
    });
    expect(rollbackSourceCalled).toBe(false);
  });

  it("retries only the idempotent target resume after activation", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:resume",
      regionId: "eu",
      now: () => fixedNow,
    });
    let currentTime = fixedNow;
    const hooks = {
      async quiesceSource() {},
      async drainPermissionDirectory() {},
      async copyTenantData() {},
      async validateTenantData() {},
      async rebuildPermissionDirectory() {},
      async warmTarget() {},
      async resumeTarget() { throw new Error("target still paused"); },
    };

    await expect(migrateDatafnNamespace({
      directory,
      namespace: "tenant:resume",
      targetRegionId: "us",
      now: () => currentTime,
      recoveryLeaseMs: 10,
      hooks,
    })).rejects.toThrow("target still paused");

    const pending = await directory.get("tenant:resume");
    expect(pending).toMatchObject({
      regionId: "us",
      state: "active",
      migration: { phase: "resume-target" },
    });
    await expect(validateDatafnPlacement({
      namespace: "tenant:resume",
      regionId: "us",
      runtime: { directory },
      trustedInternal: true,
    })).rejects.toMatchObject({ code: "DATAFN_NAMESPACE_MOVING" });
    const dispatch = vi.fn(async () => Response.json({ ok: true }));
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: () => "tenant:resume",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch },
      assertionSigner: { sign: () => "unused" },
    });
    expect((await gateway.handle(new Request("https://data.example/datafn/query"))).status)
      .toBe(409);
    expect(dispatch).not.toHaveBeenCalled();

    const resumed: Array<{ recovery?: boolean; sourceRegionId: string }> = [];
    currentTime += 11;
    const placement = await migrateDatafnNamespace({
      directory,
      namespace: "tenant:resume",
      targetRegionId: "us",
      now: () => currentTime,
      recoveryLeaseMs: 10,
      hooks: {
        ...hooks,
        async resumeTarget(context) {
          resumed.push(context);
        },
      },
    });

    expect(placement).toMatchObject({ regionId: "us", epoch: 5 });
    expect(resumed).toMatchObject([{ recovery: true, sourceRegionId: "eu" }]);
  });

  it("recovers a matching migration left in the moving state", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const claimed = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:interrupted",
      regionId: "eu",
      now: () => fixedNow,
    });
    const moving: DatafnNamespacePlacement = {
      ...claimed.placement,
      epoch: 2,
      state: "moving",
      movingToRegionId: "us",
      previousRegionId: "eu",
      migration: {
        phase: "moving",
        sourceRegionId: "eu",
        targetRegionId: "us",
        sourceEpoch: 1,
        movingEpoch: 2,
      },
    };
    expect((await directory.compareAndSet({
      namespace: moving.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: moving,
    })).updated).toBe(true);
    const recoveries: boolean[] = [];

    const placement = await migrateDatafnNamespace({
      directory,
      namespace: moving.namespace,
      targetRegionId: "us",
      hooks: {
        async quiesceSource(context) { recoveries.push(Boolean(context.recovery)); },
        async drainPermissionDirectory() {},
        async copyTenantData() {},
        async validateTenantData() {},
        async rebuildPermissionDirectory() {},
        async warmTarget() {},
        async resumeTarget() {},
      },
    });

    expect(recoveries).toEqual([true]);
    expect(placement).toMatchObject({ regionId: "us", epoch: 5, state: "active" });
    expect(placement.migration).toBeUndefined();
  });

  it("serializes moving-state recovery with a durable lease", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:serialized",
      regionId: "eu",
      now: () => fixedNow,
    });
    let releaseFirst!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const first = migrateDatafnNamespace({
      directory,
      namespace: "tenant:serialized",
      targetRegionId: "us",
      now: () => fixedNow + 1,
      recoveryLeaseMs: 1_000,
      hooks: {
        ...emptyMigrationHooks(),
        async quiesceSource() {
          markEntered();
          await blocked;
        },
      },
    });
    await entered;
    const retryHook = vi.fn();
    await expect(migrateDatafnNamespace({
      directory,
      namespace: "tenant:serialized",
      targetRegionId: "us",
      now: () => fixedNow + 2,
      recoveryLeaseMs: 1_000,
      hooks: { ...emptyMigrationHooks(), quiesceSource: retryHook },
    })).rejects.toThrow("DATAFN_MIGRATION_ALREADY_IN_PROGRESS");
    expect(retryHook).not.toHaveBeenCalled();
    releaseFirst();
    await first;
  });

  it("rolls a failed move back without leaving false target-resume evidence", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:rollback",
      regionId: "eu",
    });
    const rollbackSource = vi.fn();

    await expect(migrateDatafnNamespace({
      directory,
      namespace: "tenant:rollback",
      targetRegionId: "us",
      hooks: {
        async quiesceSource() {},
        async drainPermissionDirectory() {},
        async copyTenantData() { throw new Error("copy failed"); },
        async validateTenantData() {},
        async rebuildPermissionDirectory() {},
        async warmTarget() {},
        async resumeTarget() {},
        rollbackSource,
      },
    })).rejects.toThrow("copy failed");

    await expect(directory.get("tenant:rollback")).resolves.toMatchObject({
      regionId: "eu",
      epoch: 3,
      state: "active",
    });
    expect((await directory.get("tenant:rollback"))?.migration).toBeUndefined();
    expect(rollbackSource).toHaveBeenCalledOnce();
  });

  it("rejects a same-region destination-only update instead of ignoring it", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:destination",
      regionId: "eu",
      destinationRef: "cell:v1",
    });
    await expect(migrateDatafnNamespace({
      directory,
      namespace: "tenant:destination",
      targetRegionId: "eu",
      targetDestinationRef: "cell:v2",
      hooks: emptyMigrationHooks(),
    })).rejects.toThrow("DATAFN_MIGRATION_DESTINATION_UPDATE_REQUIRES_MOVE");
  });
});

function emptyMigrationHooks() {
  return {
    async quiesceSource() {},
    async drainPermissionDirectory() {},
    async copyTenantData() {},
    async validateTenantData() {},
    async rebuildPermissionDirectory() {},
    async warmTarget() {},
    async resumeTarget() {},
  };
}

function createRedisTestStore(): ConditionalKVStoreAdapter {
  const values = new Map<string, string>();
  const client: RedisCommandClient = {
    async sendCommand(command) {
      switch (command[0]) {
        case "GET":
          return values.get(command[1]!) ?? null;
        case "SET": {
          const key = command[1]!;
          if (command.includes("NX") && values.has(key)) return null;
          values.set(key, command[2]!);
          return "OK";
        }
        case "EVAL": {
          const key = command[3]!;
          const current = values.get(key) ?? null;
          const expectingNull = command[4] === "1";
          const expected = expectingNull ? null : command[5]!;
          if (current !== expected) return [0, current];
          values.set(key, command[6]!);
          return [1, current];
        }
        case "DEL":
          return values.delete(command[1]!) ? 1 : 0;
        default:
          throw new Error(`unsupported test Redis command ${command[0]}`);
      }
    },
  };
  return redisAtomicKVStore(client);
}

function createDurableObjectTestStore(): ConditionalKVStoreAdapter {
  const values = new Map<string, unknown>();
  const state: DurableObjectStateLike = {
    storage: {
      async get<T>(key: string) { return values.get(key) as T | undefined; },
      async put<T>(key: string, value: T) { values.set(key, value); },
      async delete(key: string) { return values.delete(key); },
    },
  };
  const object = new SuperfunctionsStoresDurableObject(state);
  const namespace: CloudflareDurableObjectNamespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: (input, init) => object.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
    }),
  };
  return cloudflareDurableObjectAtomicKVStore(namespace);
}

describe("DataFn canonical gateway", () => {
  it("routes two namespaces through one URL without exposing cell destinations", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await Promise.all([
      claimDatafnNamespacePlacement({ directory, namespace: "tenant:eu", regionId: "eu" }),
      claimDatafnNamespacePlacement({ directory, namespace: "tenant:us", regionId: "us" }),
    ]);
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const replayStore = createMemoryDatafnRoutingReplayStore();
    const executed: Array<{ region: string; namespace: string }> = [];
    const cells = new Map([
      ["eu", cell("eu")],
      ["us", cell("us")],
    ]);
    function cell(region: string) {
      return async (request: Request, namespace: string): Promise<Response> => {
        await validateDatafnPlacement({
          namespace,
          regionId: region,
          runtime: {
            directory,
            requireRoutingAssertion: true,
            assertionVerifier: assertions,
            replayStore,
          },
          request,
        });
        executed.push({ region, namespace });
        return Response.json({ ok: true, result: { region } });
      };
    }
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: (request) => request.headers.get("x-authenticated-namespace") ?? "",
      cellRegistry: {
        resolve: ({ regionId }) => {
          const target = cells.get(regionId);
          if (!target) throw new Error("missing target");
          return target;
        },
      },
      dispatcher: {
        dispatch: ({ target, request, assertion, placement }) =>
          target(withDatafnRoutingAssertion(request, assertion), placement.namespace),
      },
      assertionSigner: assertions,
    });

    const eu = await gateway.handle(new Request("https://data.example/datafn/query", {
      method: "POST",
      headers: { "x-authenticated-namespace": "tenant:eu" },
      body: JSON.stringify({ resource: "note" }),
    }));
    const us = await gateway.handle(new Request("https://data.example/datafn/mutation", {
      method: "POST",
      headers: { "x-authenticated-namespace": "tenant:us" },
      body: JSON.stringify({ resource: "note", operation: "create" }),
    }));

    expect(eu.status).toBe(200);
    expect(us.status).toBe(200);
    expect(executed).toEqual([
      { region: "eu", namespace: "tenant:eu" },
      { region: "us", namespace: "tenant:us" },
    ]);
    expect(JSON.stringify(await us.json())).not.toContain("destination");
  });

  it("keeps the request body available when namespace derivation reads it", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:body",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const replayStore = createMemoryDatafnRoutingReplayStore();
    let forwardedBody = "";
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: async (request) => {
        const body = await request.json() as { namespace: string };
        return body.namespace;
      },
      cellRegistry: { resolve: () => ({}) },
      dispatcher: {
        async dispatch({ request, assertion, placement }) {
          const forwarded = withDatafnRoutingAssertion(request, assertion);
          await validateDatafnPlacement({
            namespace: placement.namespace,
            regionId: placement.regionId,
            runtime: {
              directory,
              requireRoutingAssertion: true,
              assertionVerifier: assertions,
              replayStore,
            },
            request: forwarded,
          });
          forwardedBody = await forwarded.text();
          return Response.json({ ok: true });
        },
      },
      assertionSigner: assertions,
    });

    const body = JSON.stringify({ namespace: "tenant:body", value: "preserved" });
    const response = await gateway.handle(new Request(
      "https://data.example/datafn/mutation?mode=strict",
      { method: "POST", body },
    ));

    expect(response.status).toBe(200);
    expect(forwardedBody).toBe(body);
  });

  it("strips spoofed headers and retries a stale epoch once before any mutation effect", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const claimed = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:move",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const replayStore = createMemoryDatafnRoutingReplayStore();
    const effects = { eu: 0, us: 0 };
    const dispatches: string[] = [];
    const target = (regionId: "eu" | "us") => async (
      request: Request,
      namespace: string,
    ): Promise<Response> => {
      try {
        await validateDatafnPlacement({
          namespace,
          regionId,
          runtime: {
            directory,
            requireRoutingAssertion: true,
            assertionVerifier: assertions,
            replayStore,
          },
          request,
        });
      } catch (error) {
        if (error instanceof DatafnRoutingError) return error.toResponse();
        throw error;
      }
      effects[regionId]++;
      return Response.json({ ok: true });
    };
    const cells = { eu: target("eu"), us: target("us") };
    const gateway = createDatafnGatewayRouter({
      directory,
      cacheTtlMs: 60_000,
      deriveNamespace: () => "tenant:move",
      cellRegistry: { resolve: ({ regionId }) => cells[regionId as "eu" | "us"] },
      dispatcher: {
        dispatch: ({ target: selected, request, assertion, placement }) => {
          dispatches.push(placement.regionId);
          return selected(withDatafnRoutingAssertion(request, assertion), placement.namespace);
        },
      },
      assertionSigner: assertions,
    });

    // Prime the gateway cache without a visible effect.
    expect((await gateway.handle(new Request("https://data.example/datafn/query", {
      method: "POST",
      body: "{}",
    }))).status).toBe(200);
    effects.eu = 0;
    dispatches.length = 0;

    const moved: DatafnNamespacePlacement = {
      ...claimed.placement,
      regionId: "us",
      epoch: 2,
      previousRegionId: "eu",
      updatedAt: new Date().toISOString(),
    };
    expect((await directory.compareAndSet({
      namespace: moved.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: moved,
    })).updated).toBe(true);

    const response = await gateway.handle(new Request("https://data.example/datafn/mutation", {
      method: "POST",
      headers: {
        "x-datafn-routing-assertion": "attacker-controlled",
        "x-datafn-routing-region": "attacker-region",
      },
      body: JSON.stringify({ operation: "create" }),
    }));

    expect(response.status).toBe(200);
    expect(dispatches).toEqual(["eu", "us"]);
    expect(effects).toEqual({ eu: 0, us: 1 });
  });

  it("fails closed when a directory is unavailable", async () => {
    const gateway = createDatafnGatewayRouter({
      directory: {
        async get() { throw new Error("offline"); },
        async putIfAbsent(placement) { return { inserted: false, placement }; },
        async compareAndSet({ next }) { return { updated: false, placement: next }; },
      },
      deriveNamespace: () => "tenant:one",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => Response.json({ ok: true }) },
      assertionSigner: { sign: () => "unused" },
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DATAFN_PLACEMENT_UNAVAILABLE", details: { retryable: true } },
    });
  });

  it("reports namespace-provider outages as retryable availability failures", async () => {
    const gateway = createDatafnGatewayRouter({
      directory: createMemoryDatafnPlacementDirectory(),
      deriveNamespace: () => { throw new Error("session store offline"); },
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => Response.json({ ok: true }) },
      assertionSigner: { sign: () => "unused" },
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "DATAFN_CELL_UNAVAILABLE",
        details: { retryable: true, executionStarted: false },
      },
    });
  });

  it("bounds request bodies before dispatch", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:bounded",
      regionId: "eu",
    });
    const dispatch = vi.fn(async () => Response.json({ ok: true }));
    const deriveNamespace = vi.fn(async (request: Request) => {
      await request.text();
      return "tenant:bounded";
    });
    const gateway = createDatafnGatewayRouter({
      directory,
      maxBodyBytes: 5,
      deriveNamespace,
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch },
      assertionSigner: { sign: () => "unused" },
    });

    const response = await gateway.handle(new Request(
      "https://data.example/datafn/mutation",
      { method: "POST", body: "123456" },
    ));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DATAFN_PAYLOAD_TOO_LARGE", details: { retryable: false } },
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(deriveNamespace).not.toHaveBeenCalled();
  });

  it("marks a rejected dispatch as an ambiguous non-retryable outcome", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:ambiguous",
      regionId: "eu",
    });
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: () => "tenant:ambiguous",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => { throw new Error("connection reset"); } },
      assertionSigner: { sign: () => "assertion" },
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "DATAFN_CELL_UNAVAILABLE",
        details: { retryable: false, executionStarted: true },
      },
    });
  });

  it("stops after one authenticated pre-execution retry", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:retry",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const replayStore = createMemoryDatafnRoutingReplayStore();
    const dispatch = vi.fn(async (input: {
      request: Request;
      assertion: string;
      placement: DatafnNamespacePlacement;
    }) => {
      await validateDatafnPlacement({
        namespace: input.placement.namespace,
        regionId: input.placement.regionId,
        runtime: {
          directory,
          requireRoutingAssertion: true,
          assertionVerifier: assertions,
          replayStore,
        },
        request: withDatafnRoutingAssertion(input.request, input.assertion),
      });
      return new DatafnRoutingError({
        code: "DATAFN_REGION_MISMATCH",
        message: "stale placement",
        status: 409,
        retryable: true,
        internal: true,
      }).toResponse();
    });
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: () => "tenant:retry",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch },
      assertionSigner: assertions,
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DATAFN_ROUTING_RETRY_EXHAUSTED" },
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [409, false],
    [200, true],
  ])("does not retry a mismatch-shaped response without both internal signals", async (
    status,
    includeHeader,
  ) => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:no-retry",
      regionId: "eu",
    });
    const dispatch = vi.fn(async () => Response.json({
      error: {
        code: "DATAFN_REGION_MISMATCH",
        details: { executionStarted: false },
      },
    }, {
      status,
      headers: includeHeader ? { "x-datafn-region-mismatch": "1" } : undefined,
    }));
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: () => "tenant:no-retry",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch },
      assertionSigner: { sign: () => "assertion" },
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(status);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("falls back to the default cache TTL for malformed placement expiry", async () => {
    const base = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: base,
      namespace: "tenant:cache",
      regionId: "eu",
      cacheExpiresAt: "not-a-date",
    });
    const get = vi.fn(base.get.bind(base));
    const gateway = createDatafnGatewayRouter({
      directory: { ...base, get },
      deriveNamespace: () => "tenant:cache",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => Response.json({ ok: true }) },
      assertionSigner: { sign: () => "assertion" },
    });

    await gateway.handle(new Request("https://data.example/datafn/query"));
    await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(get).toHaveBeenCalledOnce();
  });

  it("evicts the oldest namespace when the placement cache reaches its bound", async () => {
    const base = createMemoryDatafnPlacementDirectory();
    for (const namespace of ["tenant:first", "tenant:second"]) {
      await claimDatafnNamespacePlacement({ directory: base, namespace, regionId: "eu" });
    }
    const get = vi.fn(base.get.bind(base));
    const gateway = createDatafnGatewayRouter({
      directory: { ...base, get },
      maxCacheEntries: 1,
      deriveNamespace: (request) => request.headers.get("x-namespace") ?? "",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => Response.json({ ok: true }) },
      assertionSigner: { sign: () => "assertion" },
    });

    const route = (namespace: string) => gateway.handle(new Request(
      "https://data.example/datafn/query",
      { headers: { "x-namespace": namespace } },
    ));
    await route("tenant:first");
    await route("tenant:second");
    await route("tenant:first");
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe("DataFn cell fencing", () => {
  it("fails closed while a namespace migration is moving", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const claimed = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:moving",
      regionId: "eu",
    });
    await directory.compareAndSet({
      namespace: claimed.placement.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: {
        ...claimed.placement,
        epoch: 2,
        state: "moving",
        movingToRegionId: "us",
        previousRegionId: "eu",
      },
    });

    await expect(validateDatafnPlacement({
      namespace: claimed.placement.namespace,
      regionId: "eu",
      runtime: { directory },
      trustedInternal: true,
    })).rejects.toMatchObject({
      code: "DATAFN_NAMESPACE_MOVING",
      status: 409,
      executionStarted: false,
    });
  });

  it("does not expose the gateway retry header to unauthenticated direct callers", async () => {
    const error = new DatafnRoutingError({
      code: "DATAFN_REGION_MISMATCH",
      message: "wrong cell",
      status: 409,
      retryable: true,
    });
    expect(error.toResponse().headers.get("x-datafn-region-mismatch")).toBeNull();
    const internal = new DatafnRoutingError({
      code: "DATAFN_REGION_MISMATCH",
      message: "wrong cell",
      status: 409,
      retryable: true,
      internal: true,
    });
    expect(internal.toResponse().headers.get("x-datafn-region-mismatch")).toBe("1");
  });

  it("rejects spoofed assertions before execution", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    await expect(validateDatafnPlacement({
      namespace: "tenant:one",
      regionId: "eu",
      runtime: {
        directory,
        requireRoutingAssertion: true,
        assertionVerifier: assertions,
        replayStore: createMemoryDatafnRoutingReplayStore(),
      },
      request: new Request("https://cell.internal/datafn/query", {
        headers: { "x-datafn-routing-assertion": "forged" },
      }),
    })).rejects.toMatchObject({
      code: "DATAFN_ROUTING_ASSERTION_INVALID",
      executionStarted: false,
    });
  });

  it("binds assertions to query, body presence, and a single nonce claim", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:bound",
      regionId: "eu",
      now: () => fixedNow,
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
      now: () => fixedNow,
    });
    const replayStore = createMemoryDatafnRoutingReplayStore({ now: () => fixedNow });
    const runtime = {
      directory,
      requireRoutingAssertion: true,
      assertionVerifier: assertions,
      replayStore,
    };
    const claims = {
      version: 1 as const,
      namespace: "tenant:bound",
      regionId: "eu",
      epoch: 1,
      requestId: "request:bound",
      method: "GET",
      path: "/datafn/query",
      audience: "datafn-cell",
      issuedAt: fixedNow,
      expiresAt: fixedNow + 30_000,
      nonce: "nonce:path",
    };
    const queryAssertion = await assertions.sign(claims);
    await expect(validateDatafnPlacement({
      namespace: claims.namespace,
      regionId: claims.regionId,
      runtime,
      request: withDatafnRoutingAssertion(new Request(
        "https://cell.internal/datafn/query?scope=all",
        { headers: { "x-request-id": claims.requestId } },
      ), queryAssertion),
    })).rejects.toMatchObject({ code: "DATAFN_ROUTING_ASSERTION_INVALID" });

    const bodyClaims = {
      ...claims,
      method: "POST",
      path: "/datafn/query?scope=all",
      nonce: "nonce:body",
    };
    const bodyAssertion = await assertions.sign(bodyClaims);
    await expect(validateDatafnPlacement({
      namespace: claims.namespace,
      regionId: claims.regionId,
      runtime,
      request: withDatafnRoutingAssertion(new Request(
        "https://cell.internal/datafn/query?scope=all",
        {
          method: "POST",
          headers: { "x-request-id": claims.requestId },
          body: "unexpected",
        },
      ), bodyAssertion),
    })).rejects.toMatchObject({ code: "DATAFN_ROUTING_ASSERTION_INVALID" });

    const replayClaims = {
      ...claims,
      path: "/datafn/query?scope=all",
      nonce: "nonce:replay",
    };
    const replayAssertion = await assertions.sign(replayClaims);
    const replayRequest = () => withDatafnRoutingAssertion(new Request(
      "https://cell.internal/datafn/query?scope=all",
      { headers: { "x-request-id": claims.requestId } },
    ), replayAssertion);
    await expect(validateDatafnPlacement({
      namespace: claims.namespace,
      regionId: claims.regionId,
      runtime,
      request: replayRequest(),
    })).resolves.toMatchObject({
      placement: { namespace: claims.namespace },
      assertion: { nonce: replayClaims.nonce },
    });
    await expect(validateDatafnPlacement({
      namespace: claims.namespace,
      regionId: claims.regionId,
      runtime,
      request: replayRequest(),
    })).rejects.toMatchObject({ code: "DATAFN_ROUTING_ASSERTION_INVALID" });
  });
});
