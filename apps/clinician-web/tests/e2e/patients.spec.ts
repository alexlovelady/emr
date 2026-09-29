import { test, expect } from './fixtures';

test.describe('patients list', () => {
  test('lists patients and searches server-side by name', async ({ loggedInPage: page }) => {
    await page.goto('/patients');
    await expect(page.getByRole('heading', { name: 'Patients' })).toBeVisible();

    // The seeded tenant has 100+ patients — assert the table actually renders rows, not just the
    // page chrome, so a broken backend fetch (empty table, or an unhandled error boundary) fails
    // this test instead of silently passing.
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    // A search for a string unlikely to match anything real should filter the table down —
    // proves the search box drives a real server-side query, not a no-op.
    await page.getByPlaceholder(/search by name or date of birth/i).fill('zzz-no-such-patient-zzz');
    await expect(page).toHaveURL(/search=/, { timeout: 5_000 });
    await expect(page.getByText(/no patients match your search/i)).toBeVisible({ timeout: 10_000 });
  });

  test('opens a patient chart from the list', async ({ loggedInPage: page }) => {
    await page.goto('/patients');
    const firstPatientLink = page.locator('table tbody tr a').first();
    await expect(firstPatientLink).toBeVisible({ timeout: 10_000 });
    await firstPatientLink.click();

    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
    // The chart's tab strip is the clearest signal the patient-chart page (not an error page)
    // rendered — Problems is always the first, default-selected tab.
    await expect(page.getByRole('tab', { name: 'Problems' })).toBeVisible({ timeout: 10_000 });
  });
});
