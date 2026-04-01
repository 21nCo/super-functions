import { createRuntime } from '@superfunctions/extfn/runtime';

const runtime = createRuntime({
  globals: globalThis as never,
  rawBrowser:
    (globalThis as { browser?: unknown; chrome?: unknown }).browser ??
    (globalThis as { browser?: unknown; chrome?: unknown }).chrome ??
    {},
  target: 'chromium-mv3',
  requestHandlers: [
    {
      namespace: 'demo',
      method: 'ping',
      handle: async () => ({
        ok: true,
        via: 'popup-local-handler',
      }),
    },
  ],
});

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const state = JSON.stringify(
    {
      capabilities: runtime.capabilities,
      context: runtime.address.context,
      hasRawBrowser:
        runtime.browser.raw !== null && typeof runtime.browser.raw === 'object',
    },
    null,
    2
  );

  app.innerHTML = `
    <section>
      <h1>Vanilla Messaging Demo</h1>
      <p>Core runtime and browser facade stay framework-agnostic.</p>
      <pre>${state}</pre>
    </section>
  `;
}
