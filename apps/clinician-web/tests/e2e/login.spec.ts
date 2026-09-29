import { test, expect, SEEDED_TENANT_SLUG, SEEDED_ADMIN_EMAIL, SEEDED_ADMIN_PASSWORD } from './fixtures';

test.describe('login', () => {
  test('signs in with the seeded admin account and lands on an authenticated page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Organization').fill(SEEDED_TENANT_SLUG);
    await page.getByLabel('Email').fill(SEEDED_ADMIN_EMAIL);
    await page.getByLabel('Password').fill(SEEDED_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();
  });

  test('rejects a wrong password with an error, and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Organization').fill(SEEDED_TENANT_SLUG);
    await page.getByLabel('Email').fill(SEEDED_ADMIN_EMAIL);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/invalid email\/password/i)).toBeVisible({ timeout: 10_000 });
  });
});
