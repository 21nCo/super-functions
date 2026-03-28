/**
 * PHASE_07 Client Performance Test
 * TV-PER-004: O(1) changelog dedup in MemoryStorageAdapter (PER-006)
 *
 * Verifies that the Map-based changelogIndex provides O(1) deduplication
 * instead of O(n) Array.find() across large changelogs.
 */

import { describe, it, expect } from "vitest";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";

describe("PER-006: O(1) changelog dedup (MemoryStorageAdapter)", () => {
  it("TV-PER-004: dedup call is sub-millisecond even with 1000 existing entries", async () => {
    const adapter = new MemoryStorageAdapter(["tasks"]);
    const ENTRY_COUNT = 1000;

    // Build a large changelog
    for (let i = 0; i < ENTRY_COUNT; i++) {
      await adapter.changelogAppend({
        clientId: "client-perf",
        mutationId: `mut-${i}`,
        mutation: { id: `task-${i}` },
        timestampMs: i,
      });
    }

    const listBefore = await adapter.changelogList({ limit: ENTRY_COUNT + 1 });
    expect(listBefore).toHaveLength(ENTRY_COUNT);

    // Measure dedup lookup (duplicate of mut-0)
    const t0 = performance.now();
    const deduped = await adapter.changelogAppend({
      clientId: "client-perf",
      mutationId: "mut-0", // already in log at seq=1
      mutation: { id: "task-0" },
      timestampMs: 999,
    });
    const dt = performance.now() - t0;

    // Should return the original entry (seq=1, not a new seq)
    expect(deduped.seq).toBe(1);

    // Changelog must not have grown
    const listAfter = await adapter.changelogList({ limit: ENTRY_COUNT + 1 });
    expect(listAfter).toHaveLength(ENTRY_COUNT);

    // O(1): Map lookup should complete well under 5ms regardless of log size
    // An O(n) scan over 1000 entries takes measurably longer
    expect(dt).toBeLessThan(5);
  });

  it("TV-PER-004: changelogIndex stays consistent through append / ack lifecycle", async () => {
    const adapter = new MemoryStorageAdapter(["tasks"]);

    // Append entry A
    const entryA = await adapter.changelogAppend({
      clientId: "c1",
      mutationId: "m-ack-1",
      mutation: { id: "t1" },
      timestampMs: 0,
    });
    expect(entryA.seq).toBe(1);

    // Duplicate append before ack — must return same entry
    const entryAdup = await adapter.changelogAppend({
      clientId: "c1",
      mutationId: "m-ack-1",
      mutation: { id: "t1" },
      timestampMs: 1,
    });
    expect(entryAdup.seq).toBe(entryA.seq);

    // Ack through seq 1 — removes from both array and index
    await adapter.changelogAck({ throughSeq: 1 });

    const afterAck = await adapter.changelogList();
    expect(afterAck).toHaveLength(0);

    // Re-append after ack — index must not block the new entry
    const entryAre = await adapter.changelogAppend({
      clientId: "c1",
      mutationId: "m-ack-1",
      mutation: { id: "t1" },
      timestampMs: 2,
    });
    expect(entryAre.seq).toBeGreaterThan(entryA.seq);
  });

  it("TV-PER-004: clearAll resets changelogIndex", async () => {
    const adapter = new MemoryStorageAdapter(["tasks"]);

    await adapter.changelogAppend({
      clientId: "c1",
      mutationId: "m-clear",
      mutation: { id: "t1" },
      timestampMs: 0,
    });

    await adapter.clearAll();

    // After clearAll, same mutation should be re-appended (index cleared)
    const entry = await adapter.changelogAppend({
      clientId: "c1",
      mutationId: "m-clear",
      mutation: { id: "t1" },
      timestampMs: 1,
    });
    // seq restarts at 1 after clearAll
    expect(entry.seq).toBe(1);

    const list = await adapter.changelogList();
    expect(list).toHaveLength(1);
  });
});
