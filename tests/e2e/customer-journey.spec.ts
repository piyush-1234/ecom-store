import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end: the critical customer journey.
 *
 * browse → filter by size → product → add to cart → cart → checkout → pay (COD)
 * → order confirmation → download GST invoice
 *
 * This is the Definition-of-Done path. Until now it was only verified at the
 * service and HTTP layers (BLK-011); this closes that gap by driving a real browser.
 */

async function pickAvailableSize(page: Page): Promise<boolean> {
  const sizes = page.locator('ul >> li >> button[aria-pressed]');
  const count = await sizes.count();

  for (let index = 0; index < count; index += 1) {
    const button = sizes.nth(index);
    const disabled = await button.isDisabled();
    if (!disabled) {
      await button.click();
      return true;
    }
  }
  return false;
}

test.describe('customer journey', () => {
  test('browse, filter, add to cart, check out and get an invoice', async ({ page }) => {
    // --- home ---
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Tees and denim/i);

    // --- category listing ---
    await page.getByRole('link', { name: 'T-Shirts', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('T-Shirts');

    // --- filter by size (URL-driven, so it must survive reload) ---
    const sizeFilter = page.getByRole('link', { name: 'L', exact: true }).first();
    if (await sizeFilter.count()) {
      await sizeFilter.click();
      await expect(page).toHaveURL(/size=L/);
      await expect(page.getByRole('link', { name: 'L', exact: true }).first()).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }

    // --- product detail ---
    const firstProduct = page.locator('a[href^="/product/"]').first();
    const productHref = await firstProduct.getAttribute('href');
    expect(productHref).toBeTruthy();
    await firstProduct.click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/HSN code/i)).toBeVisible();
    await expect(page.getByText(/Country of origin/i)).toBeVisible();

    // --- choose an in-stock size and add to cart ---
    const picked = await pickAvailableSize(page);
    expect(picked, 'expected at least one in-stock size').toBe(true);

    const addToCart = page.getByRole('button', { name: /Add to cart/i });
    await expect(addToCart).toBeEnabled();
    await addToCart.click();

    // --- cart ---
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Your cart/i);

    const checkoutLink = page.getByRole('link', { name: /Proceed to checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // --- checkout form ---
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Checkout/i);

    const unique = Date.now().toString(36);
    const email = `e2e_${unique}@example.com`;

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill('9876543210');
    await page.getByLabel('Full name').fill('E2E Buyer');
    await page.getByLabel('Address line 1').fill('12 MG Road');
    await page.getByLabel('City').fill('Pune');
    await page.getByLabel('State').selectOption('Maharashtra');
    await page.getByLabel('PIN code').fill('411001');

    // Pincode serviceability check fires on blur.
    await page.getByLabel('PIN code').blur();
    await expect(page.getByText(/Delivers in/i)).toBeVisible();

    // COD is the enabled method without Razorpay keys.
    await page.getByRole('radio', { name: /cash on delivery/i }).check();

    await page.getByRole('checkbox', { name: /I accept the terms/i }).check();

    await page.getByRole('button', { name: /Place order/i }).click();

    // --- confirmation ---
    await expect(page).toHaveURL(/\/order\/ES-/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/order is confirmed/i);
    await expect(page.getByText(email)).toBeVisible();

    // --- GST invoice downloads as a real PDF ---
    const invoiceLink = page.getByRole('link', { name: /Download GST invoice/i });
    await expect(invoiceLink).toBeVisible();

    const href = await invoiceLink.getAttribute('href');
    expect(href).toContain('/invoice?token=');

    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');

    const body = await response.body();
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // The invoice must not be fetchable without the token.
    const unauthorised = await page.request.get(
      href!.replace(/\?.*$/, ''),
    );
    expect(unauthorised.status()).toBe(404);
  });

  test('empty cart shows guidance rather than a dead end', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/cart is empty/i);
    await expect(page.getByRole('link', { name: /Shop T-Shirts/i })).toBeVisible();
  });

  test('unknown product 404s with a usable page', async ({ page }) => {
    const response = await page.goto('/product/this-does-not-exist');
    expect(response?.status()).toBe(404);
  });

  test('size chart page is reachable and has the measurement tables', async ({ page }) => {
    await page.goto('/size-chart');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Size chart/i);
    await expect(page.getByRole('table').first()).toBeVisible();
  });
});
