import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5178',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    testTimeout: 30000,
  },

  projects: [
    // Chromium-only for CI speed. Firefox and webkit removed per research recommendation.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Note: webServer only starts Vite (port 5178), not Express.
  // E2E tests mock all Express API calls via page.route() so no backend is needed.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5178',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
