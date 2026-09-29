import { test, expect } from './fixtures';

test.describe('patient chart', () => {
  test('switches between chart tabs without a client-side error', async ({ loggedInPage: page }) => {
    await page.goto('/patients');
    const firstPatientLink = page.locator('table tbody tr a').first();
    await expect(firstPatientLink).toBeVisible({ timeout: 10_000 });
    await firstPatientLink.click();
    await expect(page.getByRole('tab', { name: 'Problems' })).toBeVisible({ timeout: 10_000 });

    // Exercise every tab a real clinician would click through during a visit — each one hits a
    // distinct backend endpoint (allergies, medications, notes, coverage), so this is a real smoke
    // test of the whole chart-tabs wiring, not just the default Problems view.
    for (const tabName of ['Medications', 'Allergies', 'Results', 'Notes', 'Coverage']) {
      await page.getByRole('tab', { name: tabName }).click();
      await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('data-state', 'active');
    }

    // A real runtime error boundary (e.g. Next.js's dev overlay) has this exact text; asserting its
    // absence catches a data-fetch or render bug in any of the tabs just exercised.
    await expect(page.getByText('Application error')).toHaveCount(0);
  });
});
