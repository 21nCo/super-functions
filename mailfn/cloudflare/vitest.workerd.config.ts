import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['src/**/*.workerd.test.ts'],
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        main: './src/entrypoint.ts',
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: '2025-11-13',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            MAILFN_DOMAIN: 'inbound.example.com',
            MAILFN_SECRET_KEY: '11'.repeat(32),
            MAILFN_PUBLIC_PLATFORM_ENABLED: 'false',
          },
          d1Databases: ['MAILFN_DB'],
          r2Buckets: ['MAILFN_OBJECTS'],
          queueProducers: {
            MAILFN_PARSE_QUEUE: 'mailfn-parse',
            MAILFN_WEBHOOK_QUEUE: 'mailfn-webhook',
          },
          queueConsumers: {
            'mailfn-parse': { maxBatchSize: 10, maxRetries: 5, deadLetterQueue: 'mailfn-parse-dlq' },
            'mailfn-webhook': { maxBatchSize: 10, maxRetries: 5, deadLetterQueue: 'mailfn-webhook-dlq' },
          },
        },
      },
    },
  },
});
