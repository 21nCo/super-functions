import { defineBackgroundHandler } from 'extfn';

export default defineBackgroundHandler({
  namespace: 'demo',
  method: 'ping',
  handle: async () => ({
    ok: true,
    source: 'vanilla-messaging-demo',
  }),
});
