import { defineBackgroundHandler } from '@extfn/core';

export default defineBackgroundHandler({
  namespace: 'demo',
  method: 'sveltePing',
  handle: async () => ({
    ok: true,
    example: 'svelte-multi-content-demo',
  }),
});
