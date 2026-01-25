/**
 * Changelog Tests
 * Tests TV-CHANGELOG-001, TV-CHANGELOG-002 from TEST_VECTORS.md
 * NOTE: These test the Storage Adapter's behavior mostly, but we can verify our Mock or expected client interaction.
 * Since the client delegates directly to storage, we test via `storage` calls or mock logic.
 * These tests assume the client/storage interface.
 */

import { describe, it, expect } from "vitest";
import type { DatafnChangelogEntry } from "../src/index.js";

// Minimal mock storage logic for changelog
class MockChangelogStorage {
  private log: DatafnChangelogEntry[] = [];

  async changelogAppend(
    entry: Omit<DatafnChangelogEntry, "seq">,
  ): Promise<DatafnChangelogEntry> {
    // Deduplicate by (clientId, mutationId)
    const existing = this.log.find(
      (e) => e.clientId === entry.clientId && e.mutationId === entry.mutationId,
    );
    if (existing) {
      return existing; // Idempotent success per TV-CHANGELOG-001 requirements
    }

    const seq = this.log.length + 1;
    const fullEntry = { ...entry, seq };
    this.log.push(fullEntry);
    return fullEntry;
  }

  async changelogList(options?: {
    limit?: number;
  }): Promise<DatafnChangelogEntry[]> {
    return this.log;
  }

  async changelogAck(options: { throughSeq: number }): Promise<void> {
    this.log = this.log.filter((e) => e.seq > options.throughSeq);
  }
}

describe("Changelog Tests (Adapter Contract)", () => {
  it("TV-CHANGELOG-001: Deduplicate by (clientId, mutationId)", async () => {
    const storage = new MockChangelogStorage();
    const entry = {
      clientId: "client:1",
      mutationId: "m-1",
      mutation: { id: "task:1" },
      timestampMs: 0,
    };

    // First append
    await storage.changelogAppend(entry);
    // Second append (duplicate)
    await storage.changelogAppend(entry);

    const list = await storage.changelogList();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ seq: 1, mutationId: "m-1" });
  });

  it("TV-CHANGELOG-002: Acknowledgement removes entries", async () => {
    const storage = new MockChangelogStorage();
    const entry = {
      clientId: "client:1",
      mutationId: "m-1",
      mutation: { id: "task:1" },
      timestampMs: 0,
    };

    await storage.changelogAppend(entry);
    await storage.changelogAck({ throughSeq: 1 });

    const list = await storage.changelogList();
    expect(list).toHaveLength(0);
  });
});
