import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    edge: 'src/edge.ts',
    'adapters/connected-mailbox': 'src/email/connected-mailbox-adapter.ts',
    'adapters/meta-whatsapp': 'src/whatsapp/meta-cloud-adapter.ts',
    'adapters/apns': 'src/push/apns.ts',
    'adapters/fcm': 'src/push/fcm.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
