import { expect, it, vi } from "vitest";
import { createMemoryAtomicKVStore } from "@superfunctions/db/adapters";
import { SecFnRateLimiter } from "../rate-limit.js";
import { MemoryAdapter } from "./memory-adapter.js";

it("requires explicit single-process persistence and enforces a shared CAS budget", async () => {
  const audit = { write: vi.fn() } as any;
  expect(
    () => new SecFnRateLimiter({ persistence: new MemoryAdapter() }, audit),
  ).toThrow("atomicStore");
  const atomicStore = createMemoryAtomicKVStore();
  const config = { enabled: true, atomicStore, limits: { perIP: 1 } };
  const first = new SecFnRateLimiter(config, audit);
  const second = new SecFnRateLimiter(config, audit);
  const results = await Promise.all([
    first.check({ ip: "shared" }),
    second.check({ ip: "shared" }),
  ]);
  expect(results.filter((result) => result.allowed)).toHaveLength(1);
});

it.each([false, true])(
  "does not charge broad quotas for an exhausted endpoint (atomic=%s)",
  async (shared) => {
    const limiter = new SecFnRateLimiter(
      {
        enabled: true,
        algorithm: "fixed-window",
        windowMs: 60000,
        ...(shared ? { atomicStore: createMemoryAtomicKVStore() } : {}),
        limits: { perIP: 3, perUser: 3, perEndpoint: 1 },
      },
      { write: vi.fn() } as any,
    );
    const input = { ip: "ip", userId: "user", endpoint: "one" };
    expect((await limiter.check(input)).allowed).toBe(true);
    for (let i = 0; i < 5; i++)
      expect(await limiter.check(input)).toMatchObject({
        allowed: false,
        scope: "endpoint",
      });
    expect((await limiter.check({ ...input, endpoint: "two" })).allowed).toBe(
      true,
    );
    expect((await limiter.check({ ...input, endpoint: "three" })).allowed).toBe(
      true,
    );
    expect((await limiter.check({ ...input, endpoint: "four" })).allowed).toBe(
      false,
    );
  },
);
