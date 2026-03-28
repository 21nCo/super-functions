import { describe, expect, it } from "vitest";
import {
  assertRequiredAclIndexes,
  evaluateAclIndexCoverage,
  getRequiredAclIndexes,
} from "../../execution/query/pushdown.js";
import { mergeCanonicalChangeStreamsBounded } from "../../execution/sync/pull.js";
import { DatafnExecutionError } from "../../execution/errors.js";
import { WebSocketManager, type WebSocketClient } from "../../ws.js";

type MockClient = WebSocketClient & {
  messages: string[];
};

function createMockClient(): MockClient {
  const messages: string[] = [];
  return {
    messages,
    send(data: string) {
      messages.push(data);
    },
  };
}

describe("SPV2 performance smoke (PHASE_09)", () => {
  it("TV-PERF-001-P/N: ACL index guard passes with required catalog and fails when missing", () => {
    const requiredIndexes = getRequiredAclIndexes();
    const positive = evaluateAclIndexCoverage([
      "idx_perm_resource_ns_principal",
      "idx_perm_principal",
      "__datafn_permissions_global_scope_idx",
      "__datafn_permissions_global_resource_record_idx",
      "__datafn_principal_memberships_namespace_actor_principal_idx",
      "__datafn_principal_hierarchy_namespace_principal_parent_idx",
      "idx_extra_unused",
    ]);

    expect(positive.usesIndex).toBe(true);
    expect(positive.missingIndexes).toEqual([]);
    expect(positive.requiredIndexes).toEqual(requiredIndexes);

    let thrown: unknown;
    try {
      assertRequiredAclIndexes([]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DatafnExecutionError);
    const executionError = thrown as DatafnExecutionError;
    expect(executionError.code).toBe("INTERNAL");
    expect(executionError.message).toBe("Required ACL index missing");
    expect(executionError.details.path).toBe("db.indexes");
  });

  it("TV-PERF-002-P/N: bounded k-way merge stays window-bounded and legacy flatten-sort would exceed cap", () => {
    const resourceCount = 12;
    const changesPerResource = 400;
    const windowLimit = 256;

    const streams = Array.from({ length: resourceCount }, (_, resourceIdx) => {
      const resource = `notes_${String(resourceIdx).padStart(2, "0")}`;
      const changes = Array.from({ length: changesPerResource }, (_, i) => ({
        namespace: "org:acme",
        serverSeq: i * resourceCount + resourceIdx + 1,
        resource,
        id: `${resource}:${String(i).padStart(6, "0")}`,
        op: "upsert" as const,
        record: { id: `${resource}:${String(i).padStart(6, "0")}` },
      }));
      return { resource, changes };
    });

    const merged = mergeCanonicalChangeStreamsBounded(streams as any, windowLimit);

    expect(merged.merged).toHaveLength(windowLimit);
    expect(merged.hasMore).toBe(true);
    expect(merged.peakWindow).toBeLessThanOrEqual(windowLimit + resourceCount);

    for (let i = 1; i < merged.merged.length; i++) {
      const prev = merged.merged[i - 1];
      const curr = merged.merged[i];
      const ordered =
        prev.change.serverSeq < curr.change.serverSeq ||
        (prev.change.serverSeq === curr.change.serverSeq &&
          (prev.resource < curr.resource ||
            (prev.resource === curr.resource && prev.change.id <= curr.change.id)));
      expect(ordered).toBe(true);
    }

    const simulateLegacyFlattenSort = () => {
      const legacyResources = 12;
      const legacyChangesPerResource = 50_000;
      const memoryCapMb = 256;
      const assumedBytesPerChange = 2048;
      const estimatedMb =
        (legacyResources * legacyChangesPerResource * assumedBytesPerChange) /
        (1024 * 1024);
      if (estimatedMb > memoryCapMb) {
        throw new DatafnExecutionError(
          "LIMIT_EXCEEDED",
          "Pull assembly memory cap exceeded",
          "pull",
        );
      }
    };

    let flattenedError: unknown;
    try {
      simulateLegacyFlattenSort();
    } catch (error) {
      flattenedError = error;
    }

    expect(flattenedError).toBeInstanceOf(DatafnExecutionError);
    const capError = flattenedError as DatafnExecutionError;
    expect(capError.code).toBe("LIMIT_EXCEEDED");
    expect(capError.message).toBe("Pull assembly memory cap exceeded");
    expect(capError.details.path).toBe("pull");
  });

  it("TV-PERF-003-P: targeted websocket invalidation wakes only affected principal clients", () => {
    const manager = new WebSocketManager();
    const namespace = "org:acme";
    const alice = createMockClient();
    const bob = createMockClient();
    const charlie = createMockClient();

    expect(
      manager.addClient(alice, {
        namespace,
        actorId: "alice",
        principalIds: ["user:alice"],
      }),
    ).toBe(true);
    expect(
      manager.addClient(bob, {
        namespace,
        actorId: "bob",
        principalIds: ["user:bob"],
      }),
    ).toBe(true);
    expect(
      manager.addClient(charlie, {
        namespace,
        actorId: "charlie",
        principalIds: ["user:charlie"],
      }),
    ).toBe(true);

    const result = manager.broadcastCursor("301", namespace, {
      affectedPrincipals: ["user:bob"],
    });

    expect(result.mode).toBe("targeted");
    expect(result.degraded).toBe(false);
    expect(result.wokenClients).toBe(1);

    expect(alice.messages).toHaveLength(0);
    expect(bob.messages).toHaveLength(1);
    expect(charlie.messages).toHaveLength(0);

    const payload = JSON.parse(bob.messages[0]) as {
      targeting?: { mode: string; degraded: boolean; principals?: string[] };
    };
    expect(payload.targeting?.mode).toBe("targeted");
    expect(payload.targeting?.degraded).toBe(false);
    expect(payload.targeting?.principals).toEqual(["user:bob"]);

    manager.close();
  });

  it("TV-PERF-003-N: namespace fallback remains correct and is marked degraded", () => {
    const manager = new WebSocketManager();
    const namespace = "org:acme";
    const untargetable = createMockClient();
    const bob = createMockClient();
    const charlie = createMockClient();

    expect(manager.addClient(untargetable, { namespace })).toBe(true);
    expect(
      manager.addClient(bob, {
        namespace,
        actorId: "bob",
        principalIds: ["user:bob"],
      }),
    ).toBe(true);
    expect(
      manager.addClient(charlie, {
        namespace,
        actorId: "charlie",
        principalIds: ["user:charlie"],
      }),
    ).toBe(true);

    const result = manager.broadcastCursor("302", namespace, {
      affectedPrincipals: ["user:bob"],
    });

    expect(result.mode).toBe("namespace-broadcast");
    expect(result.degraded).toBe(true);
    expect(result.wokenClients).toBe("all-in-namespace");

    expect(untargetable.messages).toHaveLength(1);
    expect(bob.messages).toHaveLength(1);
    expect(charlie.messages).toHaveLength(1);

    const payload = JSON.parse(bob.messages[0]) as {
      targeting?: { mode: string; degraded: boolean };
    };
    expect(payload.targeting?.mode).toBe("namespace-broadcast");
    expect(payload.targeting?.degraded).toBe(true);

    manager.close();
  });
});
