import { defineConfig, devices } from '@playwright/test';

/**
 * First frontend E2E test infra in this repo (see README's former "no frontend automated tests"
 * known trim). Runs against a real dev stack, not mocks — `apps/api` (port 3000) and Postgres must
 * already be up with migrations + seed data applied (the same precondition `pnpm test:tenant-
 * isolation` has), since these tests log in as the real seeded `admin@tenant-a.test` account and
 * assert against real seeded data. `webServer` only starts this app's own dev server, not the
 * backend — CI wiring (spinning up the full stack non-interactively) is a follow-up decision, not
 * attempted here, since it touches the shared CI pipeline for the whole team.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3010',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
