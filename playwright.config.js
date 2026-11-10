import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start vite preview before tests
  webServer: {
    command: 'npx vite preview --port 4173 --host 0.0.0.0',
    url: 'https://localhost:4173',
    reuseExistingServer: true,
    timeout: 15000,
    ignoreHTTPSErrors: true,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
});
