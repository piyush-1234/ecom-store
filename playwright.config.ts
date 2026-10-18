import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * Runs against an ALREADY-RUNNING server rather than starting one, because this
 * environment cannot reliably kill stale servers (see BLOCKERS BLK-012). Point it
 * at whichever port serves the current build:
 *
 *   E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test
 *
 * Browsers are installed into a workspace path (not the system profile):
 *   PLAYWRIGHT_BROWSERS_PATH=<workspace>/.cache/ms-playwright npx playwright install chromium
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  // Orders and carts are shared state; serial execution keeps runs deterministic.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Storefront is mobile-first; a phone viewport catches more layout regressions.
    ...devices['Pixel 5'],
  },

  projects: [{ name: 'chromium', use: { ...devices['Pixel 5'], browserName: 'chromium' } }],
});
