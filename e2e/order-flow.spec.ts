import { test, expect } from '@playwright/test';

test.describe('Order flow', () => {
  test('homepage loads with order link', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();

    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/eli|bakery|dulce/i);

    const orderLink = page.getByRole('link', { name: /order|ordenar/i });
    await expect(orderLink.first()).toBeVisible();
  });

  test('order page step 1 renders with pricing mocked', async ({ page }) => {
    // Mock pricing API so no running Express backend is needed
    await page.route('**/api/pricing**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cakePricing: [],
          fillingPricing: [],
          themePricing: [],
          deliveryZones: [],
          taxRates: [],
        }),
      })
    );

    await page.goto('/order');

    // The order wizard uses step components after Phase 9 refactor.
    // Wait for any of the expected step-1 selectors.
    await page.waitForSelector(
      '[data-testid="step-datetime"], h1, h2, .step-indicator',
      { timeout: 10000 }
    );

    await expect(page.locator('body')).toBeVisible();
  });
});
