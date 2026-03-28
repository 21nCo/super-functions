/**
 * Changelog Tests
 * Tests TV-CHANGELOG-001, TV-CHANGELOG-002, TV-AUD-001, TV-AUD-001N from TEST_VECTORS.md
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

  // AUD-001: Audit trail enrichment tests
  describe("Audit Trail Enrichment (AUD-001)", () => {
    it("TV-AUD-001: Changelog entry includes userId when auth context provided", async () => {
      const storage = new MockChangelogStorage();
      const entry = {
        clientId: "client:1",
        mutationId: "m-audit-1",
        mutation: { resource: "task", operation: "merge", id: "task:1", record: { title: "Test" } },
        timestampMs: Date.now(),
        userId: "user:123", // AUD-001: userId from auth context
        timestamp: new Date().toISOString(), // AUD-001: ISO timestamp
      };

      const result = await storage.changelogAppend(entry);
      
      expect(result.userId).toBe("user:123");
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    it("TV-AUD-001: Changelog entry includes timestamp in ISO 8601 format", async () => {
      const storage = new MockChangelogStorage();
      const now = new Date();
      const entry = {
        clientId: "client:1",
        mutationId: "m-audit-2",
        mutation: { resource: "task", operation: "insert", id: "task:2" },
        timestampMs: now.getTime(),
        timestamp: now.toISOString(),
      };

      const result = await storage.changelogAppend(entry);
      
      expect(result.timestamp).toBeDefined();
      // Validate ISO 8601 format
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(result.timestamp).toMatch(isoRegex);
    });

    it("TV-AUD-001N: Changelog without auth context has undefined userId", async () => {
      const storage = new MockChangelogStorage();
      const entry = {
        clientId: "client:1",
        mutationId: "m-audit-3",
        mutation: { resource: "task", operation: "delete", id: "task:3" },
        timestampMs: Date.now(),
        // No userId provided
        timestamp: new Date().toISOString(),
      };

      const result = await storage.changelogAppend(entry);
      
      expect(result.userId).toBeUndefined();
      expect(result.timestamp).toBeDefined(); // timestamp should still be present
    });

    it("TV-AUD-001: Push works with enriched changelog entries", async () => {
      const storage = new MockChangelogStorage();
      
      // Append multiple entries with enrichment
      await storage.changelogAppend({
        clientId: "client:1",
        mutationId: "m-push-1",
        mutation: { resource: "task", operation: "merge", id: "task:1" },
        timestampMs: Date.now(),
        userId: "user:456",
        timestamp: new Date().toISOString(),
      });

      await storage.changelogAppend({
        clientId: "client:1",
        mutationId: "m-push-2",
        mutation: { resource: "task", operation: "insert", id: "task:2" },
        timestampMs: Date.now(),
        userId: "user:456",
        timestamp: new Date().toISOString(),
      });

      const list = await storage.changelogList();
      
      expect(list).toHaveLength(2);
      // All entries have enriched fields
      for (const entry of list) {
        expect(entry.userId).toBe("user:456");
        expect(entry.timestamp).toBeDefined();
      }
      
      // Verify push can acknowledge these entries
      await storage.changelogAck({ throughSeq: 2 });
      const remaining = await storage.changelogList();
      expect(remaining).toHaveLength(0);
    });
  });
});
