import { describe, it, expect, vi } from "vitest";
import { applyPullResult, GLOBAL_CURSOR_KEY } from "../src/sync/apply.js";
import { SyncEngine } from "../src/sync/engine.js";
import { EventBus } from "../src/events/bus.js";

const ACTOR_FEED_CURSOR_KEY = "__datafn_actor_feed__";

class MockStorageAdapter {
  private records = new Map<string, Map<string, Record<string, unknown>>>();
  private cursors = new Map<string, string | null>();
  private hydration = new Map<string, "notStarted" | "hydrating" | "ready">();
  private changelog: Array<any> = [];

  async getRecord(resource: string, id: string): Promise<Record<string, unknown> | null> {
    return this.records.get(resource)?.get(id) ?? null;
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    return Array.from(this.records.get(resource)?.values() ?? []);
  }

  async upsertRecord(resource: string, record: Record<string, unknown>): Promise<void> {
    if (!this.records.has(resource)) {
      this.records.set(resource, new Map());
    }
    this.records.get(resource)!.set(String(record.id), { ...record });
  }

  async deleteRecord(resource: string, id: string): Promise<void> {
    this.records.get(resource)?.delete(id);
  }

  async mergeRecord(
    resource: string,
    id: string,
    partial: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.records.has(resource)) {
      this.records.set(resource, new Map());
    }
    const existing = this.records.get(resource)!.get(id) ?? {};
    const merged = { ...existing, ...partial, id };
    this.records.get(resource)!.set(id, merged);
    return merged;
  }

  async listJoinRows(_relationKey: string): Promise<Array<Record<string, unknown>>> {
    return [];
  }
  async getJoinRows(_relationKey: string, _fromId: string): Promise<Array<Record<string, unknown>>> {
    return [];
  }
  async getJoinRowsInverse(_relationKey: string, _toId: string): Promise<Array<Record<string, unknown>>> {
    return [];
  }
  async upsertJoinRow(_relationKey: string, _row: Record<string, unknown>): Promise<void> {}
  async setJoinRows(_relationKey: string, _rows: Array<Record<string, unknown>>): Promise<void> {}
  async deleteJoinRow(_relationKey: string, _from: string, _to: string): Promise<void> {}

  async findRecords(resource: string, field: string, value: unknown): Promise<Record<string, unknown>[]> {
    const records = await this.listRecords(resource);
    return records.filter((row) => row[field] === value);
  }

  async getCursor(resource: string): Promise<string | null> {
    return this.cursors.get(resource) ?? null;
  }

  async setCursor(resource: string, cursor: string | null): Promise<void> {
    this.cursors.set(resource, cursor);
  }

  async getHydrationState(resource: string): Promise<"notStarted" | "hydrating" | "ready"> {
    return this.hydration.get(resource) ?? "notStarted";
  }

  async setHydrationState(
    resource: string,
    state: "notStarted" | "hydrating" | "ready",
  ): Promise<void> {
    this.hydration.set(resource, state);
  }

  async changelogAppend(entry: Omit<any, "seq">): Promise<any> {
    const seq = this.changelog.length + 1;
    const full = { ...entry, seq };
    this.changelog.push(full);
    return full;
  }
  async changelogList(_options?: { limit?: number }): Promise<any[]> {
    return [...this.changelog];
  }
  async changelogAck(options: { throughSeq: number }): Promise<void> {
    this.changelog = this.changelog.filter((entry) => entry.seq > options.throughSeq);
  }

  async countRecords(resource: string): Promise<number> {
    return (await this.listRecords(resource)).length;
  }
  async countJoinRows(_relationKey: string): Promise<number> {
    return 0;
  }

  async close(): Promise<void> {}
  async clearAll(): Promise<void> {
    this.records.clear();
    this.cursors.clear();
    this.hydration.clear();
    this.changelog = [];
  }
  async healthCheck(): Promise<{ ok: boolean; issues: string[] }> {
    return { ok: true, issues: [] };
  }
}

const schema = {
  resources: [
    {
      name: "notes",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

describe("SPV2 client sync apply/engine (PHASE_07)", () => {
  it("TV-SYNC-002-N: duplicate grant_backfill upserts do not duplicate local rows", async () => {
    const storage = new MockStorageAdapter();

    await applyPullResult(storage as any, {
      ok: true,
      records: {
        notes: [
          { id: "old_1", title: "Backfill" },
          { id: "old_1", title: "Backfill" },
        ],
      },
      deleted: { notes: [] },
      cursors: { notes: "20" },
    });

    const rows = await storage.listRecords("notes");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("old_1");
  });

  it("TV-SYNC-003-P: applying the same grant/revoke batch twice yields deterministic terminal state", async () => {
    const storage = new MockStorageAdapter();
    const batch = {
      ok: true,
      records: { notes: [{ id: "n1", title: "temp" }] },
      deleted: { notes: ["n1"] },
      cursors: { notes: "101" },
    };

    await applyPullResult(storage as any, batch);
    await applyPullResult(storage as any, batch);

    expect(await storage.listRecords("notes")).toEqual([]);
    expect(await storage.getCursor("notes")).toBe("101");
    expect(await storage.getCursor(GLOBAL_CURSOR_KEY)).toBe("101");
  });

  it("TV-SYNC-003-N: canonical pull rejects non-monotonic cursor advancement", async () => {
    const storage = new MockStorageAdapter();
    await storage.setCursor("notes", "101");

    await expect(
      applyPullResult(storage as any, {
        ok: true,
        records: { notes: [] },
        deleted: { notes: [] },
        cursors: { notes: "99" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Non-monotonic cursor",
      details: { path: "cursors.notes" },
    });
  });

  it("TV-SYNC-003-N (global): global pull rejects non-monotonic nextCursor", async () => {
    const storage = new MockStorageAdapter();
    await storage.setCursor(GLOBAL_CURSOR_KEY, "101");

    await expect(
      applyPullResult(storage as any, {
        ok: true,
        changes: [],
        nextCursor: "99",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Non-monotonic cursor",
      details: { path: "nextCursor" },
    });
  });

  it("TV-SYNC-004: sync engine includes actor feed cursor in canonical pull payloads", async () => {
    const storage = new MockStorageAdapter();
    await storage.setCursor("notes", "10");
    await storage.setCursor(ACTOR_FEED_CURSOR_KEY, "42");

    const remote = {
      query: vi.fn(),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
      pull: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          records: { notes: [] },
          deleted: { notes: [] },
          cursors: {
            notes: "10",
            [ACTOR_FEED_CURSOR_KEY]: "42",
          },
          hasMore: false,
        },
      }),
    };

    const engine = new SyncEngine(
      storage as any,
      remote as any,
      new EventBus(),
      "client:sync4",
      schema as any,
      { pullBatchSize: 50 },
      [],
      () => 0,
    );

    await engine.pullNow();

    expect(remote.pull).toHaveBeenCalledTimes(1);
    expect(remote.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        cursors: expect.objectContaining({
          notes: "10",
          [ACTOR_FEED_CURSOR_KEY]: "42",
        }),
      }),
    );
  });
});

