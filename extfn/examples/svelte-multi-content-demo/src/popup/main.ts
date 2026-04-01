import { createRuntime } from '@superfunctions/extfn/runtime';
import { mountSveltePage } from '@superfunctions/extfn-svelte';

import PopupApp from './App.svelte';

const runtime = createRuntime({
  globals: globalThis as never,
  rawBrowser:
    (globalThis as { browser?: unknown; chrome?: unknown }).browser ??
    (globalThis as { browser?: unknown; chrome?: unknown }).chrome ??
    {},
  target: 'chromium-mv3',
});

mountSveltePage(PopupApp, {
  props: {
    capabilities: runtime.capabilities,
    target: runtime.capabilities.target,
  },
});
