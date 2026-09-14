import { builtinModules } from "node:module";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
const result = await build({
  stdin: {
    contents: `
    import { Hono } from 'hono';
    import { LangFn } from 'langfn';
    import { memoryAdapter } from '@superfunctions/db/adapters/memory';
    import { createSecFnServer } from '@secfn/server';
    import { createStaticKeyProvider, encryptSecret, decryptSecret } from '@secfn/core';
    import { memoryfn, MemoryStorageAdapter } from '@memoryfn/core';
    const app = new Hono();
    app.get('/check', async c => {
      const completion = await new LangFn({ model: 'mock' }).complete('worker trace');
      if (!completion.traceId) throw new Error('Worker trace ID missing');
      const keys = createStaticKeyProvider(new Uint8Array(32).fill(7), 'test');
      const encrypted = await encryptSecret('worker-test', keys, 'tenant-a');
      if (await decryptSecret(encrypted, keys, 'tenant-a') !== 'worker-test') throw new Error('Encryption mismatch');
      let denied = false;
      try { await decryptSecret(encrypted, keys, 'tenant-b'); } catch { denied = true; }
      if (!denied) throw new Error('Encryption AAD mismatch accepted');
      const sec = createSecFnServer({ db: memoryAdapter(), keyProvider: keys });
      const unauthorized = await sec.router.handle(new Request('https://test/secfn/admin/secrets'));
      if (unauthorized.status !== 403) throw new Error('Admin route did not deny missing authorization');
      const memory = memoryfn({ storage: { kind: 'adapter', adapter: new MemoryStorageAdapter() } });
      const added = await memory.add({ tenantId: 'tenant-a', containerTags: [], content: 'worker-memory' });
      await memory.forget({ tenantId: 'tenant-a', containerTags: [], id: added.memories[0].id });
      await memory.close();
      return c.json({ ok: true });
    });
    export default app;
  `,
    resolveDir: process.cwd(),
    loader: "ts",
    sourcefile: "sfns4-platform.ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "worker", "browser", "import"],
  mainFields: ["browser", "module", "main"],
  external: ["node:*"],
  plugins: [
    {
      name: "node-compat-prefix",
      setup(build) {
        build.onResolve({ filter: /^[a-z_]+(?:\/[a-z_]+)?$/ }, (args) =>
          builtinModules.includes(args.path)
            ? { path: `node:${args.path}`, external: true }
            : undefined,
        );
      },
    },
  ],
});
const mf = new Miniflare({
  modules: [
    {
      type: "ESModule",
      path: "sfns4-platform.mjs",
      contents: result.outputFiles[0].text,
    },
  ],
  compatibilityDate: "2026-09-13",
  compatibilityFlags: ["nodejs_compat"],
});
try {
  const response = await mf.dispatchFetch("https://example.test/check");
  if (response.status !== 200 || !(await response.json()).ok)
    throw new Error(`Platform Worker failed: ${response.status}`);
  console.log(
    "workerd: LangFn mock trace, Hono, SecFn encryption/AAD/admin denial and injected MemoryFn lifecycle passed",
  );
} finally {
  await mf.dispose();
}
