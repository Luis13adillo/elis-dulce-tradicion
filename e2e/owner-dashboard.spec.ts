import { test, expect } from '@playwright/test';

const ownerEmail = process.env.TEST_OWNER_EMAIL ?? 'owner@elisbakery.com';
const ownerPass = process.env.TEST_OWNER_PASSWORD ?? 'ElisBakery123';
const frontDeskEmail = process.env.TEST_FRONTDESK_EMAIL ?? 'orders@elisbakery.com';
const frontDeskPass = process.env.TEST_FRONTDESK_PASSWORD ?? 'OrdersElisBakery123';

test.describe('Owner Dashboard login', () => {
  test.use({ storageState: undefined });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto('/login');
  });

  test('owner login redirects to /owner-dashboard', async ({ page }) => {
    await page.fill('#email', ownerEmail);
    await page.fill('input[type="password"]', ownerPass);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/owner-dashboard/, { timeout: 15000 });

    await expect(page.locator('body')).toBeVisible();
  });

  test('front desk login redirects to /front-desk', async ({ page }) => {
    await page.fill('#email', frontDeskEmail);
    await page.fill('input[type="password"]', frontDeskPass);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/front-desk/, { timeout: 15000 });

    await expect(page.locator('body')).toBeVisible();
  });
});
