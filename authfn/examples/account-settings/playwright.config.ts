import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4013',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'npm --prefix ./server run start:test',
      url: 'http://127.0.0.1:4313/health',
      env: {
        AUTHFN_TWO_FACTOR_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
      },
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: 'npm --prefix ./client run preview:test',
      url: 'http://127.0.0.1:4013',
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
