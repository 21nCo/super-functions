import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'authfn/core',
        replacement: fileURLToPath(new URL('./src/core', import.meta.url))
      },
      {
        find: 'authfn/http',
        replacement: fileURLToPath(new URL('./src/http', import.meta.url))
      },
      {
        find: /^authfn$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/api-keys',
        replacement: fileURLToPath(new URL('../api-keys/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/client',
        replacement: fileURLToPath(new URL('../client/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/email-otp',
        replacement: fileURLToPath(new URL('../email-otp/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/multi-region',
        replacement: fileURLToPath(new URL('../multi-region/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/native-handoff',
        replacement: fileURLToPath(new URL('../native-handoff/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/password',
        replacement: fileURLToPath(new URL('../password/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/social-oauth',
        replacement: fileURLToPath(new URL('../social-oauth/src/index.ts', import.meta.url))
      },
      {
        find: '@authfn/two-factor',
        replacement: fileURLToPath(new URL('../two-factor/src/index.ts', import.meta.url))
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']
  }
});
