import { build } from "esbuild";
import { Miniflare } from "miniflare";
const result = await build({
  stdin: {
    contents: `
    import { RateLimiter } from './plugfn/core/src/middleware/rate-limiter.ts';
    import { ExecutionCoordinator } from './plugfn/core/src/core/execution-coordinator.ts';
    import { cloudflareDurableObjectAtomicKVStore, SuperfunctionsStoresDurableObject } from './packages/db/src/adapters/cloudflare-do/index.ts';
    export { SuperfunctionsStoresDurableObject };
    export default { async fetch(request, env) {
      const store = cloudflareDurableObjectAtomicKVStore(env.STORES);
      if (new URL(request.url).pathname === '/quota') {
        const limiter = new RateLimiter({ atomicStore: store });
        const started = Date.now();
        try { await limiter.acquire('worker', { requests: 1, window: 300 }); return Response.json({ elapsed: Date.now() - started }); }
        finally { limiter.destroy(); }
      }
      const coordinator = new ExecutionCoordinator(store);
      try {
        const result = await coordinator.run('same-delivery', async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'completed';
        });
        return Response.json({ result });
      } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
    }};
  `,
    resolveDir: process.cwd(),
    sourcefile: "sfns4-worker.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "worker", "import"],
  external: ["node:*"],
});
const modules = [
  {
    type: "ESModule",
    path: "sfns4-worker.mjs",
    contents: result.outputFiles[0].text,
  },
];
const compatibility = {
  compatibilityDate: "2026-09-13",
  compatibilityFlags: ["nodejs_compat"],
};
const mf = new Miniflare({
  workers: [
    {
      name: "a",
      ...compatibility,
      modules,
      durableObjects: {
        STORES: {
          className: "SuperfunctionsStoresDurableObject",
          scriptName: "store",
        },
      },
    },
    {
      name: "b",
      ...compatibility,
      modules,
      durableObjects: {
        STORES: {
          className: "SuperfunctionsStoresDurableObject",
          scriptName: "store",
        },
      },
    },
    {
      name: "store",
      ...compatibility,
      modules,
      durableObjects: { STORES: "SuperfunctionsStoresDurableObject" },
    },
  ],
});
try {
  const a = await mf.getWorker("a");
  const b = await mf.getWorker("b");
  const attempts = await Promise.all([
    a.fetch("https://example.test/work"),
    b.fetch("https://example.test/work"),
  ]);
  const statuses = attempts.map((response) => response.status).sort();
  if (JSON.stringify(statuses) !== "[200,409]")
    throw new Error(`Coordinator admitted duplicate isolates: ${statuses}`);
  for (const response of attempts) await response.text();
  const quota = await Promise.all([
    a.fetch("https://example.test/quota"),
    b.fetch("https://example.test/quota"),
  ]);
  const delays = await Promise.all(quota.map((response) => response.json()));
  if (!delays.some((result) => result.elapsed >= 200))
    throw new Error(`Quota was not shared: ${JSON.stringify(delays)}`);
  console.log(
    "workerd: two isolates share Durable Object quotas and admit only one concurrent workflow writer",
  );
} finally {
  await mf.dispose();
}
