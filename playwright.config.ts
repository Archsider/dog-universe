import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const isCI = !!process.env.CI;

// Charge .env.test si présent (uniquement en local — en CI les vars sont injectées via secrets)
if (!isCI) {
  // Lazy require to avoid hard-failing if dotenv isn't installed (it ships with Next.js)
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });
  } catch {
    // dotenv absent ou .env.test manquant — on laisse les vars system prendre le relais
  }
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'github' : 'html',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
