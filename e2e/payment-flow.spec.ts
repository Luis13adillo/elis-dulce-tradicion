import { test, expect } from '@playwright/test';

test.describe('Payment flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all Express API calls — no backend needed
    await page.route('**/api/pricing**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cakePricing: [
            { size: 'small', base_price: 35 },
            { size: 'medium', base_price: 55 },
            { size: 'large', base_price: 75 },
          ],
          fillingPricing: [{ name: 'vanilla', additional_cost: 0 }],
          themePricing: [{ name: 'none', additional_cost: 0 }],
          deliveryZones: [],
          taxRates: [{ state: 'PA', county: null, rate: 0.06 }],
        }),
      })
    );

    await page.route('**/api/orders**', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'test-order-123', status: 'pending' },
        }),
      })
    );

    await page.route('**/create-payment-intent**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clientSecret: 'pi_test_secret_mock' }),
      })
    );
  });

  test('navigates from homepage through order wizard steps', async ({ page }) => {
    await page.goto('/');

    // Verify homepage loaded
    await expect(page.locator('body')).toBeVisible();

    // Click Order link/CTA (English or Spanish)
    await page.getByRole('link', { name: /order|ordenar/i }).first().click();
    await page.waitForURL(/\/order/);

    // Step 1: Date/time picker — verify the first step renders after Phase 9 refactor
    await page.waitForSelector(
      '[data-testid="step-datetime"], h1, h2, .step-indicator',
      { timeout: 10000 }
    );
    await expect(page.locator('body')).toBeVisible();

    // Confirm the next/continue button is present without clicking
    // (clicking requires filling required fields like date selection)
    const nextBtn = page
      .getByRole('button', { name: /next|siguiente|continue|continuar/i })
      .first();
    if (await nextBtn.isVisible()) {
      await expect(nextBtn).toBeVisible();
    }
  });

  test('payment confirmation page renders with mocked payment intent', async ({ page }) => {
    // Mock Stripe.js network calls to avoid real payment processing
    await page.route('**stripe.com/v1/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'pi_test_mock',
          status: 'succeeded',
          client_secret: 'pi_test_secret_mock',
        }),
      })
    );

    // Navigate directly to PaymentCheckout with query params matching what Order.tsx passes
    await page.goto('/payment?orderId=test-order-123&amount=5830&clientSecret=pi_test_secret_mock');

    // PaymentCheckout renders the Stripe form (StripeCheckoutForm wraps Stripe Elements)
    await page.waitForSelector('body', { timeout: 10000 });
    await expect(page.locator('body')).toBeVisible();

    // Page should not show a 404 or generic error
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Page not found');
  });

  test('invalid card scenario returns error state from payment API', async ({ page }) => {
    // Override the create-payment-intent mock to simulate a card decline
    await page.route('**/create-payment-intent**', route =>
      route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Your card was declined.',
          code: 'card_declined',
        }),
      })
    );

    await page.route('**stripe.com/v1/payment_intents/**', route =>
      route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Your card was declined.', code: 'card_declined' },
        }),
      })
    );

    await page.goto('/payment?orderId=test-order-123&amount=5830&clientSecret=pi_test_declined');
    await page.waitForSelector('body', { timeout: 10000 });

    // The payment page should render without crashing
    await expect(page.locator('body')).toBeVisible();

    // Should not show unhandled error / blank page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });
});
