import { expect, it, vi } from "vitest";
import { createMemoryAtomicKVStore } from "@superfunctions/db/adapters";
import { SecFnRateLimiter } from "../rate-limit.js";
import { MemoryAdapter } from "./memory-adapter.js";

it("requires explicit single-process persistence and enforces a shared CAS budget", async () => {
  const audit = { write: vi.fn() } as any;
  expect(() => new SecFnRateLimiter({ persistence: new MemoryAdapter() }, audit)).toThrow("atomicStore");
  const atomicStore = createMemoryAtomicKVStore();
  const config = { enabled: true, atomicStore, limits: { perIP: 1 } };
  const first = new SecFnRateLimiter(config, audit);
  const second = new SecFnRateLimiter(config, audit);
  const results = await Promise.all([first.check({ ip: "shared" }), second.check({ ip: "shared" })]);
  expect(results.filter(result => result.allowed)).toHaveLength(1);
});
