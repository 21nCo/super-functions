import { describe, expect, it } from "vitest";
import { LruCache } from "../src/cache";

describe("LruCache", () => {
  it("evicts the least recently used entry when full", () => {
    const cache = new LruCache<string>({ maxEntries: 2 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.get("a");
    cache.set("c", "3");

    expect(cache.get("a")).toBe("1");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("3");

    const stats = cache.getStatistics();
    expect(stats.evictions).toBe(1);
  });
});
