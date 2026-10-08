import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/entrypoint.ts",
      miniflare: {
        compatibilityDate: "2025-11-13",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          MAILFN_DOMAIN: "inbound.example.com",
          MAILFN_SECRET_KEY: "11".repeat(32),
          MAILFN_PUBLIC_PLATFORM_ENABLED: "false",
        },
        d1Databases: ["MAILFN_DB"],
        r2Buckets: ["MAILFN_OBJECTS"],
        queueProducers: {
          MAILFN_PARSE_QUEUE: "mailfn-parse",
          MAILFN_WEBHOOK_QUEUE: "mailfn-webhook",
        },
        queueConsumers: {
          "mailfn-parse": {
            maxBatchSize: 10,
            maxRetries: 5,
            deadLetterQueue: "mailfn-parse-dlq",
          },
          "mailfn-webhook": {
            maxBatchSize: 10,
            maxRetries: 5,
            deadLetterQueue: "mailfn-webhook-dlq",
          },
        },
      },
    }),
  ],
  test: {
    include: ["src/**/*.workerd.test.ts"],
    fileParallelism: false,
    // Bundle the sanitizer's CommonJS dependency graph before loading it in workerd.
    deps: { optimizer: { ssr: { enabled: true, include: ["sanitize-html"] } } },
  },
});
