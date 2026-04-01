import { defineBackgroundHandler } from '@superfunctions/extfn';

export default defineBackgroundHandler({
  namespace: 'demo',
  method: 'sveltePing',
  handle: async () => ({
    ok: true,
    example: 'svelte-multi-content-demo',
  }),
});
