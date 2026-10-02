import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173/spotless/', serviceWorkers: 'allow' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:4173/spotless/', reuseExistingServer: false },
});
