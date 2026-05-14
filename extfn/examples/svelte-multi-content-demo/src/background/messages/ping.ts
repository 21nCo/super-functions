import { defineBackgroundHandler } from 'extfn';

export default defineBackgroundHandler({
  namespace: 'demo',
  method: 'sveltePing',
  handle: async () => ({
    ok: true,
    example: 'svelte-multi-content-demo',
  }),
});
