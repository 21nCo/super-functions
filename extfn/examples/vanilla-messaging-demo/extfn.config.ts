import { defineExtension } from 'extfn';

export default defineExtension({
  name: 'Vanilla Messaging Demo',
  version: '0.1.0',
  targets: ['chromium-mv3'],
  background: {
    serviceWorker: './src/background/index.ts',
    messageHandlersDir: './src/background/messages',
  },
  popup: {
    entry: './src/popup.html',
    title: 'Vanilla Demo',
  },
});
