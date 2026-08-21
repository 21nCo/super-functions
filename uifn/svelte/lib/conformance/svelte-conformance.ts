export const svelteConformance = Object.freeze({
  framework: 'svelte',
  runtime: 'svelte-5-runes',
  packageName: '@uifn/svelte',
  primitiveCount: 69,
  anatomyCount: 465,
  ownership: Object.freeze({
    state: '@uifn/core',
    dom: '@uifn/dom',
    translation: '@uifn/adapter-kit',
  }),
  conformanceSurface: 'actual-exported-public-compound-trees',
  traceSchemaVersion: 1,
  syntheticFixturesAccepted: false,
  contracts: Object.freeze([
    'typed-compounds',
    'reactive-controller-update',
    'snippets-and-actions',
    'ssr-hydration',
    'synchronous-cleanup',
    'packed-consumer',
  ]),
});
