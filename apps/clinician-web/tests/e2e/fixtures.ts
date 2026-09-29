import { test as base, expect, type Page } from '@playwright/test';

/** The seeded dev tenant/admin — same credentials used throughout this repo's manual verification
 * passes (packages/db/src/seed-fixtures.ts's DEV_PASSWORD). Real login against the real backend,
 * not a mocked session. */
export const SEEDED_TENANT_SLUG = 'tenant-a';
export const SEEDED_ADMIN_EMAIL = 'admin@tenant-a.test';
export const SEEDED_ADMIN_PASSWORD = 'Dev-Passw0rd!';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Organization').fill(SEEDED_TENANT_SLUG);
  await page.getByLabel('Email').fill(SEEDED_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEEDED_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 });
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
