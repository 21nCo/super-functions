import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const evidenceRoot = process.env.UIFN_PHASE11_BROWSER_OUTPUT
  ?? process.env.UIFN_PHASE10_BROWSER_OUTPUT
  ?? process.env.UIFN_PHASE09_BROWSER_OUTPUT
  ?? process.env.UIFN_PHASE08_BROWSER_OUTPUT
  ?? process.env.UIFN_PHASE07_BROWSER_OUTPUT
  ?? process.env.UIFN_PHASE05_BROWSER_OUTPUT
  ?? path.resolve('../../uifn/.conduct/evidence/phase-05/browser');

export default defineConfig({
  testDir: './browser',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  outputDir: path.join(evidenceRoot, 'artifacts'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(evidenceRoot, 'results.json') }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', testMatch: /(?:overlay|navigation|input|phase10)-primitives\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', testMatch: /(?:overlay|navigation|input|phase10)-primitives\.spec\.ts/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4175 --strictPort',
    cwd: path.resolve(__dirname),
    url: 'http://127.0.0.1:4175/browser/index.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
