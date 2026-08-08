import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173/strzala/',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/strzala/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      // iPad landscape
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1024, height: 768 } },
    },
  ],
});
