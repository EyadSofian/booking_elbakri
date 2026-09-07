import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration.
 *
 * Both languages and both form factors are first-class: Arabic RTL and a phone
 * viewport are where layout regressions actually surface, so they run as
 * projects rather than as an afterthought.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-en', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'desktop-ar',
      use: { ...devices['Desktop Chrome'], locale: 'ar-EG' },
    },
    { name: 'mobile-en', use: { ...devices['iPhone 13'] } },
    {
      name: 'mobile-ar',
      use: { ...devices['iPhone 13'], locale: 'ar-EG' },
    },
  ],
});
